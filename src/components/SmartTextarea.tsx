import React, { useEffect, useMemo, useRef, useState } from "react";
import { macroPersonalService, macroHospitalService } from "../services/macroService";

interface QuickTextItem {
    id: string;
    shortcut?: string;
    label: string;
    content: string;
}

interface SmartTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const MAX_VISIBLE_SUGGESTIONS = 8;

function normalizePhraseSearch(value: string) {
    return value.replace(/\s+/g, "").trim().toLowerCase();
}

function isPrefixMatch(source: string, query: string) {
    const normalizedSource = normalizePhraseSearch(source);
    const normalizedQuery = normalizePhraseSearch(query);
    if (!normalizedQuery) return true;
    return normalizedSource.startsWith(normalizedQuery);
}

function getActiveSlashCommand(value: string, cursorPosition: number) {
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
    if (lastSlashIndex === -1) return null;

    const commandText = textBeforeCursor.substring(lastSlashIndex + 1);
    if (/\s/.test(commandText)) return null;

    return {
        slashIndex: lastSlashIndex,
        query: commandText,
    };
}

export default function SmartTextarea(props: SmartTextareaProps) {
    const [quickTexts, setQuickTexts] = useState<QuickTextItem[]>([]);
    const loadedRef = useRef(false);

    useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;

        Promise.all([
            macroPersonalService.getAll({ isActive: true }).catch(() => ({ items: [] })),
            macroHospitalService.getAll({ isActive: true }).catch(() => ({ items: [] })),
        ]).then(([personal, hospital]) => {
            const items: QuickTextItem[] = [
                ...personal.items.map((m) => ({
                    id: String(m.id),
                    shortcut: m.macro,
                    label: m.title || "",
                    content: m.contents || "",
                })),
                ...hospital.items.map((m) => ({
                    id: String(m.id),
                    shortcut: m.macro,
                    label: m.title || "",
                    content: m.contents || "",
                })),
            ];
            setQuickTexts(items);
        });
    }, []);

    const [value, setValue] = useState(props.defaultValue?.toString() || "");
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeQuery, setActiveQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [cursorPosition, setCursorPosition] = useState({ top: 0, left: 0 });
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const filteredQuickTexts = useMemo(() => {
        const query = activeQuery.trim();
        if (!query) {
            return quickTexts.slice(0, MAX_VISIBLE_SUGGESTIONS);
        }

        return quickTexts
            .filter((item) =>
                isPrefixMatch(item.label || "", query) ||
                isPrefixMatch(item.content || "", query) ||
                isPrefixMatch((item.shortcut || "").replace(/^\//, ""), query)
            )
            .slice(0, MAX_VISIBLE_SUGGESTIONS);
    }, [activeQuery, quickTexts]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredQuickTexts]);

    useEffect(() => {
        if (props.value !== undefined) {
            setValue(props.value.toString());
        }
    }, [props.value]);

    useEffect(() => {
        if (!showDropdown || !listRef.current) return;
        const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
        if (activeEl) {
            activeEl.scrollIntoView({ block: "nearest" });
        }
    }, [selectedIndex, showDropdown]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showDropdown && filteredQuickTexts.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % filteredQuickTexts.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + filteredQuickTexts.length) % filteredQuickTexts.length);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                const selected = filteredQuickTexts[selectedIndex];
                if (selected) handleSelect(selected);
                return;
            }
        }

        if (showDropdown && e.key === "Escape") {
            setShowDropdown(false);
            setActiveQuery("");
        }

        props.onKeyDown?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextValue = e.target.value;
        const selectionStart = e.target.selectionStart;

        setValue(nextValue);

        const activeSlashCommand = getActiveSlashCommand(nextValue, selectionStart);
        if (activeSlashCommand) {
            const { top, left } = getCaretCoordinates(e.target, selectionStart);
            setCursorPosition({ top: top + 20, left });
            setActiveQuery(activeSlashCommand.query);
            setShowDropdown(true);
        } else {
            setActiveQuery("");
            setShowDropdown(false);
        }

        props.onChange?.(e);
    };

    const handleSelect = (item: QuickTextItem) => {
        const selectionStart = textareaRef.current?.selectionStart || 0;
        const activeSlashCommand = getActiveSlashCommand(value, selectionStart);
        if (!activeSlashCommand) return;

        const newValue =
            value.substring(0, activeSlashCommand.slashIndex) +
            item.content +
            value.substring(selectionStart);

        setValue(newValue);
        setActiveQuery("");
        setShowDropdown(false);

        setTimeout(() => {
            if (!textareaRef.current) return;
            textareaRef.current.focus();
            const newCursorPosition = activeSlashCommand.slashIndex + item.content.length;
            textareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        }, 0);
    };

    const getCaretCoordinates = (element: HTMLTextAreaElement, position: number) => {
        const mirror = document.createElement("div");
        const style = getComputedStyle(element);

        mirror.style.position = "absolute";
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.visibility = "hidden";
        mirror.style.left = "-9999px";
        mirror.style.font = style.font;
        mirror.style.padding = style.padding;
        mirror.style.border = style.border;
        mirror.style.lineHeight = style.lineHeight;
        mirror.style.width = style.width;
        mirror.style.height = style.height;
        mirror.style.overflow = "hidden";
        mirror.style.wordWrap = "break-word";

        mirror.textContent = element.value.substring(0, position);

        const span = document.createElement("span");
        span.textContent = element.value.substring(position) || ".";
        mirror.appendChild(span);

        document.body.appendChild(mirror);

        const coordinates = {
            top: span.offsetTop,
            left: span.offsetLeft,
        };

        document.body.removeChild(mirror);
        return coordinates;
    };

    return (
        <div className="relative flex h-full w-full flex-1 flex-col">
            <textarea
                {...props}
                defaultValue={undefined}
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                className={`${props.className} h-full`}
            />

            {showDropdown && (
                <div
                    className="absolute z-50 w-72 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-100"
                    style={{
                        top: cursorPosition.top,
                        left: Math.min(cursorPosition.left, 200),
                    }}
                >
                    <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500">
                        자주쓰는 문구 <span className="font-normal text-gray-400 ml-1">↑↓ 선택 · Enter 입력</span>
                    </div>
                    <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
                        {filteredQuickTexts.length > 0 ? (
                            filteredQuickTexts.map((item, index) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    data-index={index}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleSelect(item)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`group block w-full px-3 py-2 text-left transition-colors ${
                                        index === selectedIndex ? "bg-[#E8EAF6]" : "hover:bg-gray-50"
                                    }`}
                                >
                                    <div className="mb-0.5 flex items-center gap-2">
                                        <span className="truncate text-sm font-bold text-gray-900">
                                            {item.label || "(제목 없음)"}
                                        </span>
                                        {item.shortcut && item.shortcut !== "/" && (
                                            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
                                                {item.shortcut}
                                            </span>
                                        )}
                                    </div>
                                    <div className="truncate text-xs text-gray-500 group-hover:text-blue-600">
                                        {item.content}
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="px-3 py-3 text-xs text-gray-400">
                                {activeQuery
                                    ? `/${activeQuery}로 시작하는 문구가 없습니다.`
                                    : "등록된 자주쓰는 문구가 없습니다."}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

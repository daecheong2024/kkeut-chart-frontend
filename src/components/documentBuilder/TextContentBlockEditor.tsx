import { BlockCard } from "./BlockCard";
import type { TextContentBlock, TextSize, TextWeight, TextColor } from "../../types/documentationBuilder";
import { textContentStyleClass } from "../../types/documentationBuilder";

interface Props {
    block: TextContentBlock;
    onChange: (next: TextContentBlock) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

const SIZE_OPTIONS: Array<{ value: TextSize; label: string }> = [
    { value: "sm", label: "작게" },
    { value: "base", label: "보통" },
    { value: "lg", label: "크게" },
];

const COLOR_OPTIONS: Array<{ value: TextColor; label: string; swatch: string }> = [
    { value: "default", label: "기본", swatch: "#2A1F22" },
    { value: "muted", label: "회색", swatch: "#8B5A66" },
    { value: "primary", label: "와인", swatch: "#8B3F50" },
    { value: "danger", label: "강조(빨강)", swatch: "#C53030" },
];

export function TextContentBlockEditor({ block, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: Props) {
    const fontSize = block.fontSize ?? "base";
    const fontWeight = block.fontWeight ?? "normal";
    const color = block.color ?? "default";

    return (
        <BlockCard
            typeLabel="안내 문구"
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            showRequiredToggle={false}
            required={block.required}
            onRequiredChange={(required) => onChange({ ...block, required })}
        >
            <input
                type="text"
                value={block.title}
                onChange={(e) => onChange({ ...block, title: e.target.value })}
                placeholder="제목 (예: 시술 안내)"
                className="w-full text-[15px] font-extrabold text-[#2A1F22] placeholder:text-[#C9A0A8] placeholder:font-medium bg-transparent border-0 outline-none mb-2.5"
            />

            {/* Style toolbar */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Size */}
                <div className="inline-flex items-center rounded-lg bg-[#FCF7F8] border border-[#F8DCE2] p-0.5">
                    {SIZE_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange({ ...block, fontSize: opt.value })}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                                fontSize === opt.value ? "bg-white text-[#8B3F50] shadow-sm" : "text-[#8B5A66] hover:text-[#5C2A35]"
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Weight */}
                <button
                    type="button"
                    onClick={() => onChange({ ...block, fontWeight: fontWeight === "bold" ? "normal" : "bold" })}
                    className={`px-2 py-1 rounded-md text-[10px] font-extrabold border transition-all ${
                        fontWeight === "bold"
                            ? "border-[#D27A8C] bg-[#FCEBEF] text-[#8B3F50]"
                            : "border-[#F8DCE2] bg-white text-[#8B5A66] hover:border-[#D27A8C]/50"
                    }`}
                    title="굵게"
                >
                    B
                </button>

                {/* Color */}
                <div className="inline-flex items-center gap-1 rounded-lg bg-[#FCF7F8] border border-[#F8DCE2] px-1.5 py-0.5">
                    <span className="text-[9px] font-bold text-[#8B5A66] mr-0.5">색상</span>
                    {COLOR_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange({ ...block, color: opt.value })}
                            title={opt.label}
                            className={`h-4 w-4 rounded-full border transition-all ${
                                color === opt.value ? "border-[#5C2A35] ring-2 ring-[#D27A8C]/40" : "border-white hover:border-[#F8DCE2]"
                            }`}
                            style={{ backgroundColor: opt.swatch }}
                        />
                    ))}
                </div>
            </div>

            <textarea
                value={block.content}
                onChange={(e) => onChange({ ...block, content: e.target.value })}
                placeholder="고정 안내 문구를 입력하세요. (환자에게 그대로 표시됩니다)"
                rows={5}
                className={`w-full bg-[#FCF7F8] border border-[#F8DCE2] rounded-lg px-3 py-2.5 outline-none focus:border-[#D27A8C] focus:bg-white focus:ring-2 focus:ring-[#F49EAF]/20 resize-y leading-relaxed transition-all whitespace-pre-wrap ${textContentStyleClass(block)}`}
            />
        </BlockCard>
    );
}

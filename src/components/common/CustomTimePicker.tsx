import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";

interface CustomTimePickerProps {
    value: string; // HH:mm (24h)
    onChange: (value: string) => void;
    className?: string;
    align?: "left" | "right";
    allowedTimes?: string[]; // Optional whitelist
    minTime?: string; // HH:mm - 이 시간 이전은 비활성화
    disabled?: boolean;
    placeholder?: string;
}

const AM = "\uC624\uC804";
const PM = "\uC624\uD6C4";

function toMinutes(timeStr: string): number {
    const [hh, mm] = String(timeStr).split(":").map(Number);
    return (hh || 0) * 60 + (mm || 0);
}

function to24Hour(meridiem: string, hour12: number, minute: number): string {
    let h = hour12;
    if (meridiem === PM && h !== 12) h += 12;
    if (meridiem === AM && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function to12Hour(timeStr: string): { meridiem: string; hour: number; minute: number } {
    if (!timeStr) return { meridiem: AM, hour: 10, minute: 0 };
    const [hh, mm] = String(timeStr).split(":").map(Number);
    const h = hh || 0;
    const minute = mm || 0;
    const meridiem = h < 12 ? AM : PM;
    let hour = h % 12;
    if (hour === 0) hour = 12;
    return { meridiem, hour, minute };
}

function uniqueNumbers(values: number[]) {
    return Array.from(new Set(values));
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
}

export function CustomTimePicker({
    value,
    onChange,
    className,
    align = "left",
    allowedTimes,
    minTime,
    disabled = false,
    placeholder = "시간 선택",
}: CustomTimePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const allowedEntries = useMemo(() => {
        return uniqueStrings((allowedTimes || []).map(String).filter((time) => /^\d{2}:\d{2}$/.test(time)))
            .map((time) => {
                const { meridiem, hour, minute } = to12Hour(time);
                return {
                    value: time,
                    meridiem,
                    hour,
                    minute,
                    minutesOfDay: toMinutes(time),
                };
            })
            .sort((a, b) => a.minutesOfDay - b.minutesOfDay);
    }, [allowedTimes]);

    const hasRestriction = Array.isArray(allowedTimes);
    const hasWhitelist = allowedEntries.length > 0;
    const displayValue = value || allowedEntries[0]?.value || "";
    const parsedDisplay = to12Hour(displayValue);

    const meridiemOptions = hasRestriction
        ? uniqueStrings(allowedEntries.map((entry) => entry.meridiem))
        : [AM, PM];
    const currentMeridiem = meridiemOptions.includes(parsedDisplay.meridiem)
        ? parsedDisplay.meridiem
        : (meridiemOptions[0] || parsedDisplay.meridiem);

    const minTimeMinutes = minTime ? toMinutes(minTime) : 0;

    const entriesForMeridiem = hasRestriction
        ? allowedEntries.filter((entry) => entry.meridiem === currentMeridiem)
        : [];
    const allHours = hasRestriction
        ? uniqueNumbers(entriesForMeridiem.map((entry) => entry.hour))
        : Array.from({ length: 12 }, (_, i) => i + 1);
    const hourOptions = minTime
        ? allHours.filter((h) => {
            const h24 = currentMeridiem === PM && h !== 12 ? h + 12 : currentMeridiem === AM && h === 12 ? 0 : h;
            const maxMinForHour = h24 * 60 + 55;
            return maxMinForHour >= minTimeMinutes;
        })
        : allHours;
    const currentHour = hourOptions.includes(parsedDisplay.hour)
        ? parsedDisplay.hour
        : (hourOptions[0] || parsedDisplay.hour);

    const entriesForHour = hasRestriction
        ? entriesForMeridiem.filter((entry) => entry.hour === currentHour)
        : [];
    const allMinutes = hasRestriction
        ? uniqueNumbers(entriesForHour.map((entry) => entry.minute))
        : Array.from({ length: 12 }, (_, i) => i * 5);
    const minuteOptions = minTime
        ? allMinutes.filter((m) => {
            const h24 = currentMeridiem === PM && currentHour !== 12 ? currentHour + 12 : currentMeridiem === AM && currentHour === 12 ? 0 : currentHour;
            return h24 * 60 + m >= minTimeMinutes;
        })
        : allMinutes;
    const currentMinute = minuteOptions.includes(parsedDisplay.minute)
        ? parsedDisplay.minute
        : (minuteOptions[0] || parsedDisplay.minute);

    const pickNearestAllowed = (candidate: string, candidates?: string[]): string => {
        if (!hasRestriction) return candidate;
        const pool = (candidates || allowedEntries.map((entry) => entry.value)).filter(Boolean);
        if (pool.length === 0) return candidate;
        if (pool.includes(candidate)) return candidate;
        const candidateMin = toMinutes(candidate);
        let nearest = candidate;
        let minDiff = Number.MAX_SAFE_INTEGER;
        for (const t of pool) {
            const diff = Math.abs(toMinutes(t) - candidateMin);
            if (diff < minDiff) {
                minDiff = diff;
                nearest = t;
            }
        }
        return nearest;
    };

    const updateTime = (newMeridiem: string, newHour: number, newMinute: number) => {
        const candidate = to24Hour(newMeridiem, newHour, newMinute);
        onChange(pickNearestAllowed(candidate));
    };

    const handleSelectMeridiem = (nextMeridiem: string) => {
        if (!hasRestriction) {
            updateTime(nextMeridiem, currentHour, currentMinute);
            return;
        }

        const candidates = allowedEntries
            .filter((entry) => entry.meridiem === nextMeridiem)
            .map((entry) => entry.value);
        if (candidates.length === 0) return;
        onChange(pickNearestAllowed(to24Hour(nextMeridiem, currentHour, currentMinute), candidates));
    };

    const handleSelectHour = (nextHour: number) => {
        if (!hasRestriction) {
            updateTime(currentMeridiem, nextHour, currentMinute);
            return;
        }

        const candidates = entriesForMeridiem
            .filter((entry) => entry.hour === nextHour)
            .map((entry) => entry.value);
        if (candidates.length === 0) return;
        onChange(pickNearestAllowed(to24Hour(currentMeridiem, nextHour, currentMinute), candidates));
    };

    const handleSelectMinute = (nextMinute: number) => {
        if (!hasRestriction) {
            updateTime(currentMeridiem, currentHour, nextMinute);
            return;
        }

        const candidates = entriesForHour.map((entry) => entry.value);
        if (candidates.length === 0) return;
        onChange(pickNearestAllowed(to24Hour(currentMeridiem, currentHour, nextMinute), candidates));
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    return (
        <div className={`relative ${className || ""}`} ref={containerRef}>
            <div
                onClick={() => {
                    if (disabled) return;
                    setIsOpen(!isOpen);
                }}
                className={`w-full h-10 px-3 border rounded flex items-center justify-between bg-white group ${
                    disabled
                        ? "cursor-not-allowed border-gray-200 bg-gray-50"
                        : "cursor-pointer border-gray-200 hover:border-blue-400 focus-within:border-blue-500"
                }`}
            >
                <span className={`text-sm font-medium ${value ? "text-gray-900" : "text-gray-400"}`}>
                    {value
                        ? `${currentMeridiem} ${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`
                        : placeholder}
                </span>
                <Clock className={`w-4 h-4 ${disabled ? "text-gray-300" : "text-gray-400 group-hover:text-blue-500"}`} />
            </div>

            {isOpen && !disabled && (
                <div
                    className={`absolute z-[9999] mt-1 w-[260px] bg-white rounded-lg shadow-lg border border-gray-200 p-2 animate-in fade-in zoom-in-95 duration-100 select-none ${align === "right" ? "right-0" : "left-0"}`}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="flex gap-1 mb-2 text-center text-sm font-bold text-white">
                        <div className="flex-1 bg-blue-600 rounded flex items-center justify-center py-2 shadow-sm">{currentMeridiem}</div>
                        <div className="flex-1 bg-blue-600 rounded flex items-center justify-center py-2 shadow-sm">{currentHour.toString().padStart(2, "0")}</div>
                        <div className="flex-1 bg-blue-600 rounded flex items-center justify-center py-2 shadow-sm">{currentMinute.toString().padStart(2, "0")}</div>
                    </div>

                    <div className="flex h-48 overflow-hidden border-t border-gray-100">
                        <div className="flex-1 flex flex-col border-r border-gray-100">
                            {meridiemOptions.map((m) => (
                                <div
                                    key={m}
                                    onClick={() => handleSelectMeridiem(m)}
                                    className={`flex items-center justify-center py-3 text-sm hover:bg-gray-50 ${
                                        currentMeridiem === m ? "font-bold text-gray-900 bg-blue-50" : "text-gray-500"
                                    } cursor-pointer`}
                                >
                                    {m}
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 flex flex-col border-r border-gray-100 overflow-y-auto">
                            {hourOptions.map((h) => (
                                <div
                                    key={h}
                                    onClick={() => handleSelectHour(h)}
                                    className={`flex items-center justify-center py-2 text-sm hover:bg-gray-50 flex-shrink-0 ${
                                        currentHour === h ? "font-bold text-gray-900 bg-blue-50" : "text-gray-500"
                                    } cursor-pointer`}
                                >
                                    {h.toString().padStart(2, "0")}
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 flex flex-col overflow-y-auto">
                            {minuteOptions.map((m) => (
                                <div
                                    key={m}
                                    onClick={() => handleSelectMinute(m)}
                                    className={`flex items-center justify-center py-2 text-sm hover:bg-gray-50 flex-shrink-0 ${
                                        currentMinute === m ? "font-bold text-gray-900 bg-blue-50" : "text-gray-500"
                                    } cursor-pointer`}
                                >
                                    {m.toString().padStart(2, "0")}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

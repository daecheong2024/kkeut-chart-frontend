import { ReactNode } from "react";
import { Trash2, ChevronUp, ChevronDown } from "lucide-react";

interface BlockCardProps {
    children: ReactNode;
    typeLabel?: string;
    onDelete: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    showRequiredToggle?: boolean;
    required?: boolean;
    onRequiredChange?: (next: boolean) => void;
}

export function BlockCard({
    children,
    typeLabel,
    onDelete,
    onMoveUp,
    onMoveDown,
    canMoveUp = false,
    canMoveDown = false,
    showRequiredToggle = true,
    required = false,
    onRequiredChange,
}: BlockCardProps) {
    return (
        <div className="group relative rounded-xl border border-[#F8DCE2] bg-white shadow-[0_2px_8px_rgba(226,107,124,0.04)] hover:border-[#D27A8C]/60 hover:shadow-[0_4px_14px_rgba(226,107,124,0.08)] transition-all">
            {/* Floating type label (top-left) */}
            {typeLabel && (
                <span className="absolute -top-2 left-3 px-2 py-0.5 rounded-md bg-[#FCEBEF] text-[9px] font-extrabold text-[#8B3F50] tracking-wider uppercase">
                    {typeLabel}
                </span>
            )}

            {/* Floating action toolbar (top-right, visible on hover) */}
            <div className="absolute -top-3 right-3 flex items-center gap-0.5 rounded-lg border border-[#F8DCE2] bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={!canMoveUp}
                    className="p-1.5 rounded text-[#8B5A66] hover:text-[#5C2A35] hover:bg-[#FCEBEF] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="위로"
                >
                    <ChevronUp className="h-3 w-3" />
                </button>
                <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={!canMoveDown}
                    className="p-1.5 rounded text-[#8B5A66] hover:text-[#5C2A35] hover:bg-[#FCEBEF] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="아래로"
                >
                    <ChevronDown className="h-3 w-3" />
                </button>
                <div className="h-4 w-px bg-[#F8DCE2]" />
                <button
                    type="button"
                    onClick={onDelete}
                    className="p-1.5 rounded text-[#99354E] hover:text-white hover:bg-[#D27A8C] transition-colors"
                    title="삭제"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            </div>

            <div className="px-4 pt-4 pb-3">{children}</div>

            {showRequiredToggle && (
                <div className="flex items-center justify-end px-4 py-2 border-t border-[#F8DCE2]/60 bg-[#FCF7F8]/40 rounded-b-xl">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-[#8B5A66] hover:text-[#5C2A35]">
                        <input
                            type="checkbox"
                            checked={required}
                            onChange={(e) => onRequiredChange?.(e.target.checked)}
                            className="h-3.5 w-3.5 accent-[#D27A8C]"
                        />
                        필수 입력
                    </label>
                </div>
            )}
        </div>
    );
}

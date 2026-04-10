import { ReactNode } from "react";
import { GripVertical, Trash2, ChevronUp, ChevronDown } from "lucide-react";

interface BlockCardProps {
    children: ReactNode;
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
        <div className="rounded-xl border border-[#F8DCE2] bg-white shadow-[0_2px_8px_rgba(226,107,124,0.06)] overflow-hidden">
            {/* Drag handle / move buttons row */}
            <div className="flex items-center justify-center gap-1 py-1 border-b border-[#F8DCE2]/60 bg-[#FCF7F8]">
                <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={!canMoveUp}
                    className="p-1 rounded text-[#8B5A66] hover:text-[#5C2A35] hover:bg-[#FCEBEF] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="위로"
                >
                    <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <GripVertical className="h-3.5 w-3.5 text-[#C9A0A8]" />
                <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={!canMoveDown}
                    className="p-1 rounded text-[#8B5A66] hover:text-[#5C2A35] hover:bg-[#FCEBEF] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="아래로"
                >
                    <ChevronDown className="h-3.5 w-3.5" />
                </button>
            </div>

            <div className="px-4 py-3">{children}</div>

            <div className="flex items-center justify-end gap-3 px-4 py-2 border-t border-[#F8DCE2]/60 bg-[#FCF7F8]/40">
                {showRequiredToggle && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-[#8B5A66]">
                        <input
                            type="checkbox"
                            checked={required}
                            onChange={(e) => onRequiredChange?.(e.target.checked)}
                            className="h-3.5 w-3.5 accent-[#D27A8C]"
                        />
                        필수 입력
                    </label>
                )}
                <button
                    type="button"
                    onClick={onDelete}
                    className="p-1.5 rounded text-[#99354E] hover:text-[#5C2A35] hover:bg-[#FCEBEF] transition-colors"
                    title="삭제"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

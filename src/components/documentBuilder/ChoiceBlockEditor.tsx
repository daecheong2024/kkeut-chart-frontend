import { Plus, X } from "lucide-react";
import { BlockCard } from "./BlockCard";
import type { ChoiceBlock, ChoiceOption } from "../../types/documentationBuilder";
import { newOptionId } from "../../types/documentationBuilder";

interface Props {
    block: ChoiceBlock;
    onChange: (next: ChoiceBlock) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export function ChoiceBlockEditor({ block, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: Props) {
    const updateOption = (id: string, patch: Partial<ChoiceOption>) => {
        onChange({
            ...block,
            options: block.options.map((opt) => (opt.id === id ? { ...opt, ...patch } : opt)),
        });
    };

    const addOption = (hasNote: boolean) => {
        const newOpt: ChoiceOption = { id: newOptionId(), label: "", hasNote };
        onChange({ ...block, options: [...block.options, newOpt] });
    };

    const removeOption = (id: string) => {
        onChange({ ...block, options: block.options.filter((opt) => opt.id !== id) });
    };

    return (
        <BlockCard
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            required={block.required}
            onRequiredChange={(required) => onChange({ ...block, required })}
        >
            <input
                type="text"
                value={block.title}
                onChange={(e) => onChange({ ...block, title: e.target.value })}
                placeholder="제목을 입력하세요"
                className="w-full text-[14px] font-bold text-[#2A1F22] bg-transparent border-0 border-b border-[#F8DCE2] focus:border-[#D27A8C] focus:ring-0 outline-none pb-1.5 mb-3"
            />

            {/* Selection type */}
            <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-[#5C2A35]">
                    <input
                        type="radio"
                        checked={block.selectionType === "single"}
                        onChange={() => onChange({ ...block, selectionType: "single" })}
                        className="accent-[#D27A8C]"
                    />
                    단수 선택
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-[#5C2A35]">
                    <input
                        type="radio"
                        checked={block.selectionType === "multi"}
                        onChange={() => onChange({ ...block, selectionType: "multi" })}
                        className="accent-[#D27A8C]"
                    />
                    복수 선택
                </label>
            </div>

            {/* Options */}
            <div className="space-y-2">
                <div className="text-[11px] font-bold text-[#8B3F50]">문항 *</div>
                {block.options.length === 0 && (
                    <div className="text-[11px] text-[#C9A0A8] italic px-2 py-2 rounded border border-dashed border-[#F8DCE2] text-center">
                        옵션을 추가해 주세요.
                    </div>
                )}
                {block.options.map((opt) => (
                    <div key={opt.id} className="flex items-center gap-2">
                        <span className="text-[#C9A0A8] text-[14px] shrink-0">○</span>
                        <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                            placeholder="옵션"
                            className="flex-1 text-[12px] text-[#2A1F22] bg-white border-0 border-b border-[#F8DCE2] focus:border-[#D27A8C] focus:ring-0 outline-none px-1 py-1"
                        />
                        {opt.hasNote && (
                            <input
                                type="text"
                                disabled
                                placeholder="비고 (환자 입력)"
                                className="w-32 text-[11px] text-[#C9A0A8] bg-[#FCF7F8] border border-dashed border-[#F8DCE2] rounded px-2 py-1 outline-none"
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => removeOption(opt.id)}
                            className="p-1 rounded text-[#C9A0A8] hover:text-[#99354E] hover:bg-[#FCEBEF] transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
                <div className="flex items-center gap-3 pt-1 text-[11px]">
                    <button
                        type="button"
                        onClick={() => addOption(false)}
                        className="inline-flex items-center gap-1 text-[#8B3F50] hover:text-[#5C2A35] hover:underline"
                    >
                        <Plus className="h-3 w-3" />
                        옵션 추가
                    </button>
                    <span className="text-[#C9A0A8]">또는</span>
                    <button
                        type="button"
                        onClick={() => addOption(true)}
                        className="inline-flex items-center gap-1 text-[#8B3F50] hover:text-[#5C2A35] hover:underline"
                    >
                        <Plus className="h-3 w-3" />
                        비고란 옵션 추가
                    </button>
                </div>
            </div>
        </BlockCard>
    );
}

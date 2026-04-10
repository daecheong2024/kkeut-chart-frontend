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
            typeLabel={block.selectionType === "single" ? "단일 선택" : "복수 선택"}
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
                placeholder="제목 (예: 대리인 서명 사유)"
                className="w-full text-[15px] font-extrabold text-[#2A1F22] placeholder:text-[#C9A0A8] placeholder:font-medium bg-transparent border-0 outline-none mb-2.5"
            />

            {/* Selection type — segmented */}
            <div className="inline-flex items-center rounded-lg bg-[#FCF7F8] border border-[#F8DCE2] p-0.5 mb-3">
                <button
                    type="button"
                    onClick={() => onChange({ ...block, selectionType: "single" })}
                    className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                        block.selectionType === "single"
                            ? "bg-white text-[#8B3F50] shadow-sm"
                            : "text-[#8B5A66] hover:text-[#5C2A35]"
                    }`}
                >
                    단일 선택
                </button>
                <button
                    type="button"
                    onClick={() => onChange({ ...block, selectionType: "multi" })}
                    className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                        block.selectionType === "multi"
                            ? "bg-white text-[#8B3F50] shadow-sm"
                            : "text-[#8B5A66] hover:text-[#5C2A35]"
                    }`}
                >
                    복수 선택
                </button>
            </div>

            {/* Options */}
            <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-[#8B3F50]">선택 항목</div>
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

import { BlockCard } from "./BlockCard";
import type { TextChartBlock } from "../../types/documentationBuilder";

interface Props {
    block: TextChartBlock;
    onChange: (next: TextChartBlock) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export function TextChartBlockEditor({ block, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: Props) {
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
            <input
                type="text"
                value={block.placeholder ?? ""}
                onChange={(e) => onChange({ ...block, placeholder: e.target.value })}
                placeholder="안내 placeholder (선택)"
                className="w-full text-[12px] text-[#8B5A66] bg-[#FCF7F8] border border-dashed border-[#F8DCE2] rounded-lg px-3 py-2 outline-none focus:border-[#D27A8C]"
            />
            <div className="mt-2 text-[10px] text-[#8B5A66] flex items-center gap-1">
                <span>ⓘ</span> 해당 입력란은 차트(직원/의사)에서 입력합니다.
            </div>
        </BlockCard>
    );
}

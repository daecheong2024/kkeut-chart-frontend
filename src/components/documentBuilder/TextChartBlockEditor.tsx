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
            typeLabel="서술형 (차트입력)"
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
                placeholder="제목 (예: 시술 부위)"
                className="w-full text-[15px] font-extrabold text-[#2A1F22] placeholder:text-[#C9A0A8] placeholder:font-medium bg-transparent border-0 outline-none mb-2.5"
            />
            <input
                type="text"
                value={block.placeholder ?? ""}
                onChange={(e) => onChange({ ...block, placeholder: e.target.value })}
                placeholder="안내 placeholder (선택, 예: 부위를 입력하세요)"
                className="w-full text-[12px] text-[#5C2A35] bg-[#FCF7F8] border border-dashed border-[#F8DCE2] rounded-lg px-3 py-2 outline-none focus:border-[#D27A8C] focus:bg-white transition-all"
            />
            <div className="mt-2 text-[10px] text-[#8B5A66] flex items-center gap-1">
                <span>ⓘ</span> 차트(직원/의사)에서 입력하는 항목입니다.
            </div>
        </BlockCard>
    );
}

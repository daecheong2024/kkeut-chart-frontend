import { BlockCard } from "./BlockCard";
import type { DateBlock } from "../../types/documentationBuilder";

interface Props {
    block: DateBlock;
    onChange: (next: DateBlock) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export function DateBlockEditor({ block, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: Props) {
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
            <div className="rounded-lg bg-[#FCF7F8] border border-dashed border-[#F8DCE2] px-3 py-2.5 flex items-center gap-2">
                <span className="text-[12px] text-[#8B5A66] font-mono">YYYY-MM-DD</span>
                <span className="ml-auto text-[10px] text-[#C9A0A8]">📅 환자가 서명 시 입력</span>
            </div>
            <div className="mt-2 text-[10px] text-[#8B5A66] flex items-center gap-1">
                <span>ⓘ</span> 해당 입력란은 환자가 서명 페이지에서 입력합니다.
            </div>
        </BlockCard>
    );
}

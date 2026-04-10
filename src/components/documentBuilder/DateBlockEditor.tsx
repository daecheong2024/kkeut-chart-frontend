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
            typeLabel="날짜"
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
                placeholder="제목 (예: 시술 동의일)"
                className="w-full text-[15px] font-extrabold text-[#2A1F22] placeholder:text-[#C9A0A8] placeholder:font-medium bg-transparent border-0 outline-none mb-2.5"
            />
            <div className="rounded-lg bg-[#FCF7F8] border border-dashed border-[#F8DCE2] px-3 py-2.5 flex items-center gap-2">
                <span className="text-[12px] text-[#8B5A66] font-mono">YYYY-MM-DD</span>
                <span className="ml-auto text-[10px] text-[#C9A0A8] flex items-center gap-1">
                    <span>ⓘ</span> 환자 서명 시 자동 입력
                </span>
            </div>
        </BlockCard>
    );
}

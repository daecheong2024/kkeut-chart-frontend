import { BlockCard } from "./BlockCard";
import type { TextContentBlock } from "../../types/documentationBuilder";

interface Props {
    block: TextContentBlock;
    onChange: (next: TextContentBlock) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export function TextContentBlockEditor({ block, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: Props) {
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
            <textarea
                value={block.content}
                onChange={(e) => onChange({ ...block, content: e.target.value })}
                placeholder="고정 안내 문구를 입력하세요. (예: 시술 동의 안내문)"
                rows={6}
                className="w-full text-[13px] text-[#2A1F22] bg-white border border-[#F8DCE2] rounded-lg px-3 py-2 outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20 resize-y leading-relaxed"
            />
        </BlockCard>
    );
}

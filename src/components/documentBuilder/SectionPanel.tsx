import { Calendar, PenLine, FileText, CheckCircle2 } from "lucide-react";
import type {
    DocumentationSection,
    DocumentationBlock,
    BlockType,
    SectionKey,
} from "../../types/documentationBuilder";
import {
    SECTION_LABELS,
    BLOCK_LABELS,
    ALLOWED_BLOCK_TYPES_BY_SECTION,
    createBlock,
} from "../../types/documentationBuilder";
import { DateBlockEditor } from "./DateBlockEditor";
import { TextChartBlockEditor } from "./TextChartBlockEditor";
import { TextContentBlockEditor } from "./TextContentBlockEditor";
import { ChoiceBlockEditor } from "./ChoiceBlockEditor";

interface Props {
    section: DocumentationSection;
    onChange: (next: DocumentationSection) => void;
}

const BLOCK_ICONS: Record<BlockType, React.ComponentType<{ className?: string }>> = {
    date: Calendar,
    text_chart: PenLine,
    text_content: FileText,
    choice: CheckCircle2,
};

export function SectionPanel({ section, onChange }: Props) {
    const allowedTypes = ALLOWED_BLOCK_TYPES_BY_SECTION[section.key as SectionKey];

    const updateBlock = (idx: number, next: DocumentationBlock) => {
        const blocks = [...section.blocks];
        blocks[idx] = next;
        onChange({ ...section, blocks });
    };

    const deleteBlock = (idx: number) => {
        const blocks = section.blocks.filter((_, i) => i !== idx);
        onChange({ ...section, blocks });
    };

    const moveBlock = (idx: number, dir: -1 | 1) => {
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= section.blocks.length) return;
        const blocks = [...section.blocks];
        const tmp = blocks[idx]!;
        blocks[idx] = blocks[newIdx]!;
        blocks[newIdx] = tmp;
        onChange({ ...section, blocks });
    };

    const addBlock = (type: BlockType) => {
        onChange({ ...section, blocks: [...section.blocks, createBlock(type)] });
    };

    return (
        <div className="rounded-2xl border border-[#F8DCE2] bg-white p-4 mb-4">
            <div className="text-[14px] font-extrabold text-[#5C2A35] mb-3">{SECTION_LABELS[section.key]}</div>

            {/* Block list */}
            {section.blocks.length > 0 && (
                <div className="space-y-3 mb-3">
                    {section.blocks.map((block, idx) => {
                        const common = {
                            onDelete: () => deleteBlock(idx),
                            onMoveUp: () => moveBlock(idx, -1),
                            onMoveDown: () => moveBlock(idx, 1),
                            canMoveUp: idx > 0,
                            canMoveDown: idx < section.blocks.length - 1,
                        };
                        if (block.type === "date") {
                            return (
                                <DateBlockEditor
                                    key={block.id}
                                    block={block}
                                    onChange={(next) => updateBlock(idx, next)}
                                    {...common}
                                />
                            );
                        }
                        if (block.type === "text_chart") {
                            return (
                                <TextChartBlockEditor
                                    key={block.id}
                                    block={block}
                                    onChange={(next) => updateBlock(idx, next)}
                                    {...common}
                                />
                            );
                        }
                        if (block.type === "text_content") {
                            return (
                                <TextContentBlockEditor
                                    key={block.id}
                                    block={block}
                                    onChange={(next) => updateBlock(idx, next)}
                                    {...common}
                                />
                            );
                        }
                        if (block.type === "choice") {
                            return (
                                <ChoiceBlockEditor
                                    key={block.id}
                                    block={block}
                                    onChange={(next) => updateBlock(idx, next)}
                                    {...common}
                                />
                            );
                        }
                        return null;
                    })}
                </div>
            )}

            {/* Add block buttons */}
            <div className="rounded-xl border border-dashed border-[#F8DCE2] bg-[#FCF7F8]/40 px-4 py-4">
                <div className="text-center text-[11px] text-[#8B5A66] mb-3">추가할 필드를 선택하세요.</div>
                <div className="flex items-center justify-center gap-6">
                    {allowedTypes.map((type) => {
                        const Icon = BLOCK_ICONS[type];
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => addBlock(type)}
                                className="flex flex-col items-center gap-1 group"
                            >
                                <div className="p-2 rounded-full bg-white border border-[#F8DCE2] group-hover:border-[#D27A8C] group-hover:bg-[#FCEBEF] transition-all">
                                    <Icon className="h-4 w-4 text-[#8B3F50]" />
                                </div>
                                <span className="text-[10px] font-bold text-[#8B5A66] group-hover:text-[#5C2A35]">
                                    {BLOCK_LABELS[type]}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

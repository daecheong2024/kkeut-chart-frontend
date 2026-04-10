import { Calendar, PenLine, FileText, CheckCircle2, FileEdit, UserCircle2, Stethoscope, Signature } from "lucide-react";
import type {
    DocumentationSection,
    DocumentationBlock,
    BlockType,
    SectionKey,
} from "../../types/documentationBuilder";
import {
    SECTION_LABELS,
    SECTION_DESCRIPTIONS,
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

const SECTION_ICONS: Record<SectionKey, React.ComponentType<{ className?: string }>> = {
    body: FileEdit,
    patient_input: UserCircle2,
    doctor_sign: Stethoscope,
    patient_sign: Signature,
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

    const SectionIcon = SECTION_ICONS[section.key as SectionKey];

    return (
        <div className="rounded-2xl border border-[#F8DCE2] bg-white p-5 shadow-[0_2px_10px_rgba(226,107,124,0.04)]">
            {/* Section header */}
            <div className="flex items-center gap-2.5 mb-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FCEBEF]">
                    <SectionIcon className="h-3.5 w-3.5 text-[#8B3F50]" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-extrabold text-[#5C2A35] leading-tight">{SECTION_LABELS[section.key]}</div>
                </div>
                {section.blocks.length > 0 && (
                    <span className="text-[10px] font-bold text-[#8B5A66] bg-[#FCF7F8] px-2 py-0.5 rounded-full">
                        {section.blocks.length}개 블록
                    </span>
                )}
            </div>
            <div className="text-[11px] text-[#8B5A66] mb-4 ml-[38px]">{SECTION_DESCRIPTIONS[section.key]}</div>

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
            <div className="rounded-xl border border-dashed border-[#F8DCE2] bg-[#FCF7F8]/50 px-4 py-3.5">
                <div className="text-center text-[11px] font-semibold text-[#8B5A66] mb-3">+ 필드 추가</div>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${allowedTypes.length}, minmax(0, 1fr))` }}>
                    {allowedTypes.map((type) => {
                        const Icon = BLOCK_ICONS[type];
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => addBlock(type)}
                                className="flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg bg-white border border-[#F8DCE2] hover:border-[#D27A8C] hover:bg-[#FCEBEF]/50 hover:shadow-[0_4px_12px_rgba(226,107,124,0.12)] transition-all group"
                            >
                                <Icon className="h-4 w-4 text-[#8B3F50] group-hover:scale-110 transition-transform" />
                                <span className="text-[11px] font-bold text-[#5C2A35]">
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

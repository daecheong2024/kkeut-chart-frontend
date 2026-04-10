import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type {
    DocumentationStructured,
    DocumentationBlock,
    DocumentationSection,
} from "../../types/documentationBuilder";
import { SECTION_LABELS } from "../../types/documentationBuilder";

interface Props {
    open: boolean;
    title: string;
    structured: DocumentationStructured;
    onClose: () => void;
}

export function DocumentationPreviewModal({ open, title, structured, onClose }: Props) {
    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] px-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-[860px] max-h-[90vh] rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-[#F8DCE2] px-6 py-3 bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#D27A8C] to-[#8B3F50]" />
                    <div className="pl-2 min-w-0">
                        <div className="text-[15px] font-extrabold text-[#5C2A35]">미리보기</div>
                        <div className="text-[11px] text-[#8B5A66] truncate max-w-[700px]">{title || "동의서"}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#F8DCE2] bg-white text-[#8B3F50] hover:text-[#5C2A35] hover:bg-[#FCEBEF] hover:border-[#D27A8C]/40 transition-all shadow-sm"
                        title="닫기"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-8 py-6 bg-[#FCF7F8]/30">
                    {/* INFORMED CONSENT title */}
                    <div className="text-center mb-6">
                        <div className="text-[10px] font-bold tracking-[0.2em] text-[#8B5A66]">INFORMED CONSENT</div>
                        <h2 className="mt-1 text-[20px] font-extrabold text-[#2A1F22]">{title || "동의서"}</h2>
                        <p className="mt-1 text-[11px] text-[#8B5A66]">진료/시술 안내 및 동의 문서</p>
                    </div>

                    {/* Sample patient info */}
                    <div className="rounded-lg border border-[#F8DCE2] bg-white mb-6 overflow-hidden">
                        <div className="grid grid-cols-2 text-[12px] text-[#5C2A35]">
                            <InfoRow label="환자명" value="홍길동" />
                            <InfoRow label="생년월일" value="1991-12-14" />
                            <InfoRow label="환자번호" value="12345" />
                            <InfoRow label="연락처" value="010-1234-5678" />
                        </div>
                    </div>

                    {/* Render each section */}
                    {structured.sections.map((section) => (
                        <PreviewSection key={section.key} section={section} />
                    ))}

                    {/* Signature footer */}
                    <div className="mt-6 rounded-lg border border-[#F8DCE2] bg-white p-4">
                        <div className="text-[12px] font-bold text-[#5C2A35] mb-3">서명란 (예시)</div>
                        <div className="grid grid-cols-2 gap-4 text-[11px]">
                            <div>
                                <div className="text-[#8B5A66] mb-1">환자 서명</div>
                                <div className="h-16 rounded border border-dashed border-[#F8DCE2] bg-[#FCF7F8]" />
                            </div>
                            <div>
                                <div className="text-[#8B5A66] mb-1">담당의 서명</div>
                                <div className="h-16 rounded border border-dashed border-[#F8DCE2] bg-[#FCF7F8]" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 text-center text-[10px] text-[#C9A0A8]">
                        ⓘ 미리보기 — 실제 서명 페이지에서는 환자 정보가 자동 연동되고 입력 필드가 활성화됩니다.
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-[#F8DCE2] px-6 py-3 bg-gradient-to-b from-[#FCF7F8] to-white">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 rounded-xl border border-[#F8DCE2] bg-white px-5 text-[13px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF] hover:border-[#D27A8C]/40 transition-all"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex border-b border-[#F8DCE2] last:border-b-0 even:border-l">
            <div className="bg-[#FCF7F8] px-3 py-2 font-bold text-[#8B3F50] min-w-[80px] border-r border-[#F8DCE2]">{label}</div>
            <div className="px-3 py-2 flex-1">{value}</div>
        </div>
    );
}

function PreviewSection({ section }: { section: DocumentationSection }) {
    if (section.blocks.length === 0) return null;
    return (
        <div className="mb-5">
            <div className="text-[12px] font-extrabold text-[#8B3F50] mb-2 pl-1 border-l-[3px] border-[#D27A8C]">
                {SECTION_LABELS[section.key]}
            </div>
            <div className="space-y-3">
                {section.blocks.map((block) => (
                    <PreviewBlock key={block.id} block={block} />
                ))}
            </div>
        </div>
    );
}

function PreviewBlock({ block }: { block: DocumentationBlock }) {
    const titleEl = block.title && (
        <div className="text-[13px] font-bold text-[#2A1F22] mb-1.5">
            {block.title}
            {block.required && <span className="text-[#D27A8C] ml-1">*</span>}
        </div>
    );

    if (block.type === "date") {
        return (
            <div className="rounded-lg border border-[#F8DCE2] bg-white px-4 py-3">
                {titleEl}
                <input
                    type="date"
                    disabled
                    className="text-[12px] text-[#8B5A66] bg-[#FCF7F8] border border-[#F8DCE2] rounded px-2 py-1 outline-none cursor-not-allowed"
                />
            </div>
        );
    }

    if (block.type === "text_chart") {
        return (
            <div className="rounded-lg border border-[#F8DCE2] bg-white px-4 py-3">
                {titleEl}
                <div className="rounded bg-[#FCF7F8] border border-dashed border-[#F8DCE2] px-3 py-2 text-[11px] text-[#C9A0A8] italic">
                    {block.placeholder || "차트(직원/의사)에서 입력합니다."}
                </div>
            </div>
        );
    }

    if (block.type === "text_content") {
        return (
            <div className="rounded-lg border border-[#F8DCE2] bg-white px-4 py-3">
                {titleEl}
                <div className="text-[12px] text-[#2A1F22] leading-relaxed whitespace-pre-wrap">
                    {block.content || <span className="text-[#C9A0A8] italic">내용이 비어 있습니다.</span>}
                </div>
            </div>
        );
    }

    if (block.type === "choice") {
        return (
            <div className="rounded-lg border border-[#F8DCE2] bg-white px-4 py-3">
                {titleEl}
                <div className="space-y-1.5">
                    {block.options.length === 0 && (
                        <div className="text-[11px] text-[#C9A0A8] italic">옵션이 비어 있습니다.</div>
                    )}
                    {block.options.map((opt) => (
                        <label key={opt.id} className="flex items-center gap-2 text-[12px] text-[#2A1F22] cursor-not-allowed">
                            <input
                                type={block.selectionType === "single" ? "radio" : "checkbox"}
                                disabled
                                className="accent-[#D27A8C]"
                            />
                            <span>{opt.label || <span className="text-[#C9A0A8] italic">옵션</span>}</span>
                            {opt.hasNote && (
                                <input
                                    type="text"
                                    disabled
                                    placeholder="비고"
                                    className="ml-2 w-32 text-[11px] text-[#C9A0A8] bg-[#FCF7F8] border-b border-[#F8DCE2] px-1 outline-none"
                                />
                            )}
                        </label>
                    ))}
                </div>
            </div>
        );
    }

    return null;
}

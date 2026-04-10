import { User, Sparkles } from "lucide-react";
import { SectionPanel } from "./SectionPanel";
import { SignatureSection } from "./SignatureSection";
import type { DocumentationStructured, DocumentationSection, SignatureConfig } from "../../types/documentationBuilder";
import { isSignatureSection } from "../../types/documentationBuilder";

interface Props {
    value: DocumentationStructured;
    onChange: (next: DocumentationStructured) => void;
}

const PATIENT_FIELDS: Array<{ label: string; sample: string }> = [
    { label: "환자명", sample: "홍길동" },
    { label: "환자번호", sample: "12345" },
    { label: "생년월일", sample: "1991-12-14" },
    { label: "성별", sample: "남" },
    { label: "주민등록번호", sample: "911214-1******" },
    { label: "연락처", sample: "010-1234-5678" },
];

export function DocumentationBuilder({ value, onChange }: Props) {
    const updateSection = (idx: number, next: DocumentationSection) => {
        const sections = [...value.sections];
        sections[idx] = next;
        onChange({ ...value, sections });
    };

    const updateSignatureConfig = (next: SignatureConfig) => {
        onChange({ ...value, signatureConfig: next });
    };

    return (
        <div className="space-y-5">
            {/* Patient info header — 자동 연동 안내 */}
            <div className="rounded-2xl border border-[#F8DCE2] bg-gradient-to-br from-[#FCEBEF]/30 to-white p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#D27A8C] to-[#8B3F50] shadow-sm">
                            <User className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                        </div>
                        <span className="text-[14px] font-extrabold text-[#5C2A35]">환자 정보</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FCEBEF] px-2.5 py-1 text-[10px] font-bold text-[#8B3F50]">
                        <Sparkles className="h-3 w-3" />
                        자동 연동
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-[12px] mb-2">
                    {PATIENT_FIELDS.map((f) => (
                        <PatientInfoRow key={f.label} label={f.label} sample={f.sample} />
                    ))}
                </div>
                <PatientInfoRow label="주소" sample="서울특별시 ○○구 ○○로 123" />
                <div className="mt-3 pt-3 border-t border-[#F8DCE2] text-[10px] text-[#8B5A66] flex items-center gap-1">
                    <span>ⓘ</span>
                    환자가 서명 페이지에 접속하면 차트의 환자 정보가 자동으로 채워집니다. 별도 입력이 필요하지 않습니다.
                </div>
            </div>

            {/* 4 sections — signature 섹션은 별도 패널 */}
            {value.sections.map((section, idx) => {
                if (isSignatureSection(section.key)) {
                    return (
                        <SignatureSection
                            key={section.key}
                            sectionKey={section.key}
                            config={value.signatureConfig}
                            onChange={updateSignatureConfig}
                        />
                    );
                }
                return (
                    <SectionPanel
                        key={section.key}
                        section={section}
                        onChange={(next) => updateSection(idx, next)}
                    />
                );
            })}
        </div>
    );
}

function PatientInfoRow({ label, sample }: { label: string; sample: string }) {
    return (
        <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-bold text-[#8B3F50] shrink-0 min-w-[72px]">{label}</span>
            <span className="text-[12px] text-[#5C2A35] font-medium flex-1 truncate">{sample}</span>
        </div>
    );
}

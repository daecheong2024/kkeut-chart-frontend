import { SectionPanel } from "./SectionPanel";
import type { DocumentationStructured, DocumentationSection } from "../../types/documentationBuilder";

interface Props {
    value: DocumentationStructured;
    onChange: (next: DocumentationStructured) => void;
}

export function DocumentationBuilder({ value, onChange }: Props) {
    const updateSection = (idx: number, next: DocumentationSection) => {
        const sections = [...value.sections];
        sections[idx] = next;
        onChange({ ...value, sections });
    };

    return (
        <div className="space-y-0">
            {/* Patient info header (fixed, non-editable) */}
            <div className="rounded-2xl border border-[#F8DCE2] bg-white p-4 mb-4">
                <div className="text-[14px] font-extrabold text-[#5C2A35] mb-3">환자 정보</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                    <PatientInfoRow label="환자명" placeholder="환자명을 연동합니다." />
                    <PatientInfoRow label="환자번호" placeholder="환자번호를 연동합니다." />
                    <PatientInfoRow label="생년월일" placeholder="생년월일을 연동합니다." />
                    <PatientInfoRow label="성별" placeholder="성별을 연동합니다." />
                    <PatientInfoRow label="주민등록번호" placeholder="주민등록번호를 연동합니다." />
                    <PatientInfoRow label="연락처" placeholder="연락처를 연동합니다." />
                </div>
                <div className="mt-2">
                    <PatientInfoRow label="주소" placeholder="주소를 연동합니다." />
                </div>
            </div>

            {/* 4 sections */}
            {value.sections.map((section, idx) => (
                <SectionPanel
                    key={section.key}
                    section={section}
                    onChange={(next) => updateSection(idx, next)}
                />
            ))}
        </div>
    );
}

function PatientInfoRow({ label, placeholder }: { label: string; placeholder: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#8B3F50] shrink-0 min-w-[68px]">{label}</span>
            <span className="text-[#C9A0A8] italic flex-1">{placeholder}</span>
        </div>
    );
}

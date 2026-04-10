import { Stethoscope, Signature, Plus, X } from "lucide-react";
import type { SignatureConfig, ChoiceOption, SectionKey } from "../../types/documentationBuilder";
import { newOptionId, SECTION_LABELS } from "../../types/documentationBuilder";

interface Props {
    sectionKey: SectionKey;
    config: SignatureConfig;
    onChange: (next: SignatureConfig) => void;
}

export function SignatureSection({ sectionKey, config, onChange }: Props) {
    const isDoctor = sectionKey === "doctor_sign";
    const Icon = isDoctor ? Stethoscope : Signature;

    return (
        <div className="rounded-2xl border border-[#F8DCE2] bg-white p-5 shadow-[0_2px_10px_rgba(226,107,124,0.04)]">
            {/* Section header */}
            <div className="flex items-center gap-2.5 mb-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FCEBEF]">
                    <Icon className="h-3.5 w-3.5 text-[#8B3F50]" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-extrabold text-[#5C2A35] leading-tight">{SECTION_LABELS[sectionKey]}</div>
                </div>
            </div>
            <div className="text-[11px] text-[#8B5A66] mb-4 ml-[38px]">
                {isDoctor ? "담당의 / 설명자 서명을 받을지 선택하세요" : "환자 / 법정 대리인 서명 항목을 선택하세요"}
            </div>

            {isDoctor ? (
                <DoctorPanel config={config} onChange={onChange} />
            ) : (
                <PatientPanel config={config} onChange={onChange} />
            )}
        </div>
    );
}

// ============================================================
// Doctor signature panel
// ============================================================

function DoctorPanel({ config, onChange }: { config: SignatureConfig; onChange: (next: SignatureConfig) => void }) {
    const update = (patch: Partial<SignatureConfig["doctor"]>) => {
        onChange({ ...config, doctor: { ...config.doctor, ...patch } });
    };

    const noneSelected = !config.doctor.primary && !config.doctor.explainer;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <ToggleCard
                    label="담당의 서명 받기"
                    description="담당 의사의 서명란을 표시합니다"
                    checked={config.doctor.primary}
                    onChange={(primary) => update({ primary })}
                />
                <ToggleCard
                    label="설명자 서명 받기"
                    description="시술 설명자의 서명란을 표시합니다"
                    checked={config.doctor.explainer}
                    onChange={(explainer) => update({ explainer })}
                />
            </div>
            {noneSelected && (
                <div className="rounded-lg border border-dashed border-[#F8DCE2] bg-[#FCF7F8]/50 px-4 py-3 text-[11px] text-[#8B5A66] text-center italic">
                    담당의 / 설명자 서명을 모두 받지 않습니다.
                </div>
            )}
        </div>
    );
}

// ============================================================
// Patient signature panel
// ============================================================

function PatientPanel({ config, onChange }: { config: SignatureConfig; onChange: (next: SignatureConfig) => void }) {
    const update = (patch: Partial<SignatureConfig["patient"]>) => {
        onChange({ ...config, patient: { ...config.patient, ...patch } });
    };

    const updateReason = (id: string, patch: Partial<ChoiceOption>) => {
        update({
            legalGuardianReasons: config.patient.legalGuardianReasons.map((opt) =>
                opt.id === id ? { ...opt, ...patch } : opt
            ),
        });
    };

    const addReason = (hasNote: boolean) => {
        const newOpt: ChoiceOption = { id: newOptionId(), label: "", hasNote };
        update({ legalGuardianReasons: [...config.patient.legalGuardianReasons, newOpt] });
    };

    const removeReason = (id: string) => {
        update({ legalGuardianReasons: config.patient.legalGuardianReasons.filter((opt) => opt.id !== id) });
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
                <ToggleCard
                    label="환자와의 관계"
                    description="환자와의 관계 입력란"
                    checked={config.patient.relation}
                    onChange={(relation) => update({ relation })}
                />
                <ToggleCard
                    label="환자 서명"
                    description="환자 본인 서명란"
                    checked={config.patient.patient}
                    onChange={(patient) => update({ patient })}
                />
                <ToggleCard
                    label="법정 대리인 서명"
                    description="대리인 서명 + 사유"
                    checked={config.patient.legalGuardian}
                    onChange={(legalGuardian) => update({ legalGuardian })}
                />
            </div>

            {/* Legal guardian reason options (only when legalGuardian is enabled) */}
            {config.patient.legalGuardian && (
                <div className="rounded-lg border border-[#F8DCE2] bg-[#FCF7F8]/40 p-3">
                    <div className="text-[11px] font-bold text-[#8B3F50] mb-2">대리인 서명 사유 옵션</div>
                    <div className="space-y-1.5">
                        {config.patient.legalGuardianReasons.length === 0 && (
                            <div className="text-[11px] text-[#C9A0A8] italic px-2 py-2 rounded border border-dashed border-[#F8DCE2] text-center">
                                옵션을 추가해 주세요.
                            </div>
                        )}
                        {config.patient.legalGuardianReasons.map((opt) => (
                            <div key={opt.id} className="flex items-center gap-2">
                                <span className="text-[#C9A0A8] text-[14px] shrink-0">○</span>
                                <input
                                    type="text"
                                    value={opt.label}
                                    onChange={(e) => updateReason(opt.id, { label: e.target.value })}
                                    placeholder="옵션 텍스트"
                                    className="flex-1 text-[12px] text-[#2A1F22] bg-white border-0 border-b border-[#F8DCE2] focus:border-[#D27A8C] focus:ring-0 outline-none px-1 py-1"
                                />
                                {opt.hasNote && (
                                    <input
                                        type="text"
                                        disabled
                                        placeholder="비고 (환자 입력)"
                                        className="w-32 text-[11px] text-[#C9A0A8] bg-[#FCF7F8] border border-dashed border-[#F8DCE2] rounded px-2 py-1 outline-none"
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeReason(opt.id)}
                                    className="p-1 rounded text-[#C9A0A8] hover:text-[#99354E] hover:bg-[#FCEBEF] transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 pt-2 mt-2 border-t border-[#F8DCE2] text-[11px]">
                        <button
                            type="button"
                            onClick={() => addReason(false)}
                            className="inline-flex items-center gap-1 text-[#8B3F50] hover:text-[#5C2A35] hover:underline"
                        >
                            <Plus className="h-3 w-3" />
                            옵션 추가
                        </button>
                        <span className="text-[#C9A0A8]">또는</span>
                        <button
                            type="button"
                            onClick={() => addReason(true)}
                            className="inline-flex items-center gap-1 text-[#8B3F50] hover:text-[#5C2A35] hover:underline"
                        >
                            <Plus className="h-3 w-3" />
                            비고란 옵션 추가
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// Toggle card (used by both doctor & patient panels)
// ============================================================

function ToggleCard({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                checked
                    ? "border-[#D27A8C] bg-gradient-to-br from-[#FCEBEF] to-white shadow-[0_3px_10px_rgba(226,107,124,0.18)]"
                    : "border-[#F8DCE2] bg-white hover:border-[#D27A8C]/50 hover:bg-[#FCF7F8]"
            }`}
        >
            <div className="flex items-start gap-2">
                <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked ? "border-[#D27A8C] bg-[#D27A8C]" : "border-[#F8DCE2] bg-white"
                    }`}
                >
                    {checked && (
                        <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className={`text-[12px] font-extrabold leading-tight ${checked ? "text-[#8B3F50]" : "text-[#5C2A35]"}`}>
                        {label}
                    </div>
                    <div className="text-[10px] text-[#8B5A66] mt-0.5">{description}</div>
                </div>
            </div>
        </button>
    );
}

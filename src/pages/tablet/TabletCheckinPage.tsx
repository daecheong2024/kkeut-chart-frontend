import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { tabletService, TabletVisitPurpose, TabletReservation } from "../../services/tabletService";
import type { KioskPatient } from "../../services/kioskService";

function formatPhoneNumber(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function TabletCheckinPage() {
    const [searchParams] = useSearchParams();
    const [branchId] = useState(String(searchParams.get("branchId") || "1"));

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [phone, setPhone] = useState("");
    const [showKeypad, setShowKeypad] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const [patients, setPatients] = useState<KioskPatient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<KioskPatient | null>(null);
    const [reservations, setReservations] = useState<TabletReservation[]>([]);
    const [selectedReservationId, setSelectedReservationId] = useState<number | null>(null);

    const [visitPurposes, setVisitPurposes] = useState<TabletVisitPurpose[]>([]);
    const [selectedPurposeIds, setSelectedPurposeIds] = useState<string[]>([]);

    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const resetFlow = () => {
        setStep(1);
        setPhone("");
        setShowKeypad(true);
        setError("");
        setPatients([]);
        setSelectedPatient(null);
        setReservations([]);
        setSelectedReservationId(null);
        setSelectedPurposeIds([]);
    };

    const handleSearch = async () => {
        if (!phone.trim()) {
            setError("휴대폰 번호를 입력해 주세요.");
            return;
        }
        setError("");
        setLoading(true);
        try {
            const res = await tabletService.verifyPatient(branchId, phone.trim());
            const list = res.patients || [];
            setPatients(list);
            if (list.length === 0) {
                setError("등록된 환자가 없습니다.");
            } else if (list.length === 1) {
                await selectPatient(list[0]);
            }
        } catch {
            setError("환자 조회에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const selectPatient = async (patient: KioskPatient) => {
        setSelectedPatient(patient);
        setError("");
        try {
            const [resv, purposes] = await Promise.all([
                tabletService.getTodayReservations(branchId, patient.id),
                tabletService.getVisitPurposes(branchId),
            ]);
            setReservations(resv);
            setVisitPurposes(purposes);
            if (resv.length === 1) setSelectedReservationId(resv[0].id);
            setStep(2);
        } catch {
            setError("정보를 불러오지 못했습니다.");
        }
    };

    const handleProceedToStep3 = () => {
        setError("");
        setStep(3);
    };

    const handleCheckin = async () => {
        if (!selectedPatient) return;
        setError("");
        setSubmitting(true);
        try {
            await tabletService.checkin({
                branchId: Number(branchId),
                customerId: selectedPatient.id,
                reservationId: selectedReservationId ?? undefined,
                visitPurposeIds: selectedPurposeIds.length > 0 ? selectedPurposeIds : undefined,
            });
            setShowSuccessModal(true);
        } catch (e: any) {
            setError(e?.response?.data?.message || "접수에 실패했습니다.");
        } finally {
            setSubmitting(false);
        }
    };

    const togglePurpose = (id: string) => {
        setSelectedPurposeIds((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
        );
    };

    return (
        <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-6" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
            <div className="w-full max-w-[600px] space-y-6">

                <div className="text-center mb-2">
                    <h1 className="text-2xl font-bold text-[#1A237E]">태블릿 접수</h1>
                    <p className="text-sm text-[#616161] mt-1">휴대폰번호를 입력하여 접수를 진행해 주세요.</p>
                </div>

                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                        {error}
                    </div>
                )}

                {step === 1 && (
                    <div className="rounded-2xl border border-[#C5CAE9] bg-white p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-[#242424] mb-4">휴대전화번호로 접수하기</h2>
                        <p className="text-xs text-[#616161] mb-4">예약시 사용한 휴대전화번호 또는 접수받으실 환자분의 휴대전화번호를 입력해주세요.</p>

                        <div className="rounded-xl bg-[#F8F9FD] border border-[#C5CAE9] px-4 py-3 text-center text-2xl font-black tracking-widest text-[#242424] min-h-[52px] mb-4">
                            {phone || <span className="text-[#C5CAE9]">010-0000-0000</span>}
                        </div>

                        {showKeypad && (
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setPhone((prev) => formatPhoneNumber(prev.replace(/\D/g, "") + n))}
                                        className="h-14 rounded-xl bg-white border border-[#C5CAE9] text-xl font-bold text-[#242424] active:bg-[#E8EAF6] transition-all duration-200"
                                    >
                                        {n}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setPhone(formatPhoneNumber("010"))}
                                    className="h-14 rounded-xl bg-white border border-[#C5CAE9] text-sm font-bold text-[#242424] active:bg-[#E8EAF6] transition-all duration-200"
                                >
                                    010
                                </button>
                                <button
                                    onClick={() => setPhone((prev) => formatPhoneNumber(prev.replace(/\D/g, "") + "0"))}
                                    className="h-14 rounded-xl bg-white border border-[#C5CAE9] text-xl font-bold text-[#242424] active:bg-[#E8EAF6] transition-all duration-200"
                                >
                                    0
                                </button>
                                <button
                                    onClick={() => setPhone((prev) => formatPhoneNumber(prev.replace(/\D/g, "").slice(0, -1)))}
                                    className="h-14 rounded-xl bg-[#F8F9FD] border border-[#C5CAE9] text-sm font-bold text-[#616161] active:bg-[#E8EAF6] transition-all duration-200"
                                >
                                    지움
                                </button>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={() => setPhone("")}
                                className="flex-1 h-12 rounded-xl border border-[#C5CAE9] text-sm font-bold text-[#616161] hover:bg-[#E8EAF6] transition-all duration-200"
                            >
                                전체삭제
                            </button>
                            <button
                                onClick={handleSearch}
                                disabled={loading || !phone.trim()}
                                className="flex-1 h-12 rounded-xl bg-[#3F51B5] text-sm font-bold text-white hover:bg-[#303F9F] disabled:opacity-50 transition-all duration-200"
                            >
                                {loading ? "조회 중..." : "다음"}
                            </button>
                        </div>

                        {patients.length > 1 && (
                            <div className="mt-4 space-y-2">
                                <div className="text-sm font-bold text-[#242424]">환자를 선택해 주세요</div>
                                {patients.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => selectPatient(p)}
                                        className="w-full rounded-xl border border-[#C5CAE9] bg-white px-4 py-3 text-left hover:bg-[#E8EAF6] transition-all duration-200"
                                    >
                                        <div className="text-base font-bold text-[#242424]">{p.name}</div>
                                        <div className="text-xs text-[#616161] mt-0.5">
                                            {p.birthDate || "-"} | {p.gender || "-"} | {p.phone || "-"}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && selectedPatient && (
                    <div className="rounded-2xl border border-[#C5CAE9] bg-white p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-[#242424] mb-1">접수정보 확인</h2>
                        <p className="text-sm text-[#616161] mb-4">해당 정보로 접수하시겠어요?</p>

                        <div className="rounded-xl bg-[#F8F9FD] border border-[#C5CAE9] p-4 mb-4 space-y-2">
                            <div className="flex gap-4">
                                <span className="text-sm text-[#616161] w-16">이름</span>
                                <span className="text-sm font-bold text-[#242424]">{selectedPatient.name}</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-sm text-[#616161] w-16">생년월일</span>
                                <span className="text-sm font-bold text-[#242424]">{selectedPatient.birthDate || "-"}</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-sm text-[#616161] w-16">성별</span>
                                <span className="text-sm font-bold text-[#242424]">{selectedPatient.gender || "-"}</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-sm text-[#616161] w-16">전화번호</span>
                                <span className="text-sm font-bold text-[#242424]">{selectedPatient.phone || "-"}</span>
                            </div>
                        </div>

                        {reservations.length > 0 && (
                            <div className="mb-4">
                                <div className="text-sm font-bold text-[#242424] mb-2">오늘 예약</div>
                                <div className="space-y-2">
                                    {reservations.map((r) => (
                                        <button
                                            key={r.id}
                                            onClick={() => setSelectedReservationId(selectedReservationId === r.id ? null : r.id)}
                                            className={`w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                                                selectedReservationId === r.id
                                                    ? "border-[#3F51B5] bg-[#E8EAF6]"
                                                    : "border-[#C5CAE9] bg-white hover:bg-[#F8F9FD]"
                                            }`}
                                        >
                                            <div className="text-sm font-bold text-[#242424]">
                                                {format(new Date(r.reservDateTime), "HH:mm")} · {r.categoryName}
                                            </div>
                                            {r.plannedTicketNames && r.plannedTicketNames.length > 0 && (
                                                <div className="text-xs text-[#616161] mt-1">
                                                    시술: {r.plannedTicketNames.join(", ")}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={resetFlow}
                                className="flex-1 h-12 rounded-xl border border-[#C5CAE9] text-sm font-bold text-[#616161] hover:bg-[#E8EAF6] transition-all duration-200"
                            >
                                접수정보가 다릅니다
                            </button>
                            <button
                                onClick={handleProceedToStep3}
                                className="flex-1 h-12 rounded-xl bg-[#3F51B5] text-sm font-bold text-white hover:bg-[#303F9F] transition-all duration-200"
                            >
                                접수를 진행합니다
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && selectedPatient && (
                    <div className="rounded-2xl border border-[#C5CAE9] bg-white p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-[#242424] mb-1">[{selectedPatient.name}] 방문목적 선택</h2>
                        <p className="text-sm text-[#616161] mb-4">어떤 진료를 보러 오셨나요?</p>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <button
                                onClick={() => {
                                    setSelectedPurposeIds([]);
                                    handleCheckinDirect();
                                }}
                                className={`h-16 rounded-xl border text-sm font-bold transition-all duration-200 ${
                                    selectedPurposeIds.length === 0
                                        ? "border-[#3F51B5] bg-[#E8EAF6] text-[#3F51B5]"
                                        : "border-[#C5CAE9] bg-white text-[#616161] hover:bg-[#F8F9FD]"
                                }`}
                            >
                                해당없음
                            </button>
                            {visitPurposes.map((vp) => (
                                <button
                                    key={vp.id}
                                    onClick={() => togglePurpose(vp.id)}
                                    className={`h-16 rounded-xl border text-sm font-bold transition-all duration-200 ${
                                        selectedPurposeIds.includes(vp.id)
                                            ? "border-[#3F51B5] bg-[#E8EAF6] text-[#3F51B5]"
                                            : "border-[#C5CAE9] bg-white text-[#242424] hover:bg-[#F8F9FD]"
                                    }`}
                                >
                                    {vp.name}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setStep(2)}
                                className="flex-1 h-12 rounded-xl border border-[#C5CAE9] text-sm font-bold text-[#616161] hover:bg-[#E8EAF6] transition-all duration-200"
                            >
                                이전
                            </button>
                            <button
                                onClick={handleCheckin}
                                disabled={submitting || selectedPurposeIds.length === 0}
                                className="flex-1 h-12 rounded-xl bg-[#3F51B5] text-sm font-bold text-white hover:bg-[#303F9F] disabled:opacity-50 transition-all duration-200"
                            >
                                {submitting ? "접수 중..." : "다음"}
                            </button>
                        </div>
                    </div>
                )}

                {showSuccessModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            </div>
                            <h3 className="text-2xl font-black text-[#242424] mb-2">접수 완료</h3>
                            <p className="text-base text-[#616161] mb-6">접수가 완료되었습니다.</p>
                            <button
                                onClick={() => {
                                    setShowSuccessModal(false);
                                    resetFlow();
                                }}
                                className="h-12 w-full rounded-xl bg-[#242424] text-base font-bold text-white hover:bg-[#1a1a1a] transition-all duration-200"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    function handleCheckinDirect() {
        if (!selectedPatient) return;
        setSubmitting(true);
        setError("");
        tabletService.checkin({
            branchId: Number(branchId),
            customerId: selectedPatient.id,
            reservationId: selectedReservationId ?? undefined,
        }).then(() => {
            setShowSuccessModal(true);
        }).catch((e: any) => {
            setError(e?.response?.data?.message || "접수에 실패했습니다.");
        }).finally(() => {
            setSubmitting(false);
        });
    }
}

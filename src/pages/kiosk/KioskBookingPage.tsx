import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock3, Layers3, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { CustomDatePicker } from "../../components/common/CustomDatePicker";
import { resolveActiveBranchId } from "../../utils/branch";
import {
  buildAllowedTimesForCategory,
  evaluateTicketCycleState,
  formatDateOnly,
  pickNearestAllowedTime,
} from "../../utils/reservationAvailability";
import {
  kioskService,
  type KioskCategory,
  type KioskPatient,
  type KioskTicket,
} from "../../services/kioskService";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const toDateInput = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatAllowedDays = (ticket: KioskTicket): string | null => {
  if (!Array.isArray(ticket.allowedDays) || ticket.allowedDays.length === 0) {
    return null;
  }

  const labels = ticket.allowedDays
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .map((day) => WEEKDAY_LABELS[day] || "")
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : null;
};

const formatAllowedTimeRange = (ticket: KioskTicket): string | null => {
  const start = ticket.allowedTimeRange?.start?.trim();
  const end = ticket.allowedTimeRange?.end?.trim();
  if (!start && !end) {
    return null;
  }

  return `${start || "00:00"} - ${end || "23:59"}`;
};

const intersectTicketCategories = (selectedTickets: KioskTicket[]): KioskCategory[] => {
  if (selectedTickets.length === 0) return [];

  const [first, ...rest] = selectedTickets;
  if (!first) return [];
  return (first.categories || []).filter((category) =>
    rest.every((ticket) => (ticket.categories || []).some((item) => String(item.id) === String(category.id)))
  );
};

function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function KioskBookingPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [branchId] = useState(
    String(searchParams.get("branchId") || resolveActiveBranchId("1") || "1")
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");

  const [patients, setPatients] = useState<KioskPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);

  const [tickets, setTickets] = useState<KioskTicket[]>([]);
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [hospitalOperatingHours, setHospitalOperatingHours] = useState<Record<string, string>>({});
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string>("");

  const [showKeypad, setShowKeypad] = useState(false);

  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const isTabletMode = location.pathname.includes("tablet");
  const modeLabel = isTabletMode ? "태블릿 예약" : "키오스크 예약";
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  );
  const selectedTicketIdSet = useMemo(() => new Set(selectedTicketIds), [selectedTicketIds]);
  const selectedTickets = useMemo(
    () => tickets.filter((ticket) => selectedTicketIdSet.has(ticket.ticketHistId)),
    [tickets, selectedTicketIdSet]
  );
  const selectedTicketKey = useMemo(
    () => [...selectedTicketIds].sort((a, b) => a - b).join(","),
    [selectedTicketIds]
  );
  const categoryOptions = useMemo(() => intersectTicketCategories(selectedTickets), [selectedTickets]);
  const selectedCategory = useMemo<KioskCategory | null>(
    () => categoryOptions.find((category) => String(category.id) === String(selectedCategoryId)) || null,
    [categoryOptions, selectedCategoryId]
  );
  const selectedDateKey = useMemo(() => toDateInput(selectedDate), [selectedDate]);
  const selectedTicketCycles = useMemo(() => {
    const next = new Map<number, ReturnType<typeof evaluateTicketCycleState>>();
    selectedTickets.forEach((ticket) => {
      next.set(ticket.ticketHistId, evaluateTicketCycleState(ticket, selectedDate));
    });
    return next;
  }, [selectedTickets, selectedDate]);
  const locallyAllowedTimes = useMemo(
    () => buildAllowedTimesForCategory(selectedCategory, selectedDate, hospitalOperatingHours, selectedTickets),
    [selectedCategory, selectedDate, hospitalOperatingHours, selectedTickets]
  );
  const canProceedToSchedule = selectedTickets.length > 0 && categoryOptions.length > 0;

  const clearReservationSelection = () => {
    setAvailableTimes([]);
    setSelectedTime("");
    setError("");
    setSuccess("");
  };

  const resetTicketState = () => {
    setTickets([]);
    setSelectedTicketIds([]);
    setSelectedCategoryId("");
    setSelectedDate(new Date());
    setHospitalOperatingHours({});
    clearReservationSelection();
  };

  const handleVerifyPatient = async () => {
    if (!phone.trim()) {
      setError("휴대폰 번호를 입력해 주세요.");
      return;
    }

    setError("");
    setSuccess("");
    setLoadingVerify(true);
    resetTicketState();
    setSelectedPatientId(null);
    setStep(1);

    try {
      const response = await kioskService.verifyPatient({
        branchId,
        phone: phone.trim(),
      });
      const nextPatients = response.patients || [];
      setPatients(nextPatients);
      if (nextPatients.length === 0) {
        setError("일치하는 환자를 찾지 못했습니다. 입력한 정보를 다시 확인해 주세요.");
      }
    } catch (e: any) {
      setPatients([]);
      setError(e?.response?.data?.message || "환자 조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingVerify(false);
    }
  };

  const handleLoadTickets = async (patientId: number) => {
    setError("");
    setSuccess("");
    setLoadingTickets(true);
    clearReservationSelection();

    try {
      const response = await kioskService.getPatientTickets(patientId, branchId);
      const loadedTickets = response.tickets || [];
      setTickets(loadedTickets);
      setHospitalOperatingHours(response.hospitalOperatingHours || {});
      setSelectedTicketIds((prev) => {
        const kept = prev.filter((id) => loadedTickets.some((ticket) => ticket.ticketHistId === id));
        if (kept.length > 0) {
          return kept;
        }
        return loadedTickets.length === 1 ? [loadedTickets[0]!.ticketHistId] : [];
      });

      if (loadedTickets.length === 0) {
        setError("예약 가능한 남은 시술권이 없습니다.");
      }
    } catch (e: any) {
      setTickets([]);
      setHospitalOperatingHours({});
      setSelectedTicketIds([]);
      setError(e?.response?.data?.message || "시술권 조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleSelectPatient = async (patientId: number) => {
    setSelectedPatientId(patientId);
    setStep(2);
    await handleLoadTickets(patientId);
  };

  const toggleTicketSelection = (histId: number) => {
    setSelectedTicketIds((prev) => {
      if (prev.includes(histId)) {
        return prev.filter((id) => id !== histId);
      }

      const newTicket = tickets.find((t) => t.ticketHistId === histId);
      if (!newTicket) return [...prev, histId];

      if (prev.length > 0) {
        const currentTickets = tickets.filter((t) => prev.includes(t.ticketHistId));
        const commonCategories = intersectTicketCategories([...currentTickets, newTicket]);
        if (commonCategories.length === 0) {
          return [histId];
        }
      }

      return [...prev, histId];
    });
    clearReservationSelection();
  };

  const handleResetFlow = () => {
    setStep(1);
    setPhone("");
    setMemo("");
    setPatients([]);
    setSelectedPatientId(null);
    resetTicketState();
  };

  const handleCreateReservation = async () => {
    if (!selectedPatientId || selectedTickets.length === 0 || !selectedCategoryId || !selectedTime) {
      setError("환자, 시술권, 카테고리, 날짜, 시간을 모두 선택해 주세요.");
      return;
    }

    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      await kioskService.createReservation({
        branchId,
        customerId: selectedPatientId,
        ticketIds: selectedTickets.map((t) => t.ticketId),
        categoryId: selectedCategoryId,
        scheduledAt: `${selectedDateKey}T${selectedTime}:00`,
        memo: memo.trim() || undefined,
      });

      setSuccess(`${selectedDateKey} ${selectedTime} 예약이 완료되었습니다.`);
      setShowSuccessModal(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || "예약 생성 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (selectedTickets.length === 0) {
      setSelectedCategoryId("");
      setAvailableTimes([]);
      setSelectedTime("");
      return;
    }

    const validCategoryIds = new Set(categoryOptions.map((category) => String(category.id)));
    if (validCategoryIds.size === 0) {
      setSelectedCategoryId("");
      setAvailableTimes([]);
      setSelectedTime("");
      return;
    }

    if (!selectedCategoryId || !validCategoryIds.has(String(selectedCategoryId))) {
      setSelectedCategoryId(String(categoryOptions[0]?.id || ""));
    }
  }, [selectedTickets, categoryOptions, selectedCategoryId]);

  useEffect(() => {
    if (step !== 3 || !selectedPatientId || selectedTickets.length === 0 || !selectedCategoryId) {
      setAvailableTimes([]);
      setSelectedTime("");
      return;
    }

    if (locallyAllowedTimes.length === 0) {
      setAvailableTimes([]);
      setSelectedTime("");
      return;
    }

    let cancelled = false;

    const loadSlots = async () => {
      setLoadingSlots(true);
      setError("");

      try {
        const response = await kioskService.getAvailableSlots({
          branchId,
          customerId: selectedPatientId,
          ticketIds: selectedTicketIds,
          categoryId: selectedCategoryId,
          date: selectedDateKey,
        });

        if (cancelled) return;

        const nextTimes = (response.availableTimes || []).filter((time) => locallyAllowedTimes.includes(time));
        setAvailableTimes(nextTimes);
        setSelectedTime((prev) => pickNearestAllowedTime(prev, nextTimes));
      } catch (e: any) {
        if (cancelled) return;
        setAvailableTimes([]);
        setSelectedTime("");
        setError(e?.response?.data?.message || "예약 가능 시간을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    };

    void loadSlots();

    return () => {
      cancelled = true;
    };
  }, [
    step,
    branchId,
    selectedPatientId,
    selectedCategoryId,
    selectedDateKey,
    selectedTicketKey,
    selectedTicketIds,
    selectedTickets.length,
    locallyAllowedTimes,
  ]);

  const isDateDisabled = (date: Date): boolean => {
    const today = new Date();
    const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (candidate < todayOnly) {
      return true;
    }
    if (!selectedCategory || selectedTickets.length === 0) {
      return true;
    }
    if (selectedTickets.some((ticket) => !evaluateTicketCycleState(ticket, candidate).canReserve)) {
      return true;
    }
    return buildAllowedTimesForCategory(selectedCategory, candidate, hospitalOperatingHours, selectedTickets).length === 0;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_50%_0%,#eaf1ff_0%,#f4f6fb_38%,#f1f5f9_100%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className={`mx-auto flex min-h-[calc(100vh-3rem)] items-start justify-center ${isTabletMode ? "max-w-[1460px]" : "max-w-[1160px]"} md:items-center`}>
        <div className={`w-full space-y-5 ${isTabletMode ? "max-w-[1340px]" : "max-w-[980px]"}`}>
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.14)]">
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[34px] leading-none font-black tracking-tight text-slate-900">{modeLabel}</div>
                  <div className="mt-3 text-base text-slate-600">
                    환자 확인 후 남은 시술권으로 다음 예약을 바로 진행할 수 있습니다.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetFlow}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  처음으로
                </button>
              </div>

              <div className={`mt-6 flex items-center gap-2.5 ${isTabletMode ? "flex-nowrap overflow-x-auto pb-1" : "flex-wrap"}`}>
                {[
                  { id: 1 as const, label: "환자 검색" },
                  { id: 2 as const, label: "시술권 선택" },
                  { id: 3 as const, label: "예약 시간 선택" },
                ].map((item) => {
                  const active = step === item.id;
                  const completed = step > item.id;

                  return (
                    <div
                      key={`kiosk-step-${item.id}`}
                      className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-bold ${
                        active
                          ? "border-[rgb(var(--kkeut-primary))] bg-[rgba(var(--kkeut-primary),.12)] text-[rgb(var(--kkeut-primary-strong))]"
                          : completed
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      {item.id}. {item.label}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-3 text-xs font-semibold text-slate-500 sm:px-8">
              중앙 고정형 예약 플로우입니다. 각 단계에서 선택 후 다음 단계로 이동합니다.
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm">
              {success}
            </div>
          ) : null}

          {step === 1 && (
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_16px_36px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="mb-4 text-[24px] font-black tracking-tight text-slate-900">1. 휴대폰 번호로 검색</div>
              <div>
                <Input
                  value={phone}
                  readOnly
                  onFocus={() => setShowKeypad(true)}
                  placeholder="휴대폰 번호를 입력해 주세요"
                  className="h-14 rounded-2xl text-base cursor-pointer"
                />
              </div>

              {showKeypad && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700">전화번호 입력</span>
                    <button
                      type="button"
                      onClick={() => setShowKeypad(false)}
                      className="rounded-lg px-3 py-1 text-sm font-medium text-slate-500 hover:bg-slate-200"
                    >
                      닫기
                    </button>
                  </div>
                  <div className="mb-3 rounded-xl bg-white border border-slate-200 px-4 py-3 text-center text-2xl font-black tracking-widest text-slate-900 min-h-[48px]">
                    {phone || <span className="text-slate-300">010-0000-0000</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPhone((prev) => formatPhoneNumber(prev.replace(/\D/g, "") + n))}
                        className="h-14 rounded-xl bg-white border border-slate-200 text-xl font-bold text-slate-900 active:bg-slate-100 transition-colors"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPhone("")}
                      className="h-14 rounded-xl bg-rose-50 border border-rose-200 text-sm font-bold text-rose-600 active:bg-rose-100 transition-colors"
                    >
                      전체삭제
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhone((prev) => formatPhoneNumber(prev.replace(/\D/g, "") + "0"))}
                      className="h-14 rounded-xl bg-white border border-slate-200 text-xl font-bold text-slate-900 active:bg-slate-100 transition-colors"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhone((prev) => formatPhoneNumber(prev.replace(/\D/g, "").slice(0, -1)))}
                      className="h-14 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold text-slate-600 active:bg-slate-200 transition-colors"
                    >
                      ← 삭제
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <Button
                  variant="primary"
                  onClick={handleVerifyPatient}
                  disabled={loadingVerify || !branchId || !phone.trim()}
                  className="h-12 rounded-2xl px-7 text-base font-black"
                >
                  {loadingVerify ? "조회 중..." : "환자 조회"}
                </Button>
              </div>
              {patients.length > 0 ? (
                <div className="mt-5 grid max-h-[360px] gap-2.5 overflow-y-auto pr-1">
                  {patients.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => {
                        void handleSelectPatient(patient.id);
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:bg-slate-50"
                    >
                      <div className="text-lg font-black text-slate-900">
                        {patient.name} <span className="ml-2 text-sm font-semibold text-slate-500">#{patient.id}</span>
                      </div>
                      <div className="mt-1.5 text-sm text-slate-600">
                        {patient.phone || "-"} | {patient.birthDate || "-"} | {patient.gender || "-"}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {step === 2 && isTabletMode && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[28px] font-black tracking-tight text-slate-900">2. 시술권 선택</div>
                  <div className="mt-1 text-sm text-slate-500">
                    좌측 요약을 보면서 우측에서 여러 시술권을 빠르게 선택할 수 있습니다.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="h-11 rounded-xl px-4 font-bold">
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedPatientId && handleLoadTickets(selectedPatientId)}
                    disabled={!selectedPatientId || loadingTickets}
                    className="h-11 rounded-xl px-4 font-bold"
                  >
                    {loadingTickets ? "조회 중..." : "남은 시술권 새로고침"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setStep(3)}
                    disabled={!canProceedToSchedule}
                    className="h-11 rounded-xl px-5 font-bold"
                  >
                    예약 시간 선택
                  </Button>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Patient</div>
                    {selectedPatient ? (
                      <>
                        <div className="mt-3 text-2xl font-black tracking-tight text-slate-900">{selectedPatient.name}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          {selectedPatient.phone || "-"} · {selectedPatient.birthDate || "-"} · {selectedPatient.gender || "-"}
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-sm text-slate-500">먼저 환자를 선택해 주세요.</div>
                    )}
                  </div>

                  <div className="rounded-[24px] border border-sky-100 bg-sky-50/70 p-5">
                    <div className="flex items-center gap-2 text-sm font-bold text-sky-800">
                      <Layers3 className="h-4 w-4" />
                      여러 시술권 동시 선택
                    </div>
                    <div className="mt-2 text-sm leading-6 text-sky-700">
                      공통으로 예약 가능한 카테고리와 시간만 다음 단계에서 보여줍니다.
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-slate-800">선택 현황</div>
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                        {selectedTickets.length}건
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        <div className="text-slate-400">보유 시술권</div>
                        <div className="mt-1 text-lg font-black text-slate-900">{tickets.length}</div>
                      </div>
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        <div className="text-slate-400">공통 카테고리</div>
                        <div className="mt-1 text-lg font-black text-slate-900">{categoryOptions.length}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex max-h-[180px] flex-wrap gap-2 overflow-y-auto pr-1">
                      {selectedTickets.length > 0 ? (
                        selectedTickets.map((ticket) => (
                          <span
                            key={`selected-ticket-chip-tablet-${ticket.ticketHistId}`}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700"
                          >
                            {ticket.ticketName}
                          </span>
                        ))
                      ) : (
                        <div className="text-xs text-slate-500">선택된 시술권이 없습니다.</div>
                      )}
                    </div>
                  </div>

                </div>

                <div className="min-w-0">
                  {tickets.length > 0 ? (
                    <div className="grid max-h-[680px] gap-3 overflow-y-auto pr-1 xl:grid-cols-2">
                      {tickets.map((ticket) => {
                        const selected = selectedTicketIdSet.has(ticket.ticketHistId);
                        const allowedDays = formatAllowedDays(ticket);
                        const allowedTime = formatAllowedTimeRange(ticket);

                        return (
                          <button
                            key={ticket.ticketHistId}
                            type="button"
                            onClick={() => toggleTicketSelection(ticket.ticketHistId)}
                            className={`rounded-[24px] border px-5 py-4 text-left transition ${
                              selected
                                ? "border-[rgb(var(--kkeut-primary))] bg-[linear-gradient(135deg,rgba(var(--kkeut-primary),.08)_0%,rgba(59,130,246,.04)_100%)] shadow-[0_16px_34px_rgba(14,116,144,0.08)]"
                                : "border-[rgb(var(--kkeut-border))] bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-[22px] font-black tracking-tight text-slate-900">{ticket.ticketName}</div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                                  <span className="rounded-full bg-white/85 px-3 py-1 ring-1 ring-slate-200">
                                    잔여 {ticket.remainingCount}/{ticket.totalCount}
                                  </span>
                                  <span className="rounded-full bg-white/85 px-3 py-1 ring-1 ring-slate-200">
                                    만료 {ticket.expiryDate ? ticket.expiryDate.slice(0, 10) : "없음"}
                                  </span>
                                  {ticket.visitPurposeLabel ? (
                                    <span className="rounded-full bg-white/85 px-3 py-1 ring-1 ring-slate-200">
                                      {ticket.visitPurposeLabel}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div
                                className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full ${
                                  selected ? "bg-[rgb(var(--kkeut-primary))] text-white" : "bg-slate-100 text-slate-300"
                                }`}
                              >
                                <CheckCircle2 className="h-5 w-5" />
                              </div>
                            </div>

                            {(allowedDays || allowedTime) && (
                              <div className="mt-4 grid gap-2">
                                {allowedDays ? (
                                  <div className="rounded-2xl bg-white/85 px-3 py-2 ring-1 ring-slate-200">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">요일권</div>
                                    <div className="mt-1 font-semibold text-slate-800">{allowedDays}</div>
                                  </div>
                                ) : null}
                                {allowedTime ? (
                                  <div className="rounded-2xl bg-white/85 px-3 py-2 ring-1 ring-slate-200">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">예약 가능 시간</div>
                                    <div className="mt-1 font-semibold text-slate-800">{allowedTime}</div>
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : !loadingTickets ? (
                    <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm leading-6 text-slate-500">
                      선택 가능한 시술권이 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {step === 2 && !isTabletMode && (
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_16px_36px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[24px] font-black tracking-tight text-slate-900">2. 시술권 선택</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="h-11 rounded-xl px-4 font-bold">
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedPatientId && handleLoadTickets(selectedPatientId)}
                    disabled={!selectedPatientId || loadingTickets}
                    className="h-11 rounded-xl px-4 font-bold"
                  >
                    {loadingTickets ? "조회 중..." : "남은 시술권 새로고침"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setStep(3)}
                    disabled={!canProceedToSchedule}
                    className="h-11 rounded-xl px-5 font-bold"
                  >
                    예약 시간 선택
                  </Button>
                </div>
              </div>

              {selectedPatient ? (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
                  선택 환자: <span className="font-bold">{selectedPatient.name}</span>
                </div>
              ) : (
                <div className="text-sm text-slate-500">먼저 환자를 선택해 주세요.</div>
              )}

              {tickets.length > 0 ? (
                <>
                  <div className="mb-4 flex items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-800">
                    <Layers3 className="h-4 w-4" />
                    시술권은 여러 개 선택할 수 있습니다. 공통으로 예약 가능한 카테고리와 시간만 다음 단계에서 보여줍니다.
                  </div>

                  <div className="grid max-h-[440px] gap-3 overflow-y-auto pr-1">
                    {tickets.map((ticket) => {
                      const selected = selectedTicketIdSet.has(ticket.ticketHistId);

                      return (
                        <button
                          key={ticket.ticketHistId}
                          type="button"
                          onClick={() => toggleTicketSelection(ticket.ticketHistId)}
                          className={`rounded-[24px] border px-5 py-4 text-left transition ${
                            selected
                              ? "border-[rgb(var(--kkeut-primary))] bg-[linear-gradient(135deg,rgba(var(--kkeut-primary),.08)_0%,rgba(59,130,246,.04)_100%)] shadow-[0_16px_34px_rgba(14,116,144,0.08)]"
                              : "border-[rgb(var(--kkeut-border))] bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[26px] font-black tracking-tight text-slate-900">{ticket.ticketName}</div>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                                <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-slate-200">
                                  잔여 {ticket.remainingCount}/{ticket.totalCount}
                                </span>
                                <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-slate-200">
                                  만료 {ticket.expiryDate ? ticket.expiryDate.slice(0, 10) : "없음"}
                                </span>
                                {ticket.visitPurposeLabel ? (
                                  <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-slate-200">
                                    {ticket.visitPurposeLabel}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div
                              className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full ${
                                selected ? "bg-[rgb(var(--kkeut-primary))] text-white" : "bg-slate-100 text-slate-300"
                              }`}
                            >
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                          </div>

                          {ticket.minIntervalDays ? (
                            <div className="mt-4">
                              <div className="rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-slate-200 text-sm text-slate-600">
                                <div className="text-[11px] font-bold tracking-[0.18em] text-slate-400 uppercase">시술 주기</div>
                                <div className="mt-1 font-semibold text-slate-800">최소 {ticket.minIntervalDays}일</div>
                                {ticket.nextAvailableDate && (
                                  <div className="mt-0.5 text-xs text-amber-600 font-medium">다음 가능일 {ticket.nextAvailableDate}</div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-slate-600">
                        선택된 시술권 <span className="font-black text-slate-900">{selectedTickets.length}</span>건
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTickets.map((ticket) => (
                          <span
                            key={`selected-ticket-chip-${ticket.ticketHistId}`}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700"
                          >
                            {ticket.ticketName}
                          </span>
                        ))}
                      </div>
                    </div>
                    {categoryOptions.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span>예약 카테고리:</span>
                        {categoryOptions.map((cat) => (
                          <span key={cat.id} className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-0.5 text-xs font-bold text-indigo-700">
                            {cat.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                </>
              ) : !loadingTickets ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  선택 가능한 시술권이 없습니다.
                </div>
              ) : null}
            </div>
          )}

          {step === 3 && isTabletMode && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[28px] font-black tracking-tight text-slate-900">3. 예약 시간 선택</div>
                  <div className="mt-1 text-sm text-slate-500">
                    좌측에서 환자와 시술권 조건을 확인하고, 우측에서 카테고리와 날짜/시간을 선택합니다.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="h-11 rounded-xl px-4 font-bold">
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedPatientId && handleLoadTickets(selectedPatientId)}
                    disabled={!selectedPatientId || loadingTickets}
                    className="h-11 rounded-xl px-4 font-bold"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    시술권 다시 불러오기
                  </Button>
                </div>
              </div>

              {!selectedPatient || selectedTickets.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  환자와 시술권 선택 정보가 없습니다. 이전 단계로 돌아가 다시 선택해 주세요.
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_100%)] p-5 shadow-[0_20px_42px_rgba(15,23,42,0.05)]">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Reservation Summary</div>
                      <div className="mt-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-2xl font-black tracking-tight text-slate-900">{selectedPatient.name}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedTickets.map((ticket) => (
                              <span
                                key={`summary-ticket-tablet-${ticket.ticketHistId}`}
                                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700"
                              >
                                {ticket.ticketName}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right text-white shadow-[0_16px_32px_rgba(15,23,42,0.18)]">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">Selected</div>
                          <div className="mt-1 text-2xl font-black">{selectedTickets.length}건</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <Clock3 className="h-4 w-4 text-sky-600" />
                        선택된 시술권 체크
                      </div>
                      <div className="mt-3 space-y-2.5">
                        {selectedTickets.map((ticket) => {
                          const cycleState = selectedTicketCycles.get(ticket.ticketHistId);
                          return (
                            <div
                              key={`ticket-cycle-tablet-${ticket.ticketHistId}`}
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-black text-slate-900">{ticket.ticketName}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    잔여 {ticket.remainingCount}/{ticket.totalCount} · 만료 {formatDateOnly(ticket.expiryDate)}
                                  </div>
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                    cycleState?.canReserve
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-rose-50 text-rose-600"
                                  }`}
                                >
                                  {cycleState?.canReserve ? "예약 가능" : "예약 제한"}
                                </span>
                              </div>
                              <div
                                className={`mt-2 text-xs font-bold ${
                                  cycleState?.canReserve ? "text-emerald-600" : "text-rose-500"
                                }`}
                              >
                                {cycleState?.message}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                      <div className="text-sm font-bold text-slate-700">예약 메모</div>
                      <textarea
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        placeholder="요청 사항이 있으면 입력해 주세요"
                        className="mt-3 min-h-[148px] w-full rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white px-4 py-3 text-sm outline-none focus:border-[rgba(var(--kkeut-primary),.55)] focus:ring-2 focus:ring-[rgba(var(--kkeut-primary),.15)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {categoryOptions.length === 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                        선택된 시술권들로는 공통 예약 카테고리가 없습니다. 이전 단계에서 시술권 조합을 다시 골라 주세요.
                      </div>
                    ) : (
                      <>
                        <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                          <div className="text-sm font-bold text-slate-700">카테고리</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {categoryOptions.map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => setSelectedCategoryId(String(category.id))}
                                className={`rounded-2xl border px-4 py-2.5 text-sm font-bold transition ${
                                  selectedCategoryId === category.id
                                    ? "border-[rgb(var(--kkeut-primary))] bg-[rgba(var(--kkeut-primary),.08)] text-[rgb(var(--kkeut-primary-strong))]"
                                    : "border-[rgb(var(--kkeut-border))] bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                {category.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-4 2xl:grid-cols-[minmax(320px,0.84fr)_minmax(0,1.16fr)]">
                          <div className="rounded-[26px] border border-slate-200 bg-slate-50/60 p-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                              <CalendarDays className="h-4 w-4 text-sky-600" />
                              예약 날짜
                            </div>
                            <div className="mt-3">
                              <CustomDatePicker
                                value={selectedDate}
                                onChange={setSelectedDate}
                                variant="kiosk"
                                disabled={!selectedCategory}
                                isDateDisabled={isDateDisabled}
                                className="w-full"
                              />
                            </div>
                            <div className="mt-3 text-xs text-slate-500">
                              {!selectedCategory
                                ? "카테고리를 먼저 선택하면 예약 가능한 날짜만 열립니다."
                                : "시술 주기, 요일권, 카테고리 운영시간을 만족하는 날짜만 선택할 수 있습니다."}
                            </div>
                          </div>

                          <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-bold text-slate-700">예약 시간</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {selectedCategory
                                    ? `${selectedCategory.name} · ${selectedDateKey}`
                                    : "카테고리를 먼저 선택해 주세요"}
                                </div>
                              </div>
                              {loadingSlots ? (
                                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                                  시간 불러오는 중...
                                </div>
                              ) : null}
                            </div>

                            {availableTimes.length > 0 ? (
                              <div className="mt-4 grid max-h-[440px] grid-cols-3 gap-2.5 overflow-y-auto pr-1 2xl:grid-cols-4">
                                {availableTimes.map((time) => (
                                  <button
                                    key={time}
                                    type="button"
                                    onClick={() => setSelectedTime(time)}
                                    className={`h-14 rounded-2xl border px-2 text-base font-black transition ${
                                      selectedTime === time
                                        ? "border-[rgb(var(--kkeut-primary))] bg-[rgba(var(--kkeut-primary),.12)] text-[rgb(var(--kkeut-primary-strong))]"
                                        : "border-[rgb(var(--kkeut-border))] bg-white text-slate-700 hover:bg-slate-50"
                                    }`}
                                  >
                                    {time}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500">
                                {selectedCategory
                                  ? "선택한 날짜에는 가능한 예약 시간이 없습니다."
                                  : "카테고리를 선택하면 예약 가능한 시간이 표시됩니다."}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <div className="text-sm font-bold text-slate-700">예약 요약</div>
                              <div className="mt-2 text-sm text-slate-500">
                                {selectedCategory ? `${selectedCategory.name} / ${selectedDateKey} ${selectedTime || "--:--"}` : "카테고리와 시간을 선택해 주세요."}
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              onClick={handleCreateReservation}
                              disabled={submitting || !selectedCategory || !selectedTime || selectedTickets.length === 0}
                              className="h-12 rounded-2xl px-8 text-base font-black"
                            >
                              {submitting ? "예약 중..." : "예약 완료"}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && !isTabletMode && (
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_16px_36px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-[24px] font-black tracking-tight text-slate-900">3. 예약 시간 선택</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="h-11 rounded-xl px-4 font-bold">
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedPatientId && handleLoadTickets(selectedPatientId)}
                    disabled={!selectedPatientId || loadingTickets}
                    className="h-11 rounded-xl px-4 font-bold"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    시술권 다시 불러오기
                  </Button>
                </div>
              </div>

              {!selectedPatient || selectedTickets.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  환자와 시술권 선택 정보가 없습니다. 이전 단계로 돌아가 다시 선택해 주세요.
                </div>
              ) : (
                <>
                  <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_100%)] p-5 shadow-[0_20px_42px_rgba(15,23,42,0.05)]">
                    <div className="text-[11px] font-bold tracking-[0.22em] text-slate-400 uppercase">Reservation Summary</div>
                    <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-2xl font-black tracking-tight text-slate-900">{selectedPatient.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedTickets.map((ticket) => (
                            <span
                              key={`summary-ticket-${ticket.ticketHistId}`}
                              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700"
                            >
                              {ticket.ticketName}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right text-white shadow-[0_16px_32px_rgba(15,23,42,0.18)]">
                        <div className="text-[11px] font-bold tracking-[0.2em] text-slate-300 uppercase">Selected</div>
                        <div className="mt-1 text-2xl font-black">{selectedTickets.length}건</div>
                      </div>
                    </div>
                  </div>

                  {categoryOptions.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                      선택된 시술권들에 공통으로 예약 가능한 카테고리가 없습니다. 이전 단계에서 시술권 조합을 다시 선택해 주세요.
                    </div>
                  ) : (
                    <>
                      <div className="mt-5">
                        <div className="mb-2 text-sm font-bold text-slate-700">카테고리</div>
                        <div className="flex flex-wrap gap-2">
                          {categoryOptions.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => setSelectedCategoryId(String(category.id))}
                              className={`rounded-2xl border px-4 py-2.5 text-sm font-bold transition ${
                                selectedCategoryId === category.id
                                  ? "border-[rgb(var(--kkeut-primary))] bg-[rgba(var(--kkeut-primary),.08)] text-[rgb(var(--kkeut-primary-strong))]"
                                  : "border-[rgb(var(--kkeut-border))] bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {category.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 lg:grid-cols-[1.25fr_.95fr]">
                        <div className="rounded-[26px] border border-slate-200 bg-slate-50/60 p-4">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <CalendarDays className="h-4 w-4 text-sky-600" />
                            예약 날짜
                          </div>
                          <div className="mt-3">
                            <CustomDatePicker
                              value={selectedDate}
                              onChange={setSelectedDate}
                              variant="kiosk"
                              disabled={!selectedCategory}
                              isDateDisabled={isDateDisabled}
                              className="w-full"
                            />
                          </div>
                          <div className="mt-3 text-xs text-slate-500">
                            {!selectedCategory
                              ? "카테고리를 먼저 선택하면 예약 가능한 날짜만 열립니다."
                              : "시술 주기, 요일권, 카테고리 운영시간을 만족하는 날짜만 선택할 수 있습니다."}
                          </div>
                        </div>

                        <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <Clock3 className="h-4 w-4 text-sky-600" />
                            선택된 시술권 체크
                          </div>
                          <div className="mt-3 space-y-2.5">
                            {selectedTickets.map((ticket) => {
                              const cycleState = selectedTicketCycles.get(ticket.ticketHistId);
                              return (
                                <div
                                  key={`ticket-cycle-${ticket.ticketHistId}`}
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-black text-slate-900">{ticket.ticketName}</div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        잔여 {ticket.remainingCount}/{ticket.totalCount} · 만료 {formatDateOnly(ticket.expiryDate)}
                                      </div>
                                    </div>
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                        cycleState?.canReserve
                                          ? "bg-emerald-50 text-emerald-700"
                                          : "bg-rose-50 text-rose-600"
                                      }`}
                                    >
                                      {cycleState?.canReserve ? "예약 가능" : "예약 제한"}
                                    </span>
                                  </div>
                                  <div
                                    className={`mt-2 text-xs font-bold ${
                                      cycleState?.canReserve ? "text-emerald-600" : "text-rose-500"
                                    }`}
                                  >
                                    {cycleState?.message}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-slate-700">예약 시간</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {selectedCategory
                                ? `${selectedCategory.name} · ${selectedDateKey}`
                                : "카테고리를 먼저 선택해 주세요."}
                            </div>
                          </div>
                          {loadingSlots ? (
                            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                              시간 불러오는 중...
                            </div>
                          ) : null}
                        </div>

                        {availableTimes.length > 0 ? (
                          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                            {availableTimes.map((time) => (
                              <button
                                key={time}
                                type="button"
                                onClick={() => setSelectedTime(time)}
                                className={`h-12 rounded-2xl border px-2 text-sm font-bold transition ${
                                  selectedTime === time
                                    ? "border-[rgb(var(--kkeut-primary))] bg-[rgba(var(--kkeut-primary),.12)] text-[rgb(var(--kkeut-primary-strong))]"
                                    : "border-[rgb(var(--kkeut-border))] bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                {time}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                            {selectedCategory
                              ? "선택한 날짜에 가능한 예약 시간이 없습니다."
                              : "카테고리를 선택하면 가능한 예약 시간이 표시됩니다."}
                          </div>
                        )}
                      </div>

                      <div className="mt-5 space-y-2">
                        <div className="text-sm font-bold text-slate-700">예약 메모 (선택)</div>
                        <textarea
                          value={memo}
                          onChange={(e) => setMemo(e.target.value)}
                          placeholder="요청 사항이 있으면 입력해 주세요."
                          className="min-h-[108px] w-full rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white px-4 py-3 text-sm outline-none focus:border-[rgba(var(--kkeut-primary),.55)] focus:ring-2 focus:ring-[rgba(var(--kkeut-primary),.15)]"
                        />
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Button
                          variant="primary"
                          onClick={handleCreateReservation}
                          disabled={submitting || !selectedCategory || !selectedTime || selectedTickets.length === 0}
                          className="h-12 rounded-2xl px-8 text-base font-black"
                        >
                          {submitting ? "예약 중..." : "예약 완료"}
                        </Button>
                        {selectedCategory ? (
                          <span className="text-sm text-slate-500">
                            선택: {selectedCategory.name} / {selectedDateKey} {selectedTime || "--:--"}
                          </span>
                        ) : null}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">예약 완료</h3>
            <p className="text-base text-slate-600 mb-6">{success}</p>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                setSuccess("");
                handleResetFlow();
              }}
              className="h-12 w-full rounded-2xl bg-slate-900 text-base font-bold text-white hover:bg-slate-800 transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

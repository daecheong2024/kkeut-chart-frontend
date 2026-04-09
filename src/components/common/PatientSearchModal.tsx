import React, { useState, useEffect, useRef } from "react";
import { Search, X, Info, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NewPatientModal } from "./NewPatientModal";
import { createPortal } from "react-dom";
import { patientService } from "../../services/patientService";
import { ReceptionForm } from "../chart/ReceptionForm";
import { visitService } from "../../services/visitService";
import { ticketService } from "../../services/ticketService";
import { useScheduleStore } from "../../stores/useScheduleStore";
import { useChartStore } from "../../stores/useChartStore";
import { resolveActiveBranchId } from "../../utils/branch";
import { Gift } from "lucide-react";
import { ConfirmModal } from "../chart/ConfirmModal";
import { fetchQuickTicketOptions, canOverrideCycleBlock, type QuickTicketOption } from "../../utils/quickTicketOption";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { Ticket as TicketIcon } from "lucide-react";
import apiClient from "../../services/apiClient";

interface PatientSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectPatient?: (patient: SearchedPatient) => void;
}

interface SearchedPatient {
    id: number;
    no: string;
    name: string;
    sex: string;
    age: number;
    dob: string;
    phone: string;
    passport?: string;
    insured?: string;
    plan?: string;
    lastContent?: string;
    isTemporary?: boolean;
    tag?: string;
    gender?: string; // For compatibility with ReservationDetailPanel
    birthDate?: string; // For compatibility with ReservationDetailPanel
}

export function PatientSearchModal({ isOpen, onClose, onSelectPatient }: PatientSearchModalProps) {
    const navigate = useNavigate();
    const [searchText, setSearchText] = useState("");
    const [isNewPatientOpen, setIsNewPatientOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [selectedPatientForEdit, setSelectedPatientForEdit] = useState<SearchedPatient | null>(null);
    const [patients, setPatients] = useState<SearchedPatient[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // State for showing ReceptionForm inline
    const [showReceptionForm, setShowReceptionForm] = useState(false);
    const [selectedPatientForReception, setSelectedPatientForReception] = useState<SearchedPatient | null>(null);
    const [tagMaster, setTagMaster] = useState<{ id: number; name: string }[]>([]);
    const [quickTicketPickerData, setQuickTicketPickerData] = useState<{ tickets: any[]; receptionData: any; _selectedIds?: string[] } | null>(null);
    const [quickTicketBusy, setQuickTicketBusy] = useState(false);
    const [modalAlert, setModalAlert] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const fetchTags = async () => {
            try {
                const branchId = resolveActiveBranchId("");
                if (!branchId) return;
                const response = await apiClient.get(`/settings/tags?branchId=${branchId}`);
                const data = response.data ?? [];
                setTagMaster(data.map((t: any) => ({ id: t.id, name: t.name })));
            } catch {
            }
        };
        fetchTags();
    }, [isOpen]);

    // Fetch patients from backend when search changes
    useEffect(() => {
        if (!searchText.trim()) {
            setPatients([]);
            return;
        }

        let active = true;
        const fetchPatients = async () => {
            setIsLoading(true);
            try {
                const response = await patientService.searchPatients(searchText);
                if (!active) return;
                const results = Array.isArray(response) ? response : (response?.items ?? []);
                const transformed = results.map((p: any) => ({
                    id: p.id,
                    no: p.chartNo || p.id?.toString() || "",
                    name: p.name || "",
                    sex: (p.gender === "MALE" || p.gender === "M") ? "남" : (p.gender === "FEMALE" || p.gender === "F") ? "여" : "기타",
                    age: p.age || 0,
                    dob: p.birthDate || "",
                    phone: p.phone || "",
                    passport: "-",
                    insured: "본인",
                    plan: "없음",
                    lastContent: p.lastVisit || "",
                    isTemporary: p.isTemporary || false,
                    tag: p.tag,
                    gender: (p.gender === "MALE" || p.gender === "M") ? "남" : (p.gender === "FEMALE" || p.gender === "F") ? "여" : "기타",
                    birthDate: p.birthDate || ""
                }));
                setPatients(transformed);
            } catch (error) {
                if (!active) return;
                console.error("Failed to fetch patients:", error);
                setPatients([]);
            } finally {
                if (!active) return;
                setIsLoading(false);
            }
        };

        // Debounce search
        const timer = setTimeout(fetchPatients, 300);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [searchText]);

    useEffect(() => {
        if (isOpen) return;
        // Reset modal-local state so reopening starts from a clean slate.
        setSearchText("");
        setPatients([]);
        setIsLoading(false);
        setShowReceptionForm(false);
        setSelectedPatientForReception(null);
        setIsNewPatientOpen(false);
        setModalMode("create");
        setSelectedPatientForEdit(null);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && !isNewPatientOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, isNewPatientOpen]);

    const handleEditClick = async (patient: any) => {
        try {
            const detail = await patientService.getById(patient.no || patient.id);
            if (detail) {
                setSelectedPatientForEdit(detail as any);
                setModalMode('edit');
                setIsNewPatientOpen(true);
            }
        } catch (error) {
            console.error("Failed to fetch patient details", error);
            setModalAlert("환자 정보를 불러오는데 실패했습니다.");
        }
    };

    const handleModalClose = () => {
        setIsNewPatientOpen(false);
        // Reset mode after animation
        setTimeout(() => {
            setModalMode('create');
            setSelectedPatientForEdit(null);
        }, 300);
    };

    if (!isOpen) return null;

    // If showing ReceptionForm, render it in a separate modal overlay
    if (showReceptionForm && selectedPatientForReception) {
        // Map SearchedPatient to Patient type expected by ReceptionForm
        const patientForForm: any = {
            id: selectedPatientForReception.id,
            name: selectedPatientForReception.name,
            phone: selectedPatientForReception.phone,
            gender: selectedPatientForReception.sex === '남' ? 'MALE' : selectedPatientForReception.sex === '여' ? 'FEMALE' : 'OTHER',
            age: selectedPatientForReception.age,
            birthDate: selectedPatientForReception.dob,
            tags: selectedPatientForReception.tag ? [selectedPatientForReception.tag] : [],
            chartNo: selectedPatientForReception.no,
            residentNumber: '',
            status: 'wait',
            location: 'reception',
            time: new Date().toLocaleTimeString(),
            visitDate: new Date().toISOString().split('T')[0],
            address: ''
        };

        return createPortal(
            <>
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1500px] max-h-[85vh] flex flex-col overflow-hidden border border-[#F8DCE2] animate-in fade-in zoom-in-95 duration-200">
                        <ReceptionForm
                            patient={patientForForm}
                            onClose={() => {
                                setShowReceptionForm(false);
                                setSelectedPatientForReception(null);
                            }}
                            onConfirm={async (data) => {
                                try {
                                    const branchId = resolveActiveBranchId("");
                                    if (!branchId) {
                                        setModalAlert("지점 정보가 없습니다.");
                                        return;
                                    }
                                    await visitService.createVisit({
                                        patientId: selectedPatientForReception.id,
                                        branchId: branchId,
                                        scheduledAt: new Date().toISOString(),
                                        status: 'wait',
                                        room: data.room || 'main_wait',
                                        memo: data.memo,
                                        doctor: data.doctor || undefined,
                                        visitPurposeId: data.visitPurposeId || undefined
                                    });

                                    useScheduleStore.getState().refresh();
                                    useChartStore.getState().fetchPatients(useScheduleStore.getState().dateISO, branchId);

                                    setModalAlert("접수가 완료되었습니다: " + selectedPatientForReception.name);
                                    setShowReceptionForm(false);
                                    setSelectedPatientForReception(null);
                                    onClose();
                                } catch (error: any) {
                                    console.error("Reception failed", error);
                                    setModalAlert(error?.response?.data?.message || error?.message || "접수에 실패했습니다.");
                                }
                            }}
                            onQuickAction={async (data) => {
                                if (!selectedPatientForReception) return;
                                const customerId = Number(selectedPatientForReception.id || 0);
                                if (!Number.isFinite(customerId) || customerId <= 0) {
                                    setModalAlert("빠른 차감 대상이 아닙니다.");
                                    return;
                                }
                                try {
                                    const ownedTickets = await ticketService.getTickets(customerId);
                                    const branchId = resolveActiveBranchId("");
                                    const dateISO = new Date().toISOString().slice(0, 10);
                                    const ticketDefs = useSettingsStore.getState().settings.tickets?.items || [];
                                    const options = await fetchQuickTicketOptions(ownedTickets || [], ticketDefs, branchId, dateISO);
                                    if (options.length === 0) {
                                        setModalAlert("빠른 차감 대상이 아닙니다. (잔여 시술권 없음)");
                                        return;
                                    }
                                    setQuickTicketPickerData({ tickets: options, receptionData: data });
                                } catch (e) {
                                    console.error("ticket check failed", e);
                                    setModalAlert("시술권 조회에 실패했습니다.");
                                }
                            }}
                        />
                    </div>
                </div>
                {quickTicketPickerData && (
                    <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/35 backdrop-blur-[1px] p-4">
                        <div className="w-full max-w-[620px] max-h-[80vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                                <div>
                                    <div className="text-base font-bold text-slate-900">차감할 시술권 선택</div>
                                    <div className="mt-0.5 text-xs text-slate-500">차감할 시술권을 선택해 주세요.</div>
                                </div>
                                <button type="button" onClick={() => setQuickTicketPickerData(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="닫기">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="max-h-[52vh] overflow-y-auto px-5 py-4 space-y-2.5">
                                {quickTicketPickerData.tickets.map((option: QuickTicketOption) => {
                                    const allowOverride = canOverrideCycleBlock(option);
                                    const disabled = option.remaining <= 0 || (option.cycleBlocked && !allowOverride);
                                    const selected = (quickTicketPickerData._selectedIds || []).includes(option.ticketId);
                                    return (
                                        <button
                                            key={`qt-${option.ticketId}`}
                                            type="button"
                                            disabled={quickTicketBusy || disabled}
                                            onClick={() => {
                                                if (disabled) return;
                                                setQuickTicketPickerData((prev: any) => {
                                                    if (!prev) return prev;
                                                    const ids: string[] = prev._selectedIds || [];
                                                    const next = ids.includes(option.ticketId) ? ids.filter((id: string) => id !== option.ticketId) : [...ids, option.ticketId];
                                                    return { ...prev, _selectedIds: next };
                                                });
                                            }}
                                            className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${disabled ? "cursor-not-allowed border-red-200 bg-red-50/50 text-slate-400 opacity-70" : selected ? "border-[#E26B7C] bg-[#FCEBEF] ring-1 ring-[#E26B7C]/30" : allowOverride ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${disabled ? "border-gray-300 bg-gray-200" : selected ? "border-[#E26B7C] bg-[#E26B7C] text-white" : "border-gray-300 bg-white"}`}>
                                                    {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <TicketIcon className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="truncate text-sm font-semibold">{option.ticketName}</span>
                                                        {option.isPeriod && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">주기권</span>}
                                                        {option.isPackage && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">패키지</span>}
                                                    </div>
                                                    <div className={`mt-1 text-[11px] leading-relaxed ${disabled ? "text-red-500 font-medium" : "text-slate-500"}`}>
                                                        {disabled ? `⛔ ${option.cycleBlockReason || "지금은 사용할 수 없습니다."}` : "선택하여 차감"}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className="text-sm font-bold text-slate-800">잔여 {option.remaining}회</div>
                                                    {option.nextAvailableAt && <div className="mt-1 text-[10px] text-amber-600">다음 가능: {option.nextAvailableAt}</div>}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50">
                                <button type="button" onClick={() => setQuickTicketPickerData(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">취소</button>
                                <button
                                    type="button"
                                    disabled={quickTicketBusy || !(quickTicketPickerData._selectedIds?.length)}
                                    onClick={async () => {
                                        if (!selectedPatientForReception) return;
                                        const selectedOptions = quickTicketPickerData.tickets.filter((o: QuickTicketOption) => (quickTicketPickerData._selectedIds || []).includes(o.ticketId));
                                        if (selectedOptions.length === 0) return;
                                        setQuickTicketBusy(true);
                                        try {
                                            const branchId = resolveActiveBranchId("");
                                            if (!branchId) { setModalAlert("지점 정보가 없습니다."); return; }
                                            const receptionData = quickTicketPickerData.receptionData;
                                            await visitService.createVisit({
                                                patientId: selectedPatientForReception.id, branchId,
                                                scheduledAt: new Date().toISOString(), status: 'wait',
                                                room: receptionData.room || 'main_wait', memo: receptionData.memo,
                                                doctor: receptionData.doctor || undefined,
                                                visitPurposeId: receptionData.visitPurposeId || undefined
                                            });
                                            for (const option of selectedOptions) {
                                                await ticketService.useTicket(option.ticketId, option.isPeriod);
                                            }
                                            useScheduleStore.getState().refresh();
                                            useChartStore.getState().fetchPatients(useScheduleStore.getState().dateISO, branchId);
                                            setQuickTicketPickerData(null);
                                            setShowReceptionForm(false);
                                            setSelectedPatientForReception(null);
                                            onClose();
                                            setModalAlert(`${selectedOptions.length}건 차감 및 접수가 완료되었습니다.`);
                                        } catch (e: any) {
                                            console.error("quick ticket deduct failed", e);
                                            setModalAlert(e?.response?.data?.message || e?.message || "처리에 실패했습니다.");
                                        } finally {
                                            setQuickTicketBusy(false);
                                        }
                                    }}
                                    className="rounded-lg bg-[#E26B7C] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#99354E] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    차감하기 ({quickTicketPickerData._selectedIds?.length || 0}건)
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {modalAlert && (
                    <ConfirmModal
                        title="알림"
                        description={modalAlert}
                        variant="alert"
                        onClose={() => setModalAlert(null)}
                        onConfirm={() => setModalAlert(null)}
                    />
                )}
            </>,
            document.body
        );
    }

    return createPortal(
        <>
            <div className="fixed inset-0 z-[9999] flex items-start justify-center p-6 pt-14 bg-slate-900/35 backdrop-blur-[4px] transition-all duration-300">
                <div
                    className={`relative bg-white rounded-[26px] border border-slate-200/80 shadow-[0_28px_80px_rgba(15,23,42,0.24)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-all ${searchText ? 'w-[min(1280px,96vw)] min-h-[620px] max-h-[90vh]' : 'w-[min(760px,96vw)] min-h-[540px] max-h-[88vh]'}`}
                >
                    {/* Search Header */}
                    <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-b from-slate-50/85 to-white">
                        <div className="flex items-center justify-between gap-4 mb-3">
                            <div>
                                <div className="text-[20px] font-extrabold tracking-tight text-slate-900">환자 검색</div>
                                <div className="text-xs text-slate-500 mt-1">이름, 차트번호, 연락처, 생년월일로 빠르게 찾을 수 있습니다.</div>
                            </div>
                            <button
                                onClick={onClose}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                <span className="sr-only">닫기</span>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                            <Search className="text-slate-400 w-5 h-5 shrink-0" />
                            <input
                                ref={inputRef}
                                className="flex-1 text-[17px] placeholder:text-slate-300 text-slate-800 outline-none bg-transparent"
                                placeholder="환자 검색"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* content */}
                    <div className="flex-1 flex flex-col w-full">
                        {/* Tabs */}
                        <div className="flex items-center px-6 border-b border-slate-200 bg-white/95 relative">
                            <div className="flex gap-6">
                                <button className="py-3 text-sm font-semibold text-[rgb(var(--kkeut-primary-strong))] border-b-2 border-[rgb(var(--kkeut-primary))]">
                                    환자
                                </button>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {searchText && (patients.length > 0 || isLoading) ? (
                                <div className="flex-1 overflow-y-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                            <tr>
                                                <th className="py-3 px-4 font-bold text-slate-500">No.</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">이름</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">성별</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">나이</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">생년월일</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">대표연락처</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">여권번호</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">피보험자</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">최근 예약</th>
                                                <th className="py-3 px-4 font-bold text-slate-500">최근방문</th>
                                                <th className="py-3 px-4 font-bold text-slate-500 text-center">기능</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <tr>
                                                    <td colSpan={11} className="py-20 text-center text-slate-400">
                                                        검색 중...
                                                    </td>
                                                </tr>
                                            ) : patients.length === 0 ? (
                                                <tr>
                                                    <td colSpan={11} className="py-20 text-center text-slate-400">
                                                        검색 결과가 없습니다.
                                                    </td>
                                                </tr>
                                            ) : (
                                                patients.map((patient, index) => (
                                                    <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                                                        <td className="py-3 px-4 text-slate-500">{patient.no}</td>
                                                        <td className="py-3 px-4 font-semibold text-slate-900">{patient.name}</td>
                                                        <td className="py-3 px-4 text-slate-500">{patient.sex}</td>
                                                        <td className="py-3 px-4 text-slate-500">{patient.age}</td>
                                                        <td className="py-3 px-4 text-slate-500">{patient.dob}</td>
                                                        <td className="py-3 px-4 text-slate-500">{patient.phone}</td>
                                                        <td className="py-3 px-4 text-slate-500">{patient.passport || '-'}</td>
                                                        <td className="py-3 px-4 text-slate-500">{patient.insured}</td>
                                                        <td className="py-3 px-4 text-slate-500">{patient.plan}</td>
                                                        <td className="py-3 px-4 text-slate-500">{patient.lastContent}</td>
                                                        <td className="py-3 px-4">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/app/chart-view/${patient.id}`);
                                                                        onClose();
                                                                    }}
                                                                >
                                                                    차트
                                                                </button>
                                                                <button
                                                                    className="h-8 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedPatientForReception(patient);
                                                                        setShowReceptionForm(true);
                                                                    }}
                                                                >
                                                                    접수
                                                                </button>
                                                                <button
                                                                    className="h-8 px-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (onSelectPatient) {
                                                                            onSelectPatient(patient);
                                                                        } else {
                                                                            // Navigate to reservation page with patient data
                                                                            navigate('/app/reservation', { state: { reservePatient: patient, _ts: Date.now() } });
                                                                        }
                                                                        onClose(); // Close search modal
                                                                    }}
                                                                >
                                                                    예약
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleEditClick(patient);
                                                                    }}
                                                                    className="h-8 px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
                                                                >
                                                                    수정
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 px-6">
                                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-5 border border-slate-200">
                                        <Search size={34} className="text-slate-300" />
                                    </div>
                                    <p className="text-[28px] leading-none mb-3">환자 검색을 시작해 주세요</p>
                                    <p className="text-base">환자 이름 또는 차트번호, 전화번호를 검색하세요</p>
                                </div>
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between">
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-700">환자번호, 이름, 연락처, 생년월일(6자리), 여권번호로 검색해보세요.</div>
                                <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
                                    <Info className="w-3.5 h-3.5" />
                                    등록된 환자가 아니라면 신환등록을 해주세요.
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    setModalMode('create');
                                    setIsNewPatientOpen(true);
                                }}
                                className="h-11 px-5 rounded-xl bg-[rgb(var(--kkeut-primary))] hover:bg-[rgb(var(--kkeut-primary-strong))] text-white text-sm font-bold shadow-sm transition-colors"
                            >
                                신환등록
                            </button>
                        </div>
                    </div>
                </div>

                {/* Backdrop Close Trigger */}
                <div className="absolute inset-0 -z-10" onClick={onClose} />
            </div>

            <NewPatientModal
                isOpen={isNewPatientOpen}
                onClose={handleModalClose}
                mode={modalMode}
                initialData={modalMode === 'edit' && selectedPatientForEdit ? {
                    name: selectedPatientForEdit.name,
                    phone: selectedPatientForEdit.phone,
                    dob: (selectedPatientForEdit as any).birthDate || selectedPatientForEdit.dob,
                    sex: (selectedPatientForEdit as any).sex,
                    tags: (selectedPatientForEdit as any).tags || [],
                    zipcode: (selectedPatientForEdit as any).zipcode,
                    address: (selectedPatientForEdit as any).address,
                    detailAddress: (selectedPatientForEdit as any).detailAddress,
                    email: (selectedPatientForEdit as any).email,
                    emergencyPhone: (selectedPatientForEdit as any).emergencyPhone,
                } : undefined}
                onConfirm={async (data) => {
                    try {
                        const { name, phone, id1, id2, noId, tags, emergencyPhone, zipcode, address, detailAddress, email } = data;

                        // Parse DOB and Sex from ID
                        let birthDate = null;
                        let sex = undefined;

                        if (!noId && id1 && id2) {
                            const yearPrefix = ['1', '2', '5', '6'].includes(id2[0]) ? '19' : '20';
                            birthDate = `${yearPrefix}${id1.substring(0, 2)}-${id1.substring(2, 4)}-${id1.substring(4, 6)}`;
                            if (['1', '3', '5', '7'].includes(id2[0])) sex = "M";
                            else if (['2', '4', '6', '8'].includes(id2[0])) sex = "F";
                        }

                        const branchId = resolveActiveBranchId("");
                        if (!branchId) {
                            throw new Error("지점 정보가 없습니다.");
                        }

                        if (modalMode === 'edit' && selectedPatientForEdit) {
                            await patientService.update(selectedPatientForEdit.id, {
                                name,
                                phone,
                                sex,
                                birthDate: birthDate || undefined,
                                zipcode,
                                address,
                                detailAddress,
                                email,
                                emergencyPhone,
                            });

                            if (tags && tags.length >= 0) {
                                const existingTags = await patientService.getTags(selectedPatientForEdit.id);
                                const selectedTagNames: string[] = tags;
                                const toAdd = selectedTagNames.filter((n: string) => !existingTags.some(e => e.tagName === n));
                                const toRemove = existingTags.filter(e => !selectedTagNames.includes(e.tagName));

                                for (const tagName of toAdd) {
                                    const master = tagMaster.find(t => t.name === tagName);
                                    if (master) await patientService.addTag(selectedPatientForEdit.id, master.id);
                                }
                                for (const tag of toRemove) {
                                    await patientService.removeTag(selectedPatientForEdit.id, tag.tagId);
                                }
                            }
                            setModalAlert("환자 정보가 수정되었습니다.");
                        } else {
                            let residentRegistNum = "";
                            if (!noId && id1 && id2) {
                                residentRegistNum = `${id1}-${id2}`;
                            }

                            const created = await patientService.create({
                                branchId,
                                name,
                                phone,
                                sex,
                                residentRegistNum,
                                birthDate: birthDate || undefined,
                                zipcode,
                                address,
                                detailAddress,
                                email,
                                emergencyPhone,
                            });

                            if (tags && tags.length > 0 && created?.id) {
                                for (const tagName of tags) {
                                    const master = tagMaster.find(t => t.name === tagName);
                                    if (master) await patientService.addTag(created.id, master.id);
                                }
                            }
                            setModalAlert("환자가 등록되었습니다.");
                        }

                        handleModalClose();

                        if (!searchText && name) {
                            setSearchText(name);
                        }

                    } catch (error: any) {
                        console.error("Operation failed", error);
                        const msg = error.response?.data?.title || error.response?.data || error.message || "알 수 없는 오류";
                        setModalAlert(`작업에 실패했습니다: ${JSON.stringify(msg)}`);
                    }
                }}
            />
            {modalAlert && createPortal(
                <ConfirmModal
                    title="알림"
                    description={modalAlert}
                    variant="alert"
                    onClose={() => setModalAlert(null)}
                    onConfirm={() => setModalAlert(null)}
                />,
                document.body
            )}
        </>,
        document.body
    );
}

import { useState, useEffect, useMemo } from "react";
import { X, Check, Pin, Calendar } from "lucide-react";
import { format, differenceInYears } from "date-fns";
import { ko } from "date-fns/locale";
import { Patient } from "../../stores/useChartStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { visitService } from "../../services/visitService";
import { patientService, PatientDetail } from "../../services/patientService";
import { patientRecordService } from "../../services/patientRecordService";
import { paymentService } from "../../services/paymentService";
import { memberConfigService } from "../../services/memberConfigService";
import { resolveActiveBranchId } from "../../utils/branch";

interface ReceptionFormProps {
    patient: Patient;
    onClose: () => void;
    onConfirm: (data: any) => void;
    onQuickAction?: (data: any) => void | Promise<void>;
    quickActionLabel?: string;
    quickActionDisabled?: boolean;
    quickActionBusy?: boolean;
    onCancelReservation?: () => void;
    isEditMode?: boolean;
}


export function ReceptionForm({
    patient,
    onClose,
    onConfirm,
    onQuickAction,
    quickActionLabel = "빠른 차감/입실",
    quickActionDisabled = false,
    quickActionBusy = false,
    onCancelReservation,
    isEditMode = false,
}: ReceptionFormProps) {
    const { settings } = useSettingsStore();
    const resolvedBranchId = resolveActiveBranchId("");
    const [visitPurposeIds, setVisitPurposeIds] = useState<string[]>([]);
    const [doctor, setDoctor] = useState("");
    const [memo, setMemo] = useState("");

    const [patientDetail, setPatientDetail] = useState<PatientDetail | null>(null);
    const [visitHistoryList, setVisitHistoryList] = useState<any[]>([]);
    const [expandedVisitId, setExpandedVisitId] = useState<number | null>(null);
    const [currentVisit, setCurrentVisit] = useState<any | null>(null);
    const [keyRecords, setKeyRecords] = useState<any[]>([]);
    const [upcomingReservations, setUpcomingReservations] = useState<any[]>([]);
    const [totalPayment, setTotalPayment] = useState(0);

    const [selectedRoom, setSelectedRoom] = useState(() => {
        const waitLists = settings.chartConfig?.waitLists || [];
        const initial = waitLists.find(w => w.enabled && w.isInitialReception);
        if (initial) return initial.id;
        const firstEnabled = waitLists.filter(w => w.enabled).sort((a, b) => (a.order || 0) - (b.order || 0))[0];
        return firstEnabled?.id || "main_wait";
    });
    const [roomOptions, setRoomOptions] = useState<{ id: string, label: string }[]>([]);
    const [doctorCandidates, setDoctorCandidates] = useState<Array<{ id: string; name: string; jobTitleName?: string }>>([]);

    useEffect(() => {
        const waitLists = settings.chartConfig?.waitLists || [];
        const enabled = waitLists
            .filter(w => w.enabled)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(w => ({ id: w.id || w.label, label: w.label }));

        setRoomOptions(enabled);

        if (enabled.length > 0) {
            const firstVisible = enabled[0];
            if (!enabled.find(o => o.id === selectedRoom) && firstVisible) {
                setSelectedRoom(firstVisible.id);
            }
        }
    }, [settings.chartConfig?.waitLists]);

    useEffect(() => {
        const loadDoctors = async () => {
            try {
                const branchId = Number(resolvedBranchId);
                if (!Number.isFinite(branchId) || branchId <= 0) {
                    setDoctorCandidates([]);
                    setDoctor("");
                    return;
                }
                const [members, jobTitles] = await Promise.all([
                    memberConfigService.getMembers(branchId),
                    memberConfigService.getJobTitles(),
                ]);

                const jobTitleMap = new Map<string, string>(
                    (jobTitles || []).map((job: any) => [String(job.id), String(job.name || "")])
                );
                const filtered = (members || []).filter((member: any) => {
                    if (member?.isApproved === false) return false;
                    const jobId = String(member?.jobTitleId || "");
                    const jobName = jobTitleMap.get(jobId) || "";
                    return jobName === "원장";
                });

                const mapped = filtered.map((member: any) => {
                    const jobId = String(member?.jobTitleId || "");
                    return {
                        id: String(member.id),
                        name: String(member.name || ""),
                        jobTitleName: jobTitleMap.get(jobId) || undefined,
                    };
                });

                setDoctorCandidates(mapped);
                setDoctor("");
            } catch (error) {
                console.error("Failed to load reception doctors", error);
                setDoctorCandidates([]);
                setDoctor("");
            }
        };

        void loadDoctors();
    }, [
        resolvedBranchId,
        settings.chartConfig?.statusRules?.receptionDoctorJobTitleIds,
    ]);

    useEffect(() => {
        if (!patient?.id) return;

        const customerId = Number(patient.patientId || patient.id);
        if (!Number.isFinite(customerId) || customerId <= 0) return;

        patientService.getById(customerId)
            .then(detail => {
                if (detail) {
                    setPatientDetail(detail);
                }
            })
            .catch(err => console.error("Failed to fetch patient detail", err));

        visitService.getByPatientId(customerId)
            .then(data => {
                if (data && Array.isArray(data)) {
                    const mapped = data.map(v => ({ ...v, scheduledAt: v.registerTime || v.scheduledAt }));
                    const matchedCurrent = mapped.find((v: any) => Number(v.id) === Number(patient.id)) || null;
                    setCurrentVisit(matchedCurrent);
                    return;
                }
                setCurrentVisit(null);
            });

        visitService.getVisitHistory(customerId)
            .then(data => {
                if (data && Array.isArray(data)) {
                    const sorted = data.sort((a: any, b: any) =>
                        new Date(b.scheduledAt || b.registerTime || 0).getTime() - new Date(a.scheduledAt || a.registerTime || 0).getTime()
                    ).slice(0, 10);
                    setVisitHistoryList(sorted);
                    if (sorted.length > 0) setExpandedVisitId(sorted[0].id);
                } else {
                    setVisitHistoryList([]);
                }
            })
            .catch(() => setVisitHistoryList([]));

        visitService.getReservationsByCustomer(customerId)
            .then(data => {
                if (data && Array.isArray(data)) {
                    const now = new Date();
                    const upcoming = data
                        .filter((r: any) => !r.isNoShow && !r.cancelReason && new Date(r.reservDateTime || r.scheduledAt || 0) >= now)
                        .sort((a: any, b: any) => new Date(a.reservDateTime || a.scheduledAt || 0).getTime() - new Date(b.reservDateTime || b.scheduledAt || 0).getTime());
                    setUpcomingReservations(upcoming);
                } else {
                    setUpcomingReservations([]);
                }
            })
            .catch(() => setUpcomingReservations([]));

        if (patient.location === 'reservation') {
            visitService.getReservationsByCustomer(customerId)
                .then(data => {
                    if (data && Array.isArray(data)) {
                        const validReservations = data.filter((r: any) => !r.isNoShow && !r.cancelReason);
                        const currentReserv = validReservations.find((r: any) => Number(r.id) === Number(patient.id));
                        const vpNames: string[] = (currentReserv?.visitPurposes || []).map((vp: any) => String(vp.name || "").trim()).filter(Boolean);
                        if (vpNames.length > 0) {
                            const matchedIds = validPurposes
                                .filter(vp => vpNames.includes(vp.label))
                                .map(vp => vp.id);
                            if (matchedIds.length > 0) {
                                setVisitPurposeIds(matchedIds);
                            }
                        }
                    }
                })
                .catch(() => {});
        }

        if (patient.location === 'reservation') {
            const remarks = String(patient.memo || "").trim();
            if (remarks) {
                setKeyRecords([{ id: 0, patientId: customerId, content: remarks, isPinned: false, createdByName: "예약메모", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
            } else {
                setKeyRecords([]);
            }
        } else {
            patientRecordService.getByPatientId(customerId)
                .then(data => {
                    if (data && Array.isArray(data)) {
                        const records = [...data]
                            .filter((r: any) => String(r?.content || "").trim().length > 0)
                            .sort((a: any, b: any) => {
                                const pinDiff = Number(Boolean(b?.isPinned)) - Number(Boolean(a?.isPinned));
                                if (pinDiff !== 0) return pinDiff;
                                return new Date(String(b?.createdAt || 0)).getTime() - new Date(String(a?.createdAt || 0)).getTime();
                            })
                            .slice(0, 12);
                        setKeyRecords(records);
                        return;
                    }
                    setKeyRecords([]);
                })
                .catch(err => console.error("Failed to load patient records", err));
        }

        paymentService.listByPatient(customerId)
            .then((rows) => {
                const totalPaid = (rows || []).reduce((sum, row: any) => {
                    const status = String(row?.status ?? "paid").trim().toLowerCase();
                    if (status === "refunded" || status === "cancelled") return sum;
                    return sum + Number(row?.amount || 0);
                }, 0);
                setTotalPayment(totalPaid);
            })
            .catch((err) => {
                console.error("Failed to load payments", err);
                setTotalPayment(0);
            });

    }, [patient.id, patient.patientId]);

    useEffect(() => {
        if (!currentVisit) {
            setDoctor("");
            setMemo("");

            if (patient.location !== 'reservation') {
                setVisitPurposeIds([]);
            }
            return;
        }

        setDoctor(String(currentVisit.doctor || currentVisit.doctorName || ""));
        setMemo(String(currentVisit.memo || currentVisit.receptionMemo || ""));

        if (patient.location !== 'reservation') {
            const rawIds: string[] = Array.isArray(currentVisit.visitPurposeIds)
                ? currentVisit.visitPurposeIds.map((v: any) => String(v).trim()).filter(Boolean)
                : [];
            if (rawIds.length === 0) {
                const singleId = String(currentVisit.visitPurposeId || "").trim();
                if (singleId) rawIds.push(singleId);
            }
            if (rawIds.length > 0) {
                const matchedIds = validPurposes
                    .filter(vp => rawIds.includes(String(vp.id)))
                    .map(vp => vp.id);
                setVisitPurposeIds(matchedIds);
            }
        }

        const currentRoom = String(currentVisit.room || currentVisit.currentLocationId || "").trim();
        if (currentRoom && roomOptions.some((option) => option.id === currentRoom)) {
            setSelectedRoom(currentRoom);
        }
    }, [currentVisit?.id, roomOptions]);

    const togglePurpose = (visitPurposeId: string) => {
        setVisitPurposeIds(prev =>
            prev.includes(visitPurposeId)
                ? prev.filter(p => p !== visitPurposeId)
                : [...prev, visitPurposeId]
        );
    };

    const handleSubmit = () => {
        if (validPurposes.length > 0 && visitPurposeIds.length === 0) {
            window.alert("방문 목적을 선택해주세요.");
            return;
        }
        onConfirm(buildSubmitPayload());
    };

    const handleQuickSubmit = async () => {
        if (validPurposes.length > 0 && visitPurposeIds.length === 0) {
            window.alert("방문 목적을 선택해주세요.");
            return;
        }
        if (!onQuickAction) return;

        await onQuickAction(buildSubmitPayload());
    };

    const validPurposes = settings?.chartConfig?.visitPurposes?.filter(vp => vp.enabled) || [];

    const buildSubmitPayload = () => {
        const selectedIds = visitPurposeIds.filter(Boolean);
        const selectedLabels = selectedIds.map((id) => {
            const matched = validPurposes.find((vp) => String(vp.id) === String(id));
            return matched?.label || String(id);
        });

        return {
            visitPurposeId: selectedIds[0] || "",
            visitPurposeIds: selectedIds,
            visitPurpose: selectedLabels.join(", "),
            visitPurposeLabels: selectedLabels,
            doctor: doctor.trim(),
            memo,
            room: selectedRoom,
            checkInTime: format(new Date(), 'h:mm a')
        };
    };

    const displayName = patientDetail?.name || patient.name;
    const normalizedSex = String(patientDetail?.sex || patient.gender || "").trim().toUpperCase();
    const displayGender = normalizedSex === "M" ? "\uB0A8" : "\uC5EC";

    let displayAge = patient.age;
    const birthDateStr = patientDetail?.birthDate || (patient as any).birthDate;
    if (birthDateStr) {
        try {
            const birthDate = new Date(birthDateStr);
            if (!isNaN(birthDate.getTime())) {
                displayAge = differenceInYears(new Date(), birthDate);
            }
        } catch (e) { console.error("Age calc error", e); }
    }

    let displayResidentNumber = (patient as any).residentNumber || '';
    if (patientDetail?.residentNumber) {
        displayResidentNumber = patientDetail.residentNumber;
    } else if (!displayResidentNumber && birthDateStr) {
        try {
            const d = new Date(birthDateStr);
            const yyyy = d.getFullYear();
            const yy = String(yyyy).slice(2);
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const genderDigit = displayGender === "\uB0A8"
                ? (yyyy < 2000 ? '1' : '3')
                : (yyyy < 2000 ? '2' : '4');
            displayResidentNumber = `${yy}${mm}${dd}-${genderDigit}******`;
        } catch (e) { /* ignore */ }
    }

    const displayPhone = patientDetail?.phone || patient.phone;
    const displayAddress = [patientDetail?.address || patient.address || '', patientDetail?.detailAddress || ''].filter(Boolean).join(' ');

    if (!displayResidentNumber && (patient as any).residentNumber) displayResidentNumber = (patient as any).residentNumber;
    const displayTags = patientDetail && (patientDetail as any).tags ? (patientDetail as any).tags : (patient.tags || []);

    const toStringArray = (value: any): string[] => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
            } catch {
                return value.split(",").map((v) => v.trim()).filter(Boolean);
            }
        }
        return [];
    };

    const getPlannedTicketSummary = (visit: any): string[] => {
        const ticketNames = toStringArray(visit?.plannedTicketNames);
        const treatments = toStringArray(visit?.plannedTreatments);
        if (treatments.length > 0) return treatments;
        return ticketNames;
    };

    const currentPlanned = getPlannedTicketSummary(currentVisit).length > 0
        ? getPlannedTicketSummary(currentVisit)
        : toStringArray(patient?.plannedTicketNames);
    const displayChartNo = useMemo(() => {
        const id = Number(patientDetail?.id || patient.patientId || patient.id || 0);
        return Number.isFinite(id) && id > 0 ? String(id) : String(patient.patientId || patient.id || "-");
    }, [patient.id, patient.patientId, patientDetail?.id]);
    const cumulativePaymentLabel = useMemo(
        () => `${Math.floor(Math.max(0, totalPayment) / 10000).toLocaleString()}만원`,
        [totalPayment]
    );
    const pinnedKeyRecords = useMemo(
        () => (keyRecords || []).filter((record: any) => Boolean(record?.isPinned)).slice(0, 3),
        [keyRecords]
    );
    const recentKeyRecords = useMemo(
        () => (keyRecords || []).filter((record: any) => !record?.isPinned).slice(0, 5),
        [keyRecords]
    );

    return (
        <div className="flex flex-col h-full max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
            <div className="flex items-center justify-between px-5 py-3 bg-[#F8F9FD] border-b border-[#C5CAE9]">
                <div className="flex items-center gap-3">
                    <h2 className="text-[17px] font-bold text-[#1A237E]">{isEditMode ? "접수 정보 수정" : "접수"}</h2>
                    <span className="text-[13px] text-[#616161] font-medium">
                        {format(new Date(), "yyyy-MM-dd HH:mm", { locale: ko })}
                    </span>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-[#E8EAF6] rounded-lg transition-all duration-200">
                    <X className="w-4 h-4 text-[#616161]" />
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden bg-[#F5F7FA]">
                <aside className="w-60 border-r border-[#C5CAE9] bg-white flex flex-col overflow-y-auto shrink-0">
                    <div className="px-3 pt-3 pb-2 border-b border-[#E0E0E0]">
                        <h4 className="text-[13px] font-semibold text-[#1A237E] mb-2">주요기록</h4>
                        {pinnedKeyRecords.length > 0 && (
                            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2">
                                <div className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-amber-700">
                                    <Pin className="h-3 w-3" />
                                    중요기록
                                </div>
                                <div className="space-y-1.5">
                                    {pinnedKeyRecords.map((record: any) => (
                                        <div key={`pinned-key-${record.id}`} className="rounded border border-amber-200 bg-white px-2 py-1">
                                            <div className="text-[12px] text-[#242424] font-medium whitespace-pre-wrap leading-relaxed line-clamp-2">
                                                {record.content}
                                            </div>
                                            <div className="text-[10px] text-[#616161] mt-0.5">
                                                {format(new Date(record.createdAt), "yyyy.MM.dd")} · {record.createdByName || "\uAD00\uB9AC\uC790"}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {recentKeyRecords.length > 0 ? (
                            <div className="space-y-1.5">
                                {recentKeyRecords.map((record: any) => (
                                    <div key={record.id} className="relative pl-4">
                                        <div className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-[#C5CAE9]" />
                                        <div className="text-[12px] text-[#242424] font-medium whitespace-pre-wrap leading-relaxed line-clamp-2">
                                            {record.content}
                                        </div>
                                        <div className="text-[10px] text-[#616161] mt-0.5">
                                            {format(new Date(record.createdAt), "yyyy.MM.dd")} · {record.createdByName || "\uAD00\uB9AC\uC790"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[12px] text-[#616161] pl-4">
                                {pinnedKeyRecords.length > 0 ? "일반 주요 기록이 없습니다." : "주요 기록이 없습니다."}
                            </div>
                        )}
                    </div>

                    <div className="px-3 pt-3 pb-3 flex-1">
                        <h4 className="text-[13px] font-semibold text-[#1A237E] mb-2">내원이력 <span className="text-[11px] font-bold text-[#3F51B5] bg-[#3F51B5]/10 px-1.5 py-0.5 rounded-full">{visitHistoryList.length}</span></h4>
                        <div className="space-y-1">
                            {visitHistoryList.length === 0 ? (
                                <div className="text-[12px] text-[#616161] pl-4">내원이력이 없습니다.</div>
                            ) : (
                                visitHistoryList.map((v, i) => {
                                    const vDate = v.scheduledAt || v.registerTime;
                                    const dateStr = vDate ? format(new Date(vDate), "yyyy-MM-dd") : "";
                                    const isExpanded = expandedVisitId === v.id;
                                    const chart1Val = String(v.chart1 || v.consultation?.chart1 || "").trim();
                                    const chart2Val = String(v.chart2 || v.consultation?.chart2 || "").trim();
                                    const chart3Val = String(v.chart3 || v.consultation?.chart3 || "").trim();
                                    const mrVal = String(v.medicalRecord || "").trim();
                                    const hasContent = chart1Val || chart2Val || chart3Val || mrVal;
                                    const localMemoSections = settings?.chartConfig?.memoSections?.filter((m: any) => m.enabled)?.sort((a: any, b: any) => a.order - b.order) || [
                                        { id: "chart1", label: "관리" }, { id: "chart2", label: "원장상담" }, { id: "chart3", label: "실장상담" },
                                    ];
                                    const chartFieldMap: Record<string, string> = {};
                                    localMemoSections.forEach((s: any, idx: number) => { chartFieldMap[s.id] = `chart${idx + 1}`; });
                                    const sectionColors = [
                                        { bg: "bg-teal-50/60", border: "border-teal-200", label: "text-teal-800", text: "text-teal-900" },
                                        { bg: "bg-blue-50/60", border: "border-blue-200", label: "text-blue-800", text: "text-blue-900" },
                                        { bg: "bg-amber-50/60", border: "border-amber-200", label: "text-amber-800", text: "text-amber-900" },
                                    ];
                                    return (
                                        <div
                                            key={v.id || i}
                                            className={`rounded-lg border transition-all duration-200 cursor-pointer ${isExpanded ? "border-[#3F51B5]/30 bg-[#E8EAF6]/30" : "border-[#C5CAE9] bg-white hover:bg-[#E8EAF6]"}`}
                                            onClick={() => setExpandedVisitId(isExpanded ? null : v.id)}
                                        >
                                            <div className="flex items-center justify-between px-2 py-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                                                    <span className="text-[11px] font-bold text-[#1A237E]">{dateStr}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {v.doctorName && <span className="text-[9px] text-[#616161]">{v.doctorName}</span>}
                                                    {!hasContent && !v.memo && <span className="text-[9px] text-[#9FA8DA]">기록없음</span>}
                                                </div>
                                            </div>
                                            {v.memo && (
                                                <div className="px-2 pb-1">
                                                    <div className="text-[10px] text-[#616161] bg-slate-50 rounded px-1.5 py-0.5 border border-slate-200">
                                                        <span className="font-bold text-slate-500">메모</span> {v.memo}
                                                    </div>
                                                </div>
                                            )}
                                            {isExpanded && (
                                                <div className="px-2 pb-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                                                    {localMemoSections.map((section: any, sIdx: number) => {
                                                        const field = chartFieldMap[section.id] || section.id;
                                                        const val = String((v as any)?.[field] || (v?.consultation as any)?.[field] || "").trim();
                                                        if (!val) return null;
                                                        const color = sectionColors[sIdx % sectionColors.length];
                                                        return (
                                                            <div key={section.id} className={`rounded ${color.bg} border ${color.border}`}>
                                                                <div className={`px-1.5 py-0.5 text-[9px] font-bold ${color.label} border-b ${color.border}`}>{section.label}</div>
                                                                <div className={`px-1.5 py-1 text-[10px] ${color.text} whitespace-pre-wrap leading-relaxed`}>{val}</div>
                                                            </div>
                                                        );
                                                    })}
                                                    {mrVal && (
                                                        <div className="rounded bg-purple-50/60 border border-purple-200">
                                                            <div className="px-1.5 py-0.5 text-[9px] font-bold text-purple-800 border-b border-purple-200">진료기록</div>
                                                            <div className="px-1.5 py-1 text-[10px] text-purple-900 whitespace-pre-wrap leading-relaxed">{mrVal}</div>
                                                        </div>
                                                    )}
                                                    {!hasContent && <div className="text-[10px] text-[#9FA8DA] py-1">기록된 내용이 없습니다.</div>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </aside>

                <main className="flex-1 flex overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="rounded-xl border border-[#C5CAE9] overflow-hidden mb-4 transition-all duration-200 hover:shadow-[0_4px_12px_rgba(63,81,181,0.08)]">
                            <div className="bg-[#F8F9FD] px-4 py-2 border-b border-[#C5CAE9] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-medium text-[#616161]">No. {displayChartNo}</span>
                                    <span className="text-[13px] font-bold text-[#1A237E]">{displayName}</span>
                                    <span className="text-[12px] text-[#616161]">{displayGender} · {displayAge}세</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 bg-[#E8EAF6] text-[#3F51B5] rounded text-[11px] font-medium">누적 {cumulativePaymentLabel}</span>
                                    {displayTags.map((tag: string) => (
                                        <span key={tag} className="px-2 py-0.5 bg-[#E8EAF6] text-[#3F51B5] rounded text-[11px] font-medium">{tag}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-white px-4 py-3">
                                <div className="grid grid-cols-3 gap-4 text-[13px]">
                                    <div>
                                        <span className="block text-[11px] text-[#616161] mb-0.5 font-medium tracking-[0.1px]">주민등록번호</span>
                                        <span className="text-[#242424] font-medium">{displayResidentNumber}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[11px] text-[#616161] mb-0.5 font-medium tracking-[0.1px]">대표연락처</span>
                                        <span className="text-[#242424] font-medium">{displayPhone}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[11px] text-[#616161] mb-0.5 font-medium tracking-[0.1px]">주소</span>
                                        <span className="text-[#242424] font-medium">{displayAddress || "-"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-[#C5CAE9] overflow-hidden transition-all duration-200 hover:shadow-[0_4px_12px_rgba(63,81,181,0.08)]">
                            <div className="bg-[#F8F9FD] px-4 py-2 border-b border-[#C5CAE9]">
                                <h3 className="text-[13px] font-semibold text-[#1A237E]">접수정보</h3>
                            </div>
                            <div className="bg-white px-4 py-3 space-y-3">
                                <div>
                                    <label className="block text-[11px] font-medium text-[#616161] mb-1.5 tracking-[0.1px]">방문목적</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {validPurposes.length > 0 ? (
                                            validPurposes.map(vp => (
                                                <button
                                                    key={vp.id}
                                                    onClick={() => togglePurpose(vp.id)}
                                                    className={`px-3 py-1.5 rounded-lg text-[13px] min-h-[34px] border transition-all duration-200 ${visitPurposeIds.includes(vp.id)
                                                        ? "bg-[#3F51B5] border-[#3F51B5] text-white font-bold"
                                                        : "bg-white border-[#C5CAE9] text-[#242424] font-medium hover:bg-[#E8EAF6]"
                                                        }`}
                                                >
                                                    {visitPurposeIds.includes(vp.id) && <Check className="w-3 h-3 inline-block mr-0.5" />}
                                                    {vp.label}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="text-[13px] text-[#616161]">설정된 방문목적이 없습니다.</div>
                                        )}
                                    </div>
                                </div>

                                {currentPlanned.length > 0 && (
                                    <div className="rounded-lg border border-[#C5CAE9] bg-[#E8EAF6] p-2.5">
                                        <div className="mb-1 text-[11px] font-bold text-[#1A237E]">예약 시술</div>
                                        <div className="flex flex-wrap gap-1">
                                            {currentPlanned.map((name, idx) => (
                                                <span
                                                    key={`planned-current-${idx}-${name}`}
                                                    className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#3F51B5] border border-[#C5CAE9]"
                                                >
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-medium text-[#616161] mb-1 tracking-[0.1px]">담당의</label>
                                        <select
                                            value={doctor}
                                            onChange={e => setDoctor(e.target.value)}
                                            className="w-full px-3 py-2 bg-[#F0F2F9] border-0 border-b-2 border-b-[#C5CAE9] rounded-t-lg text-[13px] text-[#242424] focus:outline-none focus:border-b-[#536DFE] transition-all duration-200 appearance-none min-h-[38px]"
                                        >
                                            <option value="">선택</option>
                                            {doctorCandidates.map((member) => (
                                                <option key={member.id} value={member.name}>
                                                    {member.name}{member.jobTitleName ? ` (${member.jobTitleName})` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-[#616161] mb-1 tracking-[0.1px]">대기장소</label>
                                        <select
                                            value={selectedRoom}
                                            onChange={e => setSelectedRoom(e.target.value)}
                                            className="w-full px-3 py-2 bg-[#F0F2F9] border-0 border-b-2 border-b-[#C5CAE9] rounded-t-lg text-[13px] text-[#242424] focus:outline-none focus:border-b-[#536DFE] transition-all duration-200 appearance-none min-h-[38px]"
                                        >
                                            {roomOptions.map(opt => (
                                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-[11px] font-medium text-[#616161] tracking-[0.1px]">접수메모</label>
                                        <span className="text-[11px] text-[#616161]">{memo.length}/1000</span>
                                    </div>
                                    <textarea
                                        value={memo}
                                        onChange={e => setMemo(e.target.value)}
                                        className="w-full h-20 px-3 py-2 bg-[#F0F2F9] border-0 border-b-2 border-b-[#C5CAE9] rounded-t-lg text-[13px] text-[#242424] focus:outline-none focus:border-b-[#536DFE] transition-all duration-200 resize-none leading-relaxed"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-56 border-l border-[#C5CAE9] bg-white flex flex-col shrink-0 overflow-y-auto">
                        <div className="bg-[#F8F9FD] px-3 py-2 border-b border-[#C5CAE9]">
                            <h3 className="text-[13px] font-semibold text-[#1A237E]">다가올 예약 <span className="text-[11px] font-bold text-[#3F51B5] bg-[#3F51B5]/10 px-1.5 py-0.5 rounded-full">{upcomingReservations.length}</span></h3>
                        </div>
                        <div className="p-2 space-y-1.5 flex-1">
                            {upcomingReservations.length === 0 ? (
                                <div className="text-[12px] text-[#616161] p-2">예정된 예약이 없습니다.</div>
                            ) : (
                                upcomingReservations.map((r: any) => {
                                    const rDate = r.reservDateTime || r.scheduledAt;
                                    const dateStr = rDate ? format(new Date(rDate), "yyyy-MM-dd") : "";
                                    const timeStr = rDate ? format(new Date(rDate), "HH:mm") : "";
                                    const categoryName = r.reservCategoryName || r.categoryName || "";
                                    const rMemo = String(r.reservationMemo || r.memo || "").trim();
                                    return (
                                        <div key={r.id} className="rounded-lg border border-[#C5CAE9] bg-white p-2 hover:bg-[#E8EAF6] transition-colors">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <Calendar className="w-3 h-3 text-[#3F51B5] shrink-0" />
                                                <span className="text-[11px] font-bold text-[#1A237E]">{dateStr}</span>
                                                <span className="text-[10px] font-medium text-[#3F51B5]">{timeStr}</span>
                                            </div>
                                            {categoryName && (
                                                <div className="text-[10px] text-[#616161] mb-0.5">
                                                    <span className="px-1.5 py-0.5 rounded bg-[#E8EAF6] text-[#3F51B5] font-medium">{categoryName}</span>
                                                </div>
                                            )}
                                            {rMemo && (
                                                <div className="text-[10px] text-[#616161] mt-1 bg-slate-50 rounded px-1.5 py-0.5 border border-slate-200">
                                                    {rMemo}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </main>
            </div>

            <div className="px-5 py-2.5 border-t border-[#C5CAE9] bg-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="px-4 py-1.5 border border-[#C5CAE9] rounded-lg text-[13px] font-bold text-[#242424] hover:bg-[#E8EAF6] transition-all duration-200 min-h-[38px]">
                        취소
                    </button>
                    {onCancelReservation && patient.location === 'reservation' && (
                        <button
                            onClick={onCancelReservation}
                            className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[13px] font-bold transition-all duration-200 min-h-[38px]"
                        >
                            예약 삭제
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {onQuickAction && (
                        <button
                            type="button"
                            onClick={() => {
                                void handleQuickSubmit();
                            }}
                            disabled={quickActionDisabled}
                            className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-all duration-200 min-h-[38px] ${
                                quickActionDisabled
                                    ? "bg-[#E8EAF6] text-[#3F51B5]/50 cursor-not-allowed"
                                    : "bg-emerald-500 hover:bg-emerald-600 text-white"
                            }`}
                        >
                            {quickActionBusy ? "처리 중.." : quickActionLabel}
                        </button>
                    )}
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-1.5 bg-[#3F51B5] hover:bg-[#303F9F] text-white rounded-lg text-[13px] font-bold transition-all duration-200 min-h-[38px]"
                    >
                        {isEditMode ? "저장" : "접수"}
                    </button>
                </div>
            </div>
        </div>
    );
}

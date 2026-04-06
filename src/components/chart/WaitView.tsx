import React, { useState, useEffect, useMemo, useRef } from "react";
import { useChartStore, Patient } from "../../stores/useChartStore";
import { differenceInMinutes, format } from "date-fns";
import { WaitCard } from "./WaitCard";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { todoService, TodoItem } from "../../services/todoService";
import { visitService } from "../../services/visitService";
import { procedureService } from "../../services/procedureService";
import { memberConfigService } from "../../services/memberConfigService";
import { useScheduleStore } from "../../stores/useScheduleStore";
import { useAuthStore } from "../../stores/useAuthStore";
import type { StatusItem } from "../../types/settings";
import { resolveActiveBranchId } from "../../utils/branch";
import { resolveTransitionStatus } from "../../utils/statusTransitionResolver";
import { useChartSignalR } from "../../hooks/useChartSignalR";
import { VIEW_EVENT_MAP } from "../../config/signalrEvents";
import { printService, PrintSection } from "../../services/printService";

// Locations based on user request (Fallback)
const DEFAULT_LOCATIONS = [
    { id: "post_pay", label: "후수납" },
    { id: "main_wait", label: "메인대기실" },
    { id: "wash_room", label: "세안/탈의실" },
    { id: "exam_room", label: "검진실" },
    { id: "consult_room", label: "상담실" },
    { id: "mid_wait", label: "중간대기실" },
    { id: "care_1", label: "관리실1" },
    { id: "care_2", label: "관리실2" },
    { id: "hair_removal", label: "제모시술중" },
    { id: "treatment_1", label: "치료실1(어븀,...)" },
    { id: "treatment_3", label: "치료실3" },
    { id: "proc_1", label: "시술실1(텐써...)" },
    { id: "proc_2", label: "시술실2(온다,...)" },
    { id: "go_home", label: "귀가" },
];

function clampAlertMinutes(value?: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 20;
    return Math.min(720, Math.max(1, Math.round(n)));
}

function isStatusAlertTriggered(patient: Patient, statuses: StatusItem[], now: Date): boolean {
    const status = String(patient.status || "").toLowerCase();
    if (status === "done" || status === "completed") return false;

    const statusSetting =
        statuses.find((s) => s.id === patient.status) ??
        statuses.find((s) => s.label === patient.status);

    if (!statusSetting?.alertEnabled) return false;
    if (!patient.lastMovedAt) return false;

    const movedAt = new Date(patient.lastMovedAt);
    if (Number.isNaN(movedAt.getTime())) return false;

    const threshold = clampAlertMinutes(patient.statusAlertMinutes ?? statusSetting.alertAfterMinutes);
    const elapsed = differenceInMinutes(now, movedAt);
    return elapsed >= threshold;
}

export function WaitView() {
    const { patients, movePatient } = useChartStore();
    const { settings } = useSettingsStore();
    const { dateISO } = useScheduleStore();
    const currentUserName = useAuthStore((s) => s.userName);
    const isMobile = useMediaQuery("(max-width: 767px)");
    const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
    const [chartTodosByPatient, setChartTodosByPatient] = useState<Record<number, TodoItem[]>>({});
    const [todoAssignableMembers, setTodoAssignableMembers] = useState<Array<{ id: string; name: string; jobTitleName?: string }>>([]);
    const [printPreviewByPatient, setPrintPreviewByPatient] = useState<Record<number, string>>({});
    const [alertMessage, setAlertMessage] = useState<string | null>(null);

    useChartSignalR({
        onEventData: (data: any) => {
            if (data.eventType === 'procedure_status' && data.customerId && data.procedureId) {
                setChartTodosByPatient((prev) => {
                    const pid = Number(data.customerId);
                    const list = prev[pid];
                    if (!list) return prev;
                    const updated = list.map((t) =>
                        t.id === Number(data.procedureId)
                            ? {
                                ...t,
                                status: data.status || t.status,
                                isCompleted: data.status === "done",
                                startedAt: data.startTime || t.startedAt,
                                completedAt: data.endTime || t.completedAt,
                                assignee: data.managedByUserName || t.assignee,
                            }
                            : t
                    );
                    return { ...prev, [pid]: updated };
                });
            }
        },
        enabled: true,
        events: VIEW_EVENT_MAP.chart,
    });

    const resolvePrintMemoSections = () => {
        const raw = settings.chartConfig?.memoSections;
        const sections = (raw && raw.length > 0)
            ? raw.filter((m: any) => m.enabled).sort((a: any, b: any) => a.order - b.order)
            : [{ id: "chart1", label: "관리", enabled: true, order: 1 }, { id: "chart2", label: "원장상담", enabled: true, order: 2 }, { id: "chart3", label: "실장상담", enabled: true, order: 3 }];
        const fieldMap: Record<string, string> = {};
        sections.forEach((s: any, idx: number) => { fieldMap[s.id] = `chart${idx + 1}`; });
        return { sections, fieldMap };
    };

    const resolveChartValue = (visit: any, sectionId: string, chartField: string) =>
        String((visit as any)?.[chartField] || (visit?.consultation as any)?.[chartField] || (visit as any)?.[sectionId] || (visit?.consultation as any)?.[sectionId] || "").trim();

    const loadPrintPreview = async (patient: Patient) => {
        const customerId = Number(patient.patientId || 0);
        if (!Number.isFinite(customerId) || customerId <= 0) return;
        if (Object.prototype.hasOwnProperty.call(printPreviewByPatient, customerId)) return;
        try {
            const visitHistory = await visitService.getVisitHistory(customerId);
            const todayStr = format(new Date(), "yyyy-MM-dd");
            const todayVisit = (visitHistory || []).find((v: any) => {
                const vDate = v.scheduledAt || v.registerTime || v.createTime;
                return vDate && format(new Date(vDate), "yyyy-MM-dd") === todayStr;
            });
            if (!todayVisit) { setPrintPreviewByPatient((prev) => ({ ...prev, [customerId]: "당일 내원 기록 없음" })); return; }
            const pc = settings.chartConfig?.printConfig || [];
            const isPrintEnabled = (key: string) => { const found = pc.find((item: any) => item.key === key); return found ? found.enabled : true; };
            const { sections, fieldMap } = resolvePrintMemoSections();
            const lines: string[] = [`[인쇄] ${patient.name}`];
            for (const section of sections) {
                if (!isPrintEnabled(section.id)) continue;
                const chartField = fieldMap[section.id] || section.id;
                const value = resolveChartValue(todayVisit, section.id, chartField);
                if (value) lines.push(`[${(section as any).label}] ${value.substring(0, 60)}${value.length > 60 ? "..." : ""}`);
            }
            if (isPrintEnabled("medicalRecord")) {
                const mr = String((todayVisit as any)?.medicalRecord || "").trim();
                if (mr) lines.push(`[진료기록] ${mr.substring(0, 60)}${mr.length > 60 ? "..." : ""}`);
            }
            if (isPrintEnabled("todo")) {
                const todos = chartTodosByPatient[customerId] || [];
                if (todos.length > 0) {
                    const todoPreview = todos.slice(0, 3).map((t) => `${t.isCompleted ? "✓" : "○"} ${t.content}`).join(", ");
                    lines.push(`[할일 ${todos.length}건] ${todoPreview.substring(0, 60)}${todoPreview.length > 60 ? "..." : ""}`);
                }
            }
            if (lines.length === 1) lines.push("인쇄할 차트 내용 없음");
            setPrintPreviewByPatient((prev) => ({ ...prev, [customerId]: lines.join("\n") }));
        } catch { setPrintPreviewByPatient((prev) => ({ ...prev, [customerId]: "미리보기 로드 실패" })); }
    };

    const handlePrintPatientChart = async (patient: Patient) => {
        const customerId = Number(patient.patientId || 0);
        if (!Number.isFinite(customerId) || customerId <= 0) return;
        try {
            const visitHistory = await visitService.getVisitHistory(customerId);
            const todayStr = format(new Date(), "yyyy-MM-dd");
            const todayVisit = (visitHistory || []).find((v: any) => {
                const vDate = v.scheduledAt || v.registerTime || v.createTime;
                return vDate && format(new Date(vDate), "yyyy-MM-dd") === todayStr;
            });
            if (!todayVisit) { setAlertMessage("당일 내원 기록이 없어 인쇄할 수 없습니다."); return; }
            const pc = settings.chartConfig?.printConfig || [];
            const isPrintEnabled = (key: string) => { const found = pc.find((item: any) => item.key === key); return found ? found.enabled : true; };
            const { sections: memoSecs, fieldMap } = resolvePrintMemoSections();
            const printSections: PrintSection[] = [];
            for (const section of memoSecs) {
                if (!isPrintEnabled(section.id)) continue;
                const chartField = fieldMap[section.id] || section.id;
                const value = resolveChartValue(todayVisit, section.id, chartField);
                if (value) printSections.push({ label: (section as any).label, content: value });
            }
            if (isPrintEnabled("medicalRecord")) {
                const mr = String((todayVisit as any)?.medicalRecord || "").trim();
                if (mr) printSections.push({ label: "진료기록", content: mr });
            }
            if (isPrintEnabled("todo")) {
                let todos = chartTodosByPatient[customerId] || [];
                if (todos.length === 0) {
                    try {
                        const allTodos = await procedureService.getByCustomer(customerId, todayVisit.id);
                        todos = (allTodos || []).map((t: any) => ({ content: t.name || t.content || "", isCompleted: t.status === "done" })) as any;
                    } catch {}
                }
                if (todos.length > 0) {
                    const todoLines = todos.map((t: any) => `${t.isCompleted ? "✓" : "○"} ${t.content}`).join("\n");
                    printSections.push({ label: "할일", content: todoLines });
                }
            }
            if (printSections.length === 0) { setAlertMessage("인쇄할 차트 내용이 없습니다."); return; }
            const patientAge = patient.age || "";
            const visitDate = format(new Date(todayVisit.scheduledAt || todayVisit.registerTime || todayVisit.createTime), "yyyy-MM-dd HH:mm:ss");
            const headerParts: string[] = [`${patient.name}${patientAge ? ` (${patientAge}세)` : ""}\n${visitDate}`];
            const staffParts: string[] = [];
            if (isPrintEnabled("counselor") && (todayVisit as any)?.counselorName) staffParts.push(`상담:${(todayVisit as any).counselorName}`);
            if (isPrintEnabled("doctorCounselor") && (todayVisit as any)?.doctorCounselorName) staffParts.push(`원장상담:${(todayVisit as any).doctorCounselorName}`);
            if (isPrintEnabled("doctor") && (todayVisit as any)?.doctorName) staffParts.push(`담당의:${(todayVisit as any).doctorName}`);
            if (staffParts.length > 0) headerParts.push(staffParts.join("  "));
            await printService.printChartSections(printSections, headerParts.join("\n"));
        } catch (error) { console.error("failed to print chart", error); setAlertMessage("인쇄 중 오류가 발생했습니다."); }
    };

    const locations = useMemo(() => {
        if (settings.chartConfig?.waitLists && settings.chartConfig.waitLists.length > 0) {
            const enabled = settings.chartConfig.waitLists
                .filter(w => w.enabled)
                .sort((a, b) => a.order - b.order)
                .map(w => ({
                    // Use ID from settings if available, otherwise fallback to label but preferably we should use consistent IDs.
                    id: w.id || w.label,
                    label: w.label
                }));

            if (enabled.length > 0) return enabled;
        }
        return DEFAULT_LOCATIONS;
    }, [settings.chartConfig?.waitLists]);

    // Initialize mobile location to first available
    const [mobileLocation, setMobileLocation] = useState(locations[0]?.id || "main_wait");

    // Force re-render every minute to update "Wait X mins"
    const [, setTick] = useState(0);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Hover State
    const [hoveredCard, setHoveredCard] = useState<{ id: number, data: Patient, rect: DOMRect } | null>(null);

    const handleCardHover = (event: React.MouseEvent<HTMLDivElement>, data: Patient) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setHoveredCard({ id: data.id, data, rect });
    };

    const handleCardLeave = () => {
        setHoveredCard(null);
    };

    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(timer);
    }, []);

    const locationStats = useMemo(() => {
        const stats = new Map<string, { count: number; hasAlert: boolean }>();
        for (const loc of locations) {
            stats.set(loc.id, { count: 0, hasAlert: false });
        }

        const statusSettings = settings.chartConfig?.statuses || [];
        const now = new Date();

        for (const patient of patients) {
            const current = stats.get(patient.location);
            if (!current) continue;

            current.count += 1;
            if (!current.hasAlert && isStatusAlertTriggered(patient, statusSettings, now)) {
                current.hasAlert = true;
            }
        }

        return stats;
    }, [locations, patients, settings.chartConfig?.statuses]);

    // Update mobile location if list changes
    useEffect(() => {
        if (!locations.find(l => l.id === mobileLocation)) {
            setMobileLocation(locations[0]?.id || "main_wait");
        }
    }, [locations, mobileLocation]);

    useEffect(() => {
        const loadChartTodos = async () => {
            try {
                const branchId = resolveActiveBranchId();
                if (!branchId) return;
                const numericBranchId = Number(branchId);
                const [receptionData, members, jobTitles] = await Promise.all([
                    visitService.getVisitsByDate(dateISO, branchId),
                    (Number.isFinite(numericBranchId) && numericBranchId > 0
                        ? memberConfigService.getMembers(numericBranchId)
                        : Promise.resolve([] as any[])
                    ).catch(() => [] as any[]),
                    memberConfigService.getJobTitles().catch(() => [] as any[])
                ]);

                const byPatient: Record<number, TodoItem[]> = {};
                for (const visit of (receptionData || [])) {
                    const customerId = Number((visit as any).customerId || 0);
                    if (customerId <= 0) continue;
                    const procedures = (visit as any).procedures || [];
                    if (procedures.length === 0) continue;
                    byPatient[customerId] = procedures.map((p: any) => ({
                        id: p.id,
                        customerId,
                        content: p.name || "",
                        status: p.status === "done" ? "done" : p.status === "doing" ? "doing" : "todo",
                        isCompleted: p.status === "done",
                        sourceType: p.sourceType,
                        procedureName: p.name,
                        startedAt: p.startTime,
                        startedBy: p.managedByUserName,
                        completedAt: p.endTime,
                        completedBy: p.managedByUserName,
                        assignee: (p.status === "done" || p.status === "doing") ? p.managedByUserName : "",
                        creator: p.managedByUserName || "",
                        createdAt: p.registerTime || "",
                    }));
                }
                setChartTodosByPatient(byPatient);

                const allowedJobIds = settings.chartConfig?.statusRules?.todoPerformerJobTitleIds || [];
                const jobTitleMap = new Map<string, string>(
                    (jobTitles || []).map((j: any) => [String(j.id), String(j.name || "")])
                );
                const filtered = (members || []).filter((m: any) => {
                    if (m?.isApproved === false) return false;
                    const jobId = String(m?.jobTitleId || "");
                    const jobName = String(jobTitleMap.get(jobId) || "");
                    if (allowedJobIds.length > 0) return jobId && allowedJobIds.includes(jobId);
                    return !jobName.includes("코디");
                });
                setTodoAssignableMembers(
                    filtered.map((m: any) => {
                        const jobId = String(m?.jobTitleId || "");
                        return {
                            id: String(m.id),
                            name: String(m.name || ""),
                            jobTitleName: jobTitleMap.get(jobId) || undefined
                        };
                    })
                );
            } catch (error) {
                console.error("Failed to load wait-view todos:", error);
            }
        };

        void loadChartTodos();
    }, [dateISO, settings.activeBranchId, settings.chartConfig?.statusRules?.todoPerformerJobTitleIds]);

    const handleCycleTodoStatus = async (todo: TodoItem, actor?: string) => {
        const current = (todo.status || (todo.isCompleted ? "done" : "todo")) as "todo" | "doing" | "done";
        const next: "todo" | "doing" | "done" =
            current === "todo" ? "doing" : current === "doing" ? "done" : "todo";
        const actorName = (actor || todo.assignee || currentUserName || "").trim() || undefined;

        setChartTodosByPatient((prev) => {
            const nextMap: Record<number, TodoItem[]> = { ...prev };
            for (const key of Object.keys(nextMap)) {
                const pid = Number(key);
                const list = nextMap[pid] || [];
                nextMap[pid] = list.map((t) =>
                    t.id === todo.id
                        ? {
                            ...t,
                            status: next,
                            isCompleted: next === "done",
                            startedBy: next === "doing" ? (actorName || t.startedBy) : (next === "todo" ? undefined : t.startedBy),
                            startedAt: next === "doing" && !t.startedAt ? new Date().toISOString() : (next === "todo" ? undefined : t.startedAt),
                            completedBy: next === "done" ? (actorName || t.completedBy) : undefined,
                            completedAt: next === "done" ? new Date().toISOString() : undefined,
                        }
                        : t
                );
            }
            return nextMap;
        });

        try {
            const customerId = Number(todo.customerId || 0);
            if (customerId > 0) {
                await procedureService.updateStatus(customerId, todo.id);
            } else {
                await todoService.setTodoStatus(todo.id, next, actorName);
            }
        } catch (error) {
            console.error("Failed to update todo status on wait view:", error);
        }
    };

    const handleTodoAssigneeChange = async (todoId: number, assignee?: string) => {
        const normalized = (assignee || "").trim();
        const selectedMember = todoAssignableMembers.find((m) => m.name === normalized);
        const assigneeUserId = selectedMember ? Number(selectedMember.id) : undefined;

        setChartTodosByPatient((prev) => {
            const nextMap: Record<number, TodoItem[]> = { ...prev };
            for (const key of Object.keys(nextMap)) {
                const pid = Number(key);
                const list = nextMap[pid] || [];
                nextMap[pid] = list.map((t) =>
                    t.id === todoId
                        ? {
                            ...t,
                            assignee: normalized || undefined,
                            assigneeUserId: Number.isFinite(assigneeUserId as number) ? assigneeUserId : undefined
                        }
                        : t
                );
            }
            return nextMap;
        });

        try {
            const todoEntry = Object.values(chartTodosByPatient).flat().find((t) => t.id === todoId);
            const customerId = Number(todoEntry?.customerId || 0);
            if (customerId > 0) {
                await procedureService.assignUser(customerId, todoId, assigneeUserId ?? null, normalized || null);
            } else {
                await todoService.setTodoAssignee(todoId, assigneeUserId, normalized || undefined);
            }
        } catch (error) {
            console.error("Failed to update todo assignee on wait view:", error);
        }
    };


    const handleDragStart = (e: React.DragEvent, patientId: number) => {
        e.dataTransfer.setData("patientId", patientId.toString());
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        // Auto-scroll horizontally while dragging near the edges on desktop.
        if (isMobile) return;
        const el = horizontalScrollRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const edgeThreshold = 72;
        const scrollStep = 28;

        if (e.clientX <= rect.left + edgeThreshold) {
            el.scrollLeft -= scrollStep;
        } else if (e.clientX >= rect.right - edgeThreshold) {
            el.scrollLeft += scrollStep;
        }
    };

    const movePatientToLocation = async (patientId: number, locationId: string) => {
        if (!patientId) return;
        const patient = patients.find(p => p.id === patientId);
        if (patient && patient.location === locationId) return;

        const isDoneMove = String(locationId || "").trim().toLowerCase() === "done";
        const newStatus = isDoneMove
            ? "done"
            : resolveTransitionStatus({
                actionType: "drag_move",
                fromLocationId: patient?.location,
                toLocationId: locationId,
                currentStatus: patient?.status,
                statusRules: settings.chartConfig?.statusRules,
                statuses: settings.chartConfig?.statuses,
            });

        // Optimistic update
        if (isDoneMove) {
            movePatient(patientId, locationId);
        } else {
            movePatient(patientId, locationId, { status: newStatus });
        }

        // Persist to backend
        try {
            await import("../../services/visitService").then(({ visitService }) => {
                visitService.updateVisit(patientId, {
                    room: locationId,
                    status: newStatus
                });
            });
        } catch (error) {
            console.error("Failed to move patient:", error);
            setAlertMessage("이동 저장 실패");
        }
    };

    const handleDrop = async (e: React.DragEvent, locationId: string) => {
        e.preventDefault();
        const patientId = Number(e.dataTransfer.getData("patientId"));
        if (!patientId) return;
        await movePatientToLocation(patientId, locationId);
    };

    const shouldShowHoverOverlay = Boolean(
        hoveredCard &&
        !isDropdownOpen &&
        hoveredCard.data.history
    );

    return (
        <>
        <div className="flex-1 h-full flex flex-col overflow-hidden">
            {/* Mobile Location Selector */}
            <div className="xl:hidden shrink-0 border-b border-slate-200/80 bg-white/80 px-3 py-2 backdrop-blur">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {locations.map((loc) => {
                        const stat = locationStats.get(loc.id);
                        const count = stat?.count || 0;
                        const hasAlert = Boolean(stat?.hasAlert);
                        const isActive = mobileLocation === loc.id;
                        return (
                            <button
                                key={loc.id}
                                type="button"
                                onClick={() => setMobileLocation(loc.id)}
                                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${hasAlert
                                    ? (isActive
                                        ? "bg-red-600 text-white border-red-600 shadow-sm"
                                        : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100")
                                    : (isActive
                                        ? "bg-[rgb(var(--kkeut-primary-strong))] text-white border-[rgb(var(--kkeut-primary-strong))] shadow-sm"
                                        : "bg-white/90 text-slate-700 border-slate-200 hover:bg-slate-50")
                                    }`}
                            >
                                {hasAlert && <span className={`h-2 w-2 rounded-full ${isActive ? "bg-white/90" : "bg-red-500 animate-pulse"}`} />}
                                {loc.label}
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${hasAlert
                                    ? (isActive ? "bg-white/20 text-white" : "bg-red-100 text-red-700")
                                    : (isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600")
                                    }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Area */}
            <div
                ref={horizontalScrollRef}
                className={isMobile ? "flex-1 overflow-y-auto p-2.5" : "flex-1 overflow-x-auto overflow-y-hidden p-2.5"}
            >
                <div className={isMobile ? "h-full w-full" : "flex h-full gap-3 min-w-max"}>
                    {locations.map(loc => {
                        // On mobile, only render the selected location
                        if (isMobile && loc.id !== mobileLocation) return null;

                        const statusOrderMap = new Map<string, number>(
                            (settings.chartConfig?.statuses || [])
                                .filter((status) => status.enabled)
                                .map((status) => [String(status.id || "").trim().toLowerCase(), Number(status.order || 0)])
                        );
                        const useStatusOrder = settings.chartConfig?.statusRules?.applyWaitOrderSorting ?? true;
                        const locationPatients = patients
                            .filter((p) => p.location === loc.id)
                            .slice()
                            .sort((a, b) => {
                                if (useStatusOrder) {
                                    const ao = statusOrderMap.get(String(a.status || "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
                                    const bo = statusOrderMap.get(String(b.status || "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
                                    if (ao !== bo) return ao - bo;
                                }

                                const ac = String(a.checkInTime || "99:99");
                                const bc = String(b.checkInTime || "99:99");
                                if (ac !== bc) return ac.localeCompare(bc);
                                return String(a.name || "").localeCompare(String(b.name || ""), "ko-KR");
                            });
                        const hasAlert = Boolean(locationStats.get(loc.id)?.hasAlert);

                        return (
                            <div
                                key={loc.id}
                                className={`${isMobile ? "w-full" : "w-[348px]"} kkeut-panel flex flex-col h-full transition-colors ${hasAlert ? "ring-1 ring-red-200/90" : ""}`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, loc.id)}
                            >
                                {/* Column Header - Only visible on Desktop or if we want it on mobile too (optional, but redundancy with tabs) */}
                                {!isMobile && (
                                    <div className={`p-3 border-b flex items-center justify-between shrink-0 rounded-t-2xl backdrop-blur ${hasAlert ? "border-red-200/80 bg-red-50/75" : "border-slate-200/70 bg-white/75"}`}>
                                        <div className="flex items-center gap-1.5">
                                            {hasAlert && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                                            <span className={`font-bold text-sm tracking-tight ${hasAlert ? "text-red-700" : "text-slate-800"}`}>{loc.label}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 border rounded-full text-xs font-semibold ${hasAlert ? "bg-red-100 border-red-200 text-red-700" : "bg-white border-slate-200 text-slate-500"}`}>
                                            {locationPatients.length}
                                        </span>
                                    </div>
                                )}

                                {/* Cards */}
                                <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5">
                                    {locationPatients.length === 0 ? (
                                        <div className="flex-1 flex flex-col items-center justify-center h-40 text-gray-400 text-xs text-center pointer-events-none">
                                            대기 환자가 없어요.
                                        </div>
                                    ) : (
                                        locationPatients.map(patient => (
                                            <WaitCard
                                                key={patient.id}
                                                patient={patient}
                                                patientTodos={chartTodosByPatient[(patient.patientId || patient.id) as number] || []}
                                                todoAssignableMembers={todoAssignableMembers}
                                                locationOptions={locations}
                                                onMoveLocation={(selectedPatient, nextLocationId) => {
                                                    void movePatientToLocation(selectedPatient.id, nextLocationId);
                                                }}
                                                onTodoCycle={handleCycleTodoStatus}
                                                onTodoAssigneeChange={handleTodoAssigneeChange}
                                                showTodos={true}
                                                onStatusDropdownChange={setIsDropdownOpen}
                                                onDragStart={(e) => handleDragStart(e, patient.id)}
                                                onMouseEnter={(e) => { handleCardHover(e, patient); void loadPrintPreview(patient); }}
                                                onMouseLeave={handleCardLeave}
                                                onPrint={() => handlePrintPatientChart(patient)}
                                                printPreview={printPreviewByPatient[Number(patient.patientId || patient.id)] || "인쇄 미리보기 로드 중..."}
                                                expandOnClick={true}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Hover Overlay */}
            {
                shouldShowHoverOverlay && hoveredCard && (
                    <div
                        className="fixed z-[9999] kkeut-card-luxe p-5 w-[420px] animate-in fade-in duration-200 pointer-events-none"
                        style={{
                            top: hoveredCard.rect.bottom + 12,
                            left: hoveredCard.rect.left,
                        }}
                    >
                        <div className="space-y-3">
                            {hoveredCard.data.history && (
                                <div className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                                    {hoveredCard.data.history}
                                </div>
                            )}
                        </div>
                    </div>
                )
            }
        </div>
        {alertMessage && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30">
                <div className="bg-white rounded-xl border border-[#C5CAE9] p-5 shadow-lg max-w-sm">
                    <div className="text-[13px] text-[#242424] mb-3">{alertMessage}</div>
                    <button onClick={() => setAlertMessage(null)} className="px-4 py-1.5 bg-[#3F51B5] text-white rounded-lg text-[13px] font-bold">확인</button>
                </div>
            </div>
        )}
        </>
    );
}

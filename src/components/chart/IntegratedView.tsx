import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Search, MoreHorizontal, Plus, FileText, Check, X, Ticket } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, getDay, getDate, differenceInYears } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ko } from "date-fns/locale";
import { useHospitalTaskStore, TaskItem } from "../../stores/useHospitalTaskStore";
import { useChartStore, Patient } from "../../stores/useChartStore";
import { useScheduleStore } from "../../stores/useScheduleStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { WaitCard } from "./WaitCard";
import { ConfirmModal } from "./ConfirmModal";
import { ReceptionForm } from "./ReceptionForm";
import ReservationCancelModal from "../../pages/ReservationCancelModal";
import { NewPatientModal } from "../common/NewPatientModal";
import { visitService } from "../../services/visitService";
import { ticketService } from "../../services/ticketService";
import { consentService } from "../../services/consentService";
import { patientRecordService } from "../../services/patientRecordService";
import { todoService, TodoItem } from "../../services/todoService";
import { procedureService } from "../../services/procedureService";
import { procedureTodoStatsService } from "../../services/procedureTodoStatsService";
import { memberConfigService } from "../../services/memberConfigService";
import { printService, PrintSection } from "../../services/printService";
import { useChartSignalR } from "../../hooks/useChartSignalR";
import { VIEW_EVENT_MAP } from "../../config/signalrEvents";
import { useAuthStore } from "../../stores/useAuthStore";
import { resolveActiveBranchId } from "../../utils/branch";
import { resolveTransitionStatus } from "../../utils/statusTransitionResolver";
import {
    buildProcedureDurationOverrideMap,
    buildProcedureQueueMap,
    resolveProcedureQueueSummary,
    type ProcedureQueueSummary,
} from "../../utils/todoQueue";
import type { CartItem } from "../../services/cartService";
import { categoryTicketDefService } from "../../services/categoryTicketDefService";
import { normalizeQueueProcedureKey } from "../../utils/todoQueue";

function toStringArray(value: any): string[] {
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
}

function getPlannedSummary(patient: Patient): string[] {
    const treatments = toStringArray((patient as any).plannedTreatments);
    if (treatments.length > 0) return treatments;
    return toStringArray((patient as any).plannedTicketNames);
}

function getPlannedTicketIds(patient: Patient): string[] {
    return toStringArray((patient as any).plannedTicketIds);
}

function getPlannedTicketNames(patient: Patient): string[] {
    return toStringArray((patient as any).plannedTicketNames);
}

function getHoverPlannedProcedures(
    patient: Patient,
    tickets: HoverTicketSummary[],
    hasTicketSnapshot: boolean
): string[] {
    const explicitTreatments = toStringArray((patient as any).plannedTreatments)
        .map((value) => String(value).trim())
        .filter(Boolean);

    const matchedReservedKeys = new Set(
        tickets
            .filter((ticket) => ticket.isReserved)
            .flatMap((ticket) => [normalizeTicketKey(ticket.ticketId), normalizeTicketKey(ticket.ticketName)])
            .filter(Boolean)
    );

    const unmatchedTicketNames = hasTicketSnapshot
        ? getPlannedTicketNames(patient)
            .map((value) => String(value).trim())
            .filter(Boolean)
            .filter((name) => !matchedReservedKeys.has(normalizeTicketKey(name)))
        : [];

    return Array.from(new Set([...explicitTreatments, ...unmatchedTicketNames]));
}

type QuickActionPhase = "checking" | "queued" | "running";

interface PackageRoundSelection {
    round: number;
    treatments: string[];
}

interface QuickReceptionAction {
    patientVisitId: number;
    patientCustomerId: number;
    patientName: string;
    targetRoomId: string;
    targetRoomLabel: string;
    targetStatus: string;
    ticketId: string;
    ticketName: string;
    ticketBeforeRemaining: number;
    isPeriod: boolean;
    autoTodoPayloads?: Array<{
        content: string;
        meta: {
            sourceType: string;
            sourceTicketId?: string;
            procedureKey?: string;
            procedureName?: string;
        };
    }>;
    selectedPackageRound?: number;
    selectedPackageTreatments?: string[];
    allowCycleOverride?: boolean;
    executeAt: number;
    isReservation?: boolean;
    receptionData?: any;
    reservationPatient?: Patient;
    extraTickets?: QuickTicketOption[];
}

interface QuickTicketOption {
    ticketId: string;
    ticketName: string;
    remaining: number;
    isPeriod: boolean;
    isPackage: boolean;
    matchedPlanned: boolean;
    cycleBlocked: boolean;
    cycleBlockReason?: string;
    nextAvailableAt?: string;
    autoTodoEnabled: boolean;
    autoTodoTemplate?: string;
    autoTodoTasks?: string[];
    autoTodoProcedureName?: string;
    queueCategoryName?: string;
    queueDurationMinutes?: number;
    packageSelections?: PackageRoundSelection[];
    defaultPackageRound?: number;
    queueTodoCount?: number;
    queueDoingCount?: number;
    queueEstimatedWaitMinutes?: number;
    queueProcedureName?: string;
}

interface HoverTicketSummary {
    ticketId: string;
    ticketName: string;
    remaining: number;
    isPeriod: boolean;
    isReserved: boolean;
    cycleBlocked: boolean;
    cycleBlockReason?: string;
    nextAvailableAt?: string;
}

interface HoverKeyRecordSummary {
    id: number;
    content: string;
    createdAt?: string;
    createdByName?: string;
}

interface QuickTicketPickerState {
    patient: Patient;
    patientCustomerId: number;
    targetRoomId: string;
    targetRoomLabel: string;
    targetStatus: string;
    options: QuickTicketOption[];
    message?: string;
    selectedIds: string[];
}

interface QuickPackagePickerState {
    patient: Patient;
    patientCustomerId: number;
    targetRoomId: string;
    targetRoomLabel: string;
    targetStatus: string;
    option: QuickTicketOption;
    options: PackageRoundSelection[];
    selectedRoundKey: string;
    selectedTreatments: string[];
    allowCycleOverride?: boolean;
}

const CONSENT_REQUIRED_KEYWORDS = ["제모", "레이저", "시술", "필러", "보톡스", "리프팅"];
const SIDE_EFFECT_KEYWORDS = ["부작용", "알레르기", "주의"];
const COMPLAINT_KEYWORDS = ["민원", "클레임", "불만"];
const UNPAID_KEYWORDS = ["미수", "체납", "수납필요"];

function normalizeTicketKey(value: unknown): string {
    return String(value ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

function toPositiveInt(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.trunc(n));
}

function canOverrideCycleBlock(option: Pick<QuickTicketOption, "cycleBlocked" | "nextAvailableAt">): boolean {
    return Boolean(option.cycleBlocked && option.nextAvailableAt);
}

function isEmailLike(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function buildQuickTodoContent(
    ticketName: string,
    template?: string,
    selected?: { round: number; treatment: string }
): string {
    const baseName = String(ticketName || "시술권").trim() || "시술권";
    const fallback = selected
        ? `${baseName} ${selected.round}회차 - ${selected.treatment}`
        : baseName;

    const rawTemplate = String(template || "").trim();
    if (!rawTemplate) return fallback;

    let parsed = rawTemplate;
    if (selected) {
        parsed = parsed
            .replaceAll("{ticketName}", baseName)
            .replaceAll("{round}", String(selected.round))
            .replaceAll("{treatment}", String(selected.treatment));
    } else {
        parsed = parsed.replaceAll("{ticketName}", baseName);
    }

    if (selected && parsed === rawTemplate) {
        return `${parsed} - ${selected.round}회차 ${selected.treatment}`;
    }
    return parsed;
}

function normalizeTodoProcedureKey(value?: string): string {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[()[\]{}\/\\+_:\-·]/g, " ")
        .replace(/\s+/g, "_");
    return normalized || "etc";
}

function toPackageRoundSelections(rounds: any): PackageRoundSelection[] {
    if (!Array.isArray(rounds)) return [];

    const options: PackageRoundSelection[] = [];
    for (const round of rounds) {
        const roundNo = Number(round?.round || 0);
        const treatments = Array.isArray(round?.treatments)
            ? round.treatments
            : [];
        const normalizedTreatments = treatments
            .map((value: any) => String(value || "").trim())
            .filter(Boolean);
        if (normalizedTreatments.length === 0) continue;
        options.push({
            round: roundNo > 0 ? roundNo : 1,
            treatments: normalizedTreatments,
        });
    }
    return options;
}

function buildQuickTodoContents(
    option: QuickTicketOption,
    selected?: PackageRoundSelection
): Array<{
    content: string;
    meta: {
        sourceType: string;
        sourceTicketId?: string;
        procedureKey?: string;
        procedureName?: string;
    };
}> {
    if (!option.autoTodoEnabled) return [];

    const sourceTicketId = String(option.ticketId || "").trim() || undefined;
    const queueCategoryName = String(option.queueCategoryName || "").trim();
    const configuredProcedure = queueCategoryName || String(option.autoTodoProcedureName || "").trim();
    const todoLabelBase = configuredProcedure || option.ticketName;
    const configuredTasks = (option.autoTodoTasks || [])
        .map((task) => String(task || "").trim())
        .filter(Boolean);
    const selectedTreatments = (selected?.treatments || [])
        .map((name) => String(name || "").trim())
        .filter(Boolean);

    if (configuredTasks.length > 0) {
        const payloads = configuredTasks.flatMap((taskTemplate) => {
            const hasTreatmentToken = taskTemplate.includes("{treatment}");
            const treatmentTargets = hasTreatmentToken && selectedTreatments.length > 0
                ? selectedTreatments
                : [""];

            return treatmentTargets
                .map((targetTreatment) => {
                    const content = buildQuickTodoContent(todoLabelBase, taskTemplate, {
                        round: selected?.round || 1,
                        treatment: targetTreatment || selectedTreatments[0] || option.ticketName,
                    }).trim();
                    const procedureName =
                        configuredProcedure ||
                        targetTreatment ||
                        String(taskTemplate || "").replaceAll("{treatment}", "").trim() ||
                        option.ticketName;
                    return {
                        content,
                        meta: {
                            sourceType: "auto_quick_reception",
                            sourceTicketId,
                            procedureName,
                            procedureKey: normalizeTodoProcedureKey(procedureName),
                        },
                    };
                })
                .filter((payload) => Boolean(payload.content));
        });

        if (payloads.length > 0) return payloads;
    }

    if (selected && selected.treatments.length > 0) {
        return selected.treatments
            .map((treatment) => {
                const content = buildQuickTodoContent(todoLabelBase, option.autoTodoTemplate, {
                    round: selected.round,
                    treatment,
                }).trim();
                const procedureName = configuredProcedure || String(treatment || "").trim() || option.ticketName;
                return {
                    content,
                    meta: {
                        sourceType: "auto_quick_reception",
                        sourceTicketId,
                        procedureName,
                        procedureKey: normalizeTodoProcedureKey(procedureName),
                    },
                };
            })
            .filter((payload) => Boolean(payload.content));
    }

    const single = buildQuickTodoContent(todoLabelBase, option.autoTodoTemplate).trim();
    if (!single) return [];

    const procedureName = configuredProcedure || option.ticketName;
    return [
        {
            content: single,
            meta: {
                sourceType: "auto_quick_reception",
                sourceTicketId,
                procedureName,
                procedureKey: normalizeTodoProcedureKey(procedureName),
            },
        },
    ];
}

export function IntegratedView() {
    const { dateISO, setDateISO } = useScheduleStore();
    const isMobile = useMediaQuery("(max-width: 767px)");
    type MobileCol = "reservation" | "reception" | "complete";
    const [mobileCol, setMobileCol] = useState<MobileCol>("reservation");
    // Derived state for calendar view (default to selected date's month)
    const [viewDate, setViewDate] = useState(() => new Date(dateISO));

    useEffect(() => {
        setViewDate(new Date(dateISO));
    }, [dateISO]);

    useEffect(() => {
        // Mobile에서는 한 번에 한 컬럼만 꽉 차게 보여주기 위해, 날짜가 바뀌면 기본 탭을 '예약'으로 리셋합니다.
        if (!isMobile) return;
        setMobileCol("reservation");
    }, [dateISO, isMobile]);

    const { tasks, fetchTasks, addTask, toggleTask, deleteTask } = useHospitalTaskStore();
    const { patients, movePatient, setPatients } = useChartStore();

    const [newTaskContent, setNewTaskContent] = useState("");
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [chartTodosByPatient, setChartTodosByPatient] = useState<Record<number, TodoItem[]>>({});
    const [quickQueueByProcedure, setQuickQueueByProcedure] = useState<Record<string, ProcedureQueueSummary>>({});
    const [todoAssignableMembers, setTodoAssignableMembers] = useState<Array<{ id: string; name: string; jobTitleName?: string }>>([]);
    const currentUserName = useAuthStore((s) => s.userName);
    const currentUserEmail = useAuthStore((s) => s.userEmail);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskContent.trim()) return;

        await addTask({
            content: newTaskContent,
            completed: false,
            author: (currentUserName || "").trim() || undefined
        }, dateISO);

        setNewTaskContent("");
        setIsAddingTask(false);
    };

    // Fetch tasks when dateISO changes
    useEffect(() => {
        void fetchTasks(dateISO);
    }, [dateISO, fetchTasks]);

    // Fetch today's appointments from backend
    const { settings } = useSettingsStore();
    const fetchPatients = useChartStore(s => s.fetchPatients);

    const completionStatusIds = useMemo(() => {
        const ids = new Set<string>(["done", "completed"]);
        for (const s of settings.chartConfig?.statuses || []) {
            if (s.enabled && s.isCompletionStatus) ids.add(s.id);
        }
        return ids;
    }, [settings.chartConfig?.statuses]);

    const loadAppointments = useCallback(async () => {
        const branchId = resolveActiveBranchId();
        if (!branchId) return;
        await fetchPatients(dateISO, branchId, completionStatusIds);
        void fetchTasks(dateISO);

        try {
            const numericBranchId = Number(branchId);
            const [receptionData, members, jobTitles, todoStats] = await Promise.all([
                visitService.getVisitsByDate(dateISO, branchId),
                (Number.isFinite(numericBranchId) && numericBranchId > 0
                    ? memberConfigService.getMembers(numericBranchId)
                    : Promise.resolve([] as any[])
                ).catch(() => [] as any[]),
                memberConfigService.getJobTitles().catch(() => [] as any[]),
                procedureTodoStatsService
                    .getDashboard({
                        branchId,
                        fromDateISO: dateISO,
                        toDateISO: dateISO,
                    })
                    .catch(() => null as any)
            ]);
            const byPatient: Record<number, TodoItem[]> = {};
            for (const visit of (receptionData || [])) {
                const customerId = Number((visit as any).customerId || 0);
                if (customerId <= 0) continue;
                const procedures = (visit as any).procedures || [];
                if (procedures.length === 0) continue;
                byPatient[customerId] = procedures.map((p: any) => {
                    const todoStatus = p.status === "done" ? "done" : p.status === "doing" ? "doing" : "todo";
                    return {
                        id: p.id,
                        customerId,
                        content: p.name || "",
                        status: todoStatus,
                        isCompleted: p.status === "done",
                        sourceType: p.sourceType,
                        procedureName: p.name,
                        startedAt: p.startTime,
                        startedBy: p.managedByUserName,
                        completedAt: p.endTime,
                        completedBy: p.managedByUserName,
                        assignee: todoStatus === "todo" ? "" : p.managedByUserName,
                        creator: p.managedByUserName || "",
                        createdAt: p.registerTime || "",
                    };
                });
            }
            setChartTodosByPatient(byPatient);
            const procedureDurationOverrides = buildProcedureDurationOverrideMap(settings.tickets?.items || []);
            let capacityMap: Record<string, number> = {};
            try {
                const cats = await categoryTicketDefService.getAll();
                cats.forEach(c => {
                    if (c.equipmentCount > 1) {
                        capacityMap[normalizeQueueProcedureKey(c.name)] = c.equipmentCount;
                    }
                });
            } catch {}
            setQuickQueueByProcedure(
                buildProcedureQueueMap(todoStats?.byProcedure || [], {
                    averageByProcedureKey: procedureDurationOverrides,
                    capacityByProcedureKey: capacityMap,
                })
            );

            const allowedJobIds = settings.chartConfig?.statusRules?.todoPerformerJobTitleIds || [];
            const jobTitleMap = new Map<string, string>(
                (jobTitles || []).map((j: any) => [String(j.id), String(j.name || "")])
            );
            const filtered = (members || []).filter((m: any) => {
                if (m?.isApproved === false) return false;
                const jobId = String(m?.jobTitleId || "");
                const jobName = String(jobTitleMap.get(jobId) || "");
                if (allowedJobIds.length > 0) {
                    return jobId && allowedJobIds.includes(jobId);
                }
                // Fallback default: exclude coordinators when no explicit config is set
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
        } catch (e) {
            console.error("Failed to load chart todos:", e);
            setQuickQueueByProcedure({});
        }
    }, [dateISO, fetchPatients, fetchTasks, completionStatusIds, settings.activeBranchId, settings.chartConfig?.statusRules?.todoPerformerJobTitleIds, settings.tickets?.items]);

    useEffect(() => {
        loadAppointments();
        // Reduced to 30 seconds as SignalR handles real-time updates
        const intervalId = setInterval(loadAppointments, 30000);
        return () => clearInterval(intervalId);
    }, [loadAppointments]);

    useChartSignalR({
        onVisitCreated: () => {
            loadAppointments();
        },
        onVisitUpdated: () => {
            loadAppointments();
        },
        onVisitDeleted: () => {
            loadAppointments();
        },
        onRefreshRequired: () => {
            loadAppointments();
        },
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
    const [isTaskOpen, setIsTaskOpen] = useState(true);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [pendingMove, setPendingMove] = useState<{ patientId: number, targetLocation: string } | null>(null);
    const [pendingRollback, setPendingRollback] = useState<Patient | null>(null);
    const [selectedReceptionPatient, setSelectedReceptionPatient] = useState<Patient | null>(null);
    const pendingReceptionDataRef = useRef<any>(null);
    const rollbackBusyRef = useRef(false);
    const [cycleOverrideConfirm, setCycleOverrideConfirm] = useState<{ option: QuickTicketOption; reason: string } | null>(null);
    const [printPreviewByPatient, setPrintPreviewByPatient] = useState<Record<number, string>>({});
    const [receptionEditMode, setReceptionEditMode] = useState(false);
    const [selectedNewPatient, setSelectedNewPatient] = useState<Patient | null>(null);
    const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
    const [reservationCancelTarget, setReservationCancelTarget] = useState<Patient | null>(null);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOption, setSortOption] = useState<'completedTime' | 'checkInTime' | 'name'>('completedTime');
    const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
    const [completeSortDir, setCompleteSortDir] = useState<'asc' | 'desc'>('desc');

    const [receptionSortOption, setReceptionSortOption] = useState<'checkInTime' | 'status' | 'name'>('checkInTime');
    const [isReceptionSortDropdownOpen, setIsReceptionSortDropdownOpen] = useState(false);
    const [receptionSortDir, setReceptionSortDir] = useState<'asc' | 'desc'>('asc');

    const [reservationSortOption, setReservationSortOption] = useState<'time' | 'doctor' | 'category' | 'name'>('time');
    const [isReservationSortDropdownOpen, setIsReservationSortDropdownOpen] = useState(false);
    const [reservationSortDir, setReservationSortDir] = useState<'asc' | 'desc'>('asc');

    const navigate = useNavigate();

    // Force re-render periodically for timers in WaitCard (optional, but good for badges)
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(timer);
    }, []);

    const [hoveredCard, setHoveredCard] = useState<{ id: number, data: Patient, rect: DOMRect, anchorEl: HTMLDivElement } | null>(null);
    const [hoverTicketsByPatient, setHoverTicketsByPatient] = useState<Record<number, HoverTicketSummary[]>>({});
    const [hoverTicketLoadingPatientId, setHoverTicketLoadingPatientId] = useState<number | null>(null);
    const [hoverKeyRecordsByPatient, setHoverKeyRecordsByPatient] = useState<Record<number, HoverKeyRecordSummary[]>>({});
    const [hoverKeyRecordLoadingPatientId, setHoverKeyRecordLoadingPatientId] = useState<number | null>(null);
    const hoverOverlayRef = useRef<HTMLDivElement | null>(null);
    const [hoverOverlayStyle, setHoverOverlayStyle] = useState<{ top: number; left: number; width: number; minHeight: number } | null>(null);
    const [quickPhaseByPatient, setQuickPhaseByPatient] = useState<Record<number, QuickActionPhase>>({});
    const [quickPendingAction, setQuickPendingAction] = useState<QuickReceptionAction | null>(null);
    const [quickTicketPicker, setQuickTicketPicker] = useState<QuickTicketPickerState | null>(null);
    const [quickPackagePicker, setQuickPackagePicker] = useState<QuickPackagePickerState | null>(null);
    const [quickException, setQuickException] = useState<{ patient: Patient; reasons: string[] } | null>(null);
    const [quickNow, setQuickNow] = useState(Date.now());
    const quickPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadHoverTickets = async (patient: Patient) => {
        const customerId = Number(patient.patientId || patient.id);
        if (!Number.isFinite(customerId) || customerId <= 0) return;
        if (Object.prototype.hasOwnProperty.call(hoverTicketsByPatient, customerId)) return;
        if (hoverTicketLoadingPatientId === customerId) return;

        setHoverTicketLoadingPatientId(customerId);
        try {
            const tickets = await ticketService.getTickets(customerId);
            const plannedTicketIdKeys = new Set(
                getPlannedTicketIds(patient).map(normalizeTicketKey).filter(Boolean)
            );
            const plannedTicketNameKeys = new Set(
                getPlannedTicketNames(patient).map(normalizeTicketKey).filter(Boolean)
            );
            const mapped: HoverTicketSummary[] = (tickets || [])
                .filter((ticket) => (ticket as any)?.isActive !== false)
                .map((ticket) => {
                    const ticketDef = (settings.tickets?.items || []).find((def: any) =>
                        normalizeTicketKey(def?.id) === normalizeTicketKey((ticket as any)?.itemId) ||
                        normalizeTicketKey(def?.code) === normalizeTicketKey((ticket as any)?.itemId) ||
                        normalizeTicketKey(def?.name) === normalizeTicketKey((ticket as any)?.itemName)
                    );
                    const usageUnit = normalizeTicketKey(
                        (ticket as any)?.itemType || ticketDef?.usageUnit || ""
                    );
                    const isPeriod = usageUnit === "period";
                    const requiresIntervalCheck = usageUnit === "period" || usageUnit === "package";
                    const minIntervalDays = toPositiveInt(
                        (ticket as any)?.minIntervalDays ?? ticketDef?.minIntervalDays ?? 0
                    );
                    const lastUsedRaw = (ticket as any)?.lastUsedAt || (ticket as any)?.lastUsedDate;

                    let cycleBlocked = false;
                    let cycleBlockReason: string | undefined;
                    let nextAvailableAt: string | undefined;

                    const weekTicketName = (ticket as any).weekTicketName || (ticket as any).snapshotWeekTicketName || ticketDef?.weekTicketName;
                    const availableDayValue = Number((ticket as any).availableDayValue ?? (ticket as any).snapshotAvailableDayValue ?? ticketDef?.availableDayValue ?? 0);
                    if (weekTicketName && availableDayValue > 0) {
                        const todayDow = new Date().getDay();
                        const dayBit = 1 << todayDow;
                        if ((availableDayValue & dayBit) === 0) {
                            const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
                            const allowedDays = dayNames.filter((_, i) => (availableDayValue & (1 << i)) !== 0).join(", ");
                            cycleBlocked = true;
                            cycleBlockReason = `요일권 제한: 오늘(${dayNames[todayDow]})은 사용 불가 (사용 가능: ${allowedDays})`;
                        }
                    }

                    if (!cycleBlocked && minIntervalDays > 0 && lastUsedRaw) {
                        const lastUsedDate = new Date(lastUsedRaw);
                        if (!Number.isNaN(lastUsedDate.getTime())) {
                            const nextDate = new Date(lastUsedDate);
                            nextDate.setDate(nextDate.getDate() + minIntervalDays);
                            if (Date.now() < nextDate.getTime()) {
                                cycleBlocked = true;
                                nextAvailableAt = format(nextDate, "yyyy-MM-dd HH:mm");
                                cycleBlockReason = `주기 제한 · ${nextAvailableAt} 이후 가능`;
                            }
                        }
                    }

                    const ticketId = String((ticket as any)?.id ?? (ticket as any)?.itemId ?? "");
                    const ticketName = String((ticket as any)?.itemName || "시술권");
                    const ticketIdKey = normalizeTicketKey(ticketId);
                    const ticketNameKey = normalizeTicketKey(ticketName);
                    const isReserved =
                        plannedTicketIdKeys.has(ticketIdKey) ||
                        plannedTicketNameKeys.has(ticketNameKey);

                    return {
                        ticketId,
                        ticketName,
                        remaining: toPositiveInt((ticket as any)?.remainingCount ?? (ticket as any)?.quantity),
                        isPeriod,
                        isReserved,
                        cycleBlocked,
                        cycleBlockReason,
                        nextAvailableAt,
                    };
                })
                .filter((ticket) => ticket.remaining > 0)
                .sort((a, b) => {
                    if (Number(a.isReserved) !== Number(b.isReserved)) return Number(b.isReserved) - Number(a.isReserved);
                    if (a.cycleBlocked !== b.cycleBlocked) return a.cycleBlocked ? 1 : -1;
                    if (a.remaining !== b.remaining) return b.remaining - a.remaining;
                    return a.ticketName.localeCompare(b.ticketName, "ko-KR");
                });

            setHoverTicketsByPatient((prev) => ({ ...prev, [customerId]: mapped }));
        } catch (error) {
            console.error("failed to load hover ticket summary", error);
            setHoverTicketsByPatient((prev) => ({ ...prev, [customerId]: [] }));
        } finally {
            setHoverTicketLoadingPatientId((current) => (current === customerId ? null : current));
        }
    };

    const loadHoverKeyRecords = async (patient: Patient) => {
        const customerId = Number(patient.patientId || patient.id);
        if (!Number.isFinite(customerId) || customerId <= 0) return;
        if (Object.prototype.hasOwnProperty.call(hoverKeyRecordsByPatient, customerId)) return;
        if (hoverKeyRecordLoadingPatientId === customerId) return;

        setHoverKeyRecordLoadingPatientId(customerId);
        try {
            const records = await patientRecordService.getByPatientId(customerId);
            const mapped: HoverKeyRecordSummary[] = (records || [])
                .filter((record: any) => Boolean(record?.isPinned) && String(record?.content || "").trim().length > 0)
                .sort((a: any, b: any) => {
                    const timeA = new Date(String(a?.createdAt || 0)).getTime();
                    const timeB = new Date(String(b?.createdAt || 0)).getTime();
                    return timeB - timeA;
                })
                .slice(0, 3)
                .map((record: any) => ({
                    id: Number(record?.id || 0),
                    content: String(record?.content || "").trim(),
                    createdAt: record?.createdAt ? String(record.createdAt) : undefined,
                    createdByName: record?.createdByName ? String(record.createdByName) : undefined,
                }));
            setHoverKeyRecordsByPatient((prev) => ({ ...prev, [customerId]: mapped }));
        } catch (error) {
            console.error("failed to load hover key records", error);
            setHoverKeyRecordsByPatient((prev) => ({ ...prev, [customerId]: [] }));
        } finally {
            setHoverKeyRecordLoadingPatientId((current) => (current === customerId ? null : current));
        }
    };

    const resolvePrintMemoSections = useCallback(() => {
        const raw = settings.chartConfig?.memoSections;
        const sections = (raw && raw.length > 0)
            ? raw.filter((m: any) => m.enabled).sort((a: any, b: any) => a.order - b.order)
            : [
                { id: "chart1", label: "관리", enabled: true, order: 1 },
                { id: "chart2", label: "원장상담", enabled: true, order: 2 },
                { id: "chart3", label: "실장상담", enabled: true, order: 3 },
            ];
        const fieldMap: Record<string, string> = {};
        sections.forEach((s: any, idx: number) => { fieldMap[s.id] = `chart${idx + 1}`; });
        return { sections, fieldMap };
    }, [settings.chartConfig?.memoSections]);

    const resolveChartValue = (visit: any, sectionId: string, chartField: string) => {
        return String(
            (visit as any)?.[chartField]
            || (visit?.consultation as any)?.[chartField]
            || (visit as any)?.[sectionId]
            || (visit?.consultation as any)?.[sectionId]
            || ""
        ).trim();
    };

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

            if (!todayVisit) {
                setPrintPreviewByPatient((prev) => ({ ...prev, [customerId]: "당일 내원 기록 없음" }));
                return;
            }

            const pc = settings.chartConfig?.printConfig || [];
            const isPrintEnabled = (key: string) => {
                const found = pc.find((item: any) => item.key === key);
                return found ? found.enabled : true;
            };

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
                let todos: TodoItem[] = [];
                try {
                    const chartTodos = await procedureService.getByCustomer(customerId, todayVisit.id);
                    todos = (chartTodos || []).map((t: any) => ({
                        id: t.id, content: t.name || t.content || "", isCompleted: t.status === "done",
                        customerId, status: t.status, createdAt: t.createdAt || "",
                    }));
                } catch { /* ignore */ }
                if (todos.length === 0) {
                    todos = chartTodosByPatient[customerId] || [];
                }
                if (todos.length > 0) {
                    const todoPreview = todos.slice(0, 3).map((t) => `${t.isCompleted ? "✓" : "○"} ${t.content}`).join(", ");
                    lines.push(`[할일 ${todos.length}건] ${todoPreview.substring(0, 60)}${todoPreview.length > 60 ? "..." : ""}`);
                }
            }

            if (lines.length === 1) lines.push("인쇄할 차트 내용 없음");
            setPrintPreviewByPatient((prev) => ({ ...prev, [customerId]: lines.join("\n") }));
        } catch {
            setPrintPreviewByPatient((prev) => ({ ...prev, [customerId]: "미리보기 로드 실패" }));
        }
    };

    const handleCardHover = (event: React.MouseEvent<HTMLDivElement>, data: Patient) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setHoveredCard({ id: data.id, data, rect, anchorEl: event.currentTarget });
        void loadHoverTickets(data);
        void loadHoverKeyRecords(data);
        void loadPrintPreview(data);
    };

    const handleCardLeave = () => {
        setHoveredCard(null);
        setHoverOverlayStyle(null);
    };

    const handlePrintPatientChart = useCallback(async (patient: Patient) => {
        const customerId = Number(patient.patientId || 0);
        if (!Number.isFinite(customerId) || customerId <= 0) return;

        try {
            const visitHistory = await visitService.getVisitHistory(customerId);
            const todayStr = format(new Date(), "yyyy-MM-dd");
            const todayVisit = (visitHistory || []).find((v: any) => {
                const vDate = v.scheduledAt || v.registerTime || v.createTime;
                return vDate && format(new Date(vDate), "yyyy-MM-dd") === todayStr;
            });

            if (!todayVisit) {
                setAlertMessage("당일 내원 기록이 없어 인쇄할 수 없습니다.");
                return;
            }

            const pc = settings.chartConfig?.printConfig || [];
            const isPrintEnabled = (key: string) => {
                const found = pc.find((item: any) => item.key === key);
                return found ? found.enabled : true;
            };

            const { sections: memoSecs, fieldMap } = resolvePrintMemoSections();

            const sections: PrintSection[] = [];

            for (const section of memoSecs) {
                if (!isPrintEnabled(section.id)) continue;
                const chartField = fieldMap[section.id] || section.id;
                const value = resolveChartValue(todayVisit, section.id, chartField);
                if (value) {
                    sections.push({ label: (section as any).label, content: value });
                }
            }

            if (isPrintEnabled("medicalRecord")) {
                const mr = String((todayVisit as any)?.medicalRecord || "").trim();
                if (mr) sections.push({ label: "진료기록", content: mr });
            }

            if (isPrintEnabled("todo")) {
                let todos: { content: string; isCompleted: boolean }[] = [];
                try {
                    const chartTodos = await procedureService.getByCustomer(customerId, todayVisit.id);
                    todos = (chartTodos || []).map((t: any) => ({
                        content: t.name || t.content || "",
                        isCompleted: t.status === "done",
                    }));
                } catch { /* ignore */ }
                if (todos.length === 0) {
                    todos = (chartTodosByPatient[customerId] || []).map((t) => ({
                        content: t.content, isCompleted: t.isCompleted,
                    }));
                }
                if (todos.length > 0) {
                    const todoLines = todos.map((t) => `${t.isCompleted ? "✓" : "○"} ${t.content}`).join("\n");
                    sections.push({ label: "할일", content: todoLines });
                }
            }

            if (sections.length === 0) {
                setAlertMessage("인쇄할 차트 내용이 없습니다.");
                return;
            }

            const rawBirth = (todayVisit as any)?.customerBirthDate
                || (patient as any)?.birthDate
                || (patient as any)?.customerBirthDate
                || "";
            const birthDisplay = rawBirth ? String(rawBirth).substring(0, 10) : "";
            const patientAge = patient.age || (rawBirth ? differenceInYears(new Date(), new Date(rawBirth)) : "");
            const birthWithAge = birthDisplay && patientAge !== ""
                ? `${birthDisplay} (${patientAge}세)`
                : birthDisplay || undefined;
            const visitDate = format(new Date(todayVisit.scheduledAt || todayVisit.registerTime || todayVisit.createTime), "yyyy-MM-dd HH:mm:ss");

            const staffParts: string[] = [];
            if (isPrintEnabled("counselor") && (todayVisit as any)?.counselorName) staffParts.push(`상담:${(todayVisit as any).counselorName}`);
            if (isPrintEnabled("doctorCounselor") && (todayVisit as any)?.doctorCounselorName) staffParts.push(`원장상담:${(todayVisit as any).doctorCounselorName}`);

            await printService.printChart({
                header: staffParts.length > 0 ? staffParts.join("  ") : undefined,
                patientName: patient.name,
                chartNo: (patient as any).chartNo || String(patient.id),
                birthDate: birthWithAge,
                gender: patient.gender,
                visitDate,
                doctor: isPrintEnabled("doctor") && (todayVisit as any)?.doctorName ? (todayVisit as any).doctorName : undefined,
                sections,
            });
        } catch (error) {
            console.error("failed to print chart", error);
            setAlertMessage("인쇄 중 오류가 발생했습니다.");
        }
    }, [settings.chartConfig]);

    const setQuickPhase = useCallback((visitId: number, phase?: QuickActionPhase) => {
        setQuickPhaseByPatient((prev) => {
            const next = { ...prev };
            if (phase) next[visitId] = phase;
            else delete next[visitId];
            return next;
        });
    }, []);

    const clearQuickPendingTimer = useCallback(() => {
        if (quickPendingTimerRef.current) {
            clearTimeout(quickPendingTimerRef.current);
            quickPendingTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            clearQuickPendingTimer();
        };
    }, [clearQuickPendingTimer]);

    useEffect(() => {
        if (!quickPendingAction) return;
        const timer = setInterval(() => setQuickNow(Date.now()), 200);
        return () => clearInterval(timer);
    }, [quickPendingAction]);

    const getRoomLabel = useCallback(
        (roomId: string) => {
            const waitList = (settings.chartConfig?.waitLists || []).find((w) => (w.id || w.label) === roomId);
            return waitList?.label || roomId;
        },
        [settings.chartConfig?.waitLists]
    );

    const resolveInitialReceptionRoomId = useCallback(() => {
        const waitLists = settings.chartConfig?.waitLists || [];
        const initial = waitLists.find((w) => w.enabled && w.isInitialReception);
        if (initial) return initial.id;
        const firstEnabled = waitLists.filter((w) => w.enabled).sort((a, b) => a.order - b.order)[0];
        return firstEnabled?.id || "main_wait";
    }, [settings.chartConfig?.waitLists]);

    const resolveCompletionRoomId = useCallback(() => {
        const waitLists = settings.chartConfig?.waitLists || [];
        const completion = waitLists.find((w) => w.enabled && w.isCompletionLocation);
        if (completion) return completion.id;
        return "done";
    }, [settings.chartConfig?.waitLists]);

    const resolveFastTrackRoomId = useCallback(
        (patient: Patient) => {
            const plannedText = getPlannedSummary(patient).join(" ").toLowerCase();
            const enabledRoomIds = (settings.chartConfig?.waitLists || [])
                .filter((w) => w.enabled)
                .map((w) => w.id || w.label);
            const fallbackRoomId = resolveInitialReceptionRoomId();

            const priorities = /제모/.test(plannedText)
                ? ["hair_removal", "proc_1", "proc_2", "treatment_1", "treatment_3", "care_1", "care_2", fallbackRoomId]
                : ["proc_1", "proc_2", "treatment_1", "treatment_3", "care_1", "care_2", fallbackRoomId, "hair_removal"];

            return priorities.find((roomId) => enabledRoomIds.includes(roomId)) || patient.location || fallbackRoomId;
        },
        [settings.chartConfig?.waitLists, resolveInitialReceptionRoomId]
    );

    const resolveNextStatus = useCallback(
        (
            actionType: "drag_move" | "reception_confirm" | "quick_reception" | "send" | "start_progress" | "tablet_reception",
            fromLocationId?: string | null,
            toLocationId?: string | null,
            currentStatus?: string | null
        ) => {
            return resolveTransitionStatus({
                actionType,
                fromLocationId,
                toLocationId,
                currentStatus,
                statusRules: settings.chartConfig?.statusRules,
                statuses: settings.chartConfig?.statuses,
            });
        },
        [settings.chartConfig?.statusRules, settings.chartConfig?.statuses]
    );

    const isDoneLocation = useCallback((locationId?: string | null) => {
        const normalized = String(locationId || "").trim().toLowerCase();
        if (normalized === "done" || normalized === "go_home") return true;
        const completionId = resolveCompletionRoomId();
        return completionId !== "done" && locationId === completionId;
    }, [resolveCompletionRoomId]);

    const isReservationPatient = useCallback((patient: Patient) => {
        const status = String(patient.status || "").trim().toLowerCase();
        return patient.location === "reservation" || status === "reserved" || status === "scheduled";
    }, []);


    const isCompletedPatient = useCallback(
        (patient: Patient) => {
            const status = String(patient.status || "").trim().toLowerCase();
            return status === "done" || status === "completed" || completionStatusIds.has(patient.status || "") || isDoneLocation(patient.location);
        },
        [isDoneLocation, completionStatusIds]
    );

    const resolveActorDisplayName = useCallback(() => {
        const rawName = String(currentUserName || "").trim();
        const rawEmail = String(currentUserEmail || "").trim().toLowerCase();

        if (rawName && !isEmailLike(rawName)) return rawName;

        const candidateEmail = rawEmail || (isEmailLike(rawName) ? rawName.toLowerCase() : "");
        if (candidateEmail) {
            const member = (settings.members?.users || []).find(
                (user) => String(user?.email || "").trim().toLowerCase() === candidateEmail
            );
            if (member?.name) return String(member.name).trim();
            const localPart = candidateEmail.split("@")[0]?.trim();
            if (localPart) return localPart;
        }

        return rawName || "system";
    }, [currentUserEmail, currentUserName, settings.members?.users]);

    const getSpecialFlagReasons = useCallback((patient: Patient) => {
        const merged = `${patient.memo || ""} ${(patient.tags || []).join(" ")}`.toLowerCase();
        const reasons: string[] = [];
        if (SIDE_EFFECT_KEYWORDS.some((keyword) => merged.includes(keyword))) {
            reasons.push("부작용/주의 플래그 확인 필요");
        }
        if (COMPLAINT_KEYWORDS.some((keyword) => merged.includes(keyword))) {
            reasons.push("민원/클레임 플래그 확인 필요");
        }
        if (UNPAID_KEYWORDS.some((keyword) => merged.includes(keyword))) {
            reasons.push("미수금/수납 상태 확인 필요");
        }
        return reasons;
    }, []);

    const buildQuickTicketOption = useCallback(
        (
            ticket: CartItem,
            plannedTicketIdKeys: Set<string>,
            plannedTicketNameKeys: Set<string>
        ): QuickTicketOption | null => {
            const ticketId = String(ticket.id || "");
            if (!ticketId) return null;

            const ticketName = String(ticket.itemName || "시술권");
            const ticketDef = (settings.tickets?.items || []).find((def: any) =>
                normalizeTicketKey(def?.id) === normalizeTicketKey(ticket.itemId) ||
                normalizeTicketKey(def?.code) === normalizeTicketKey(ticket.itemId) ||
                normalizeTicketKey(def?.name) === normalizeTicketKey(ticket.itemName)
            );

            const usageUnit = normalizeTicketKey(
                (ticket as any).itemType || ticketDef?.usageUnit || ""
            );
            const isPeriod = usageUnit === "period";
            const isPackage = usageUnit === "package";
            const isInactive = (ticket as any).isActive === false;
            const expiryRaw = (ticket as any).expiryDate;

            const minIntervalDays = toPositiveInt(
                (ticket as any).minIntervalDays ?? ticketDef?.minIntervalDays ?? 0
            );
            const lastUsedRaw = (ticket as any).lastUsedAt || (ticket as any).lastUsedDate;

            let nextAvailableAt: string | undefined;
            let cycleBlocked = false;
            let cycleBlockReason: string | undefined;
            if (isInactive) {
                cycleBlocked = true;
                cycleBlockReason = "비활성 시술권으로 차감할 수 없습니다.";
            }
            if (!cycleBlocked && expiryRaw) {
                const expiryDate = new Date(expiryRaw);
                if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
                    cycleBlocked = true;
                    cycleBlockReason = `만료된 시술권입니다. (만료일 ${format(expiryDate, "yyyy-MM-dd")})`;
                }
            }
            if (!cycleBlocked) {
                const weekTicketName = (ticket as any).weekTicketName || (ticket as any).snapshotWeekTicketName || ticketDef?.weekTicketName;
                const availableDayValue = Number((ticket as any).availableDayValue ?? (ticket as any).snapshotAvailableDayValue ?? ticketDef?.availableDayValue ?? 0);
                if (weekTicketName && availableDayValue > 0) {
                    const todayDow = new Date().getDay();
                    const dayBit = 1 << todayDow;
                    if ((availableDayValue & dayBit) === 0) {
                        const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
                        const allowedDays = dayNames.filter((_, i) => (availableDayValue & (1 << i)) !== 0).join(", ");
                        cycleBlocked = true;
                        cycleBlockReason = `요일권 제한: 오늘(${dayNames[todayDow]})은 사용 불가 (사용 가능: ${allowedDays})`;
                    }
                }
            }
            if (!cycleBlocked && minIntervalDays > 0 && lastUsedRaw) {
                const lastUsedDate = new Date(lastUsedRaw);
                if (!Number.isNaN(lastUsedDate.getTime())) {
                    const nextDate = new Date(lastUsedDate);
                    nextDate.setDate(nextDate.getDate() + minIntervalDays);
                    if (Date.now() < nextDate.getTime()) {
                        cycleBlocked = true;
                        nextAvailableAt = format(nextDate, "yyyy-MM-dd HH:mm");
                        cycleBlockReason = `주기 제한으로 ${nextAvailableAt} 이후 사용 가능`;
                    }
                }
            }

            const itemIdKey = normalizeTicketKey(ticket.itemId);
            const ticketIdKey = normalizeTicketKey(ticket.id);
            const ticketNameKey = normalizeTicketKey(ticket.itemName);
            const matchedPlanned =
                (plannedTicketIdKeys.size > 0 &&
                    (plannedTicketIdKeys.has(itemIdKey) || plannedTicketIdKeys.has(ticketIdKey))) ||
                (plannedTicketNameKeys.size > 0 && plannedTicketNameKeys.has(ticketNameKey));
            const autoTodoEnabled = ticketDef ? Boolean((ticketDef as any)?.autoTodoEnabled) : true;
            const autoTodoTemplate = String((ticketDef as any)?.autoTodoTitleTemplate || "").trim() || undefined;
            const autoTodoTasks = toStringArray((ticketDef as any)?.autoTodoTasks)
                .map((task) => String(task || "").trim())
                .filter(Boolean);
            const queueCategoryName = String(
                (ticketDef as any)?.queueCategoryName || (ticketDef as any)?.autoTodoProcedureName || ""
            ).trim() || undefined;
            const queueDurationMinutes = Math.max(0, Number((ticketDef as any)?.queueDurationMinutes || 0)) || undefined;
            const queueProcedureName = queueCategoryName || ticketName;
            const legacyProcedureName = ticketName;
            const queueSummary =
                resolveProcedureQueueSummary(quickQueueByProcedure, queueProcedureName) ||
                (queueCategoryName
                    ? resolveProcedureQueueSummary(quickQueueByProcedure, legacyProcedureName)
                    : null) ||
                undefined;
            const packageSelections = isPackage ? toPackageRoundSelections((ticketDef as any)?.rounds) : [];
            const defaultPackageRound = Math.max(1, toPositiveInt((ticket as any).usageCount || 0) + 1);

            return {
                ticketId,
                ticketName,
                remaining: toPositiveInt((ticket as any).remainingCount ?? ticket.quantity),
                isPeriod,
                isPackage,
                matchedPlanned,
                cycleBlocked,
                cycleBlockReason,
                nextAvailableAt,
                autoTodoEnabled,
                autoTodoTemplate,
                autoTodoTasks: autoTodoTasks.length > 0 ? autoTodoTasks : undefined,
                autoTodoProcedureName: undefined,
                queueCategoryName,
                queueDurationMinutes,
                queueTodoCount: queueSummary?.todoCount ?? 0,
                queueDoingCount: queueSummary?.doingCount ?? 0,
                queueEstimatedWaitMinutes: queueSummary?.estimatedWaitMinutes ?? 0,
                queueProcedureName: queueSummary?.procedureName || queueProcedureName,
                packageSelections: packageSelections.length > 0 ? packageSelections : undefined,
                defaultPackageRound: isPackage ? defaultPackageRound : undefined,
            };
        },
        [quickQueueByProcedure, settings.tickets?.items]
    );

    const runQuickReceptionAction = useCallback(
        async (action: QuickReceptionAction) => {
            setQuickPhase(action.patientVisitId, "running");
            try {
                const actorDisplayName = resolveActorDisplayName();
                const checkInAtIso = new Date().toISOString();
                const checkInLabel = format(new Date(checkInAtIso), "HH:mm");

                let visitId = action.patientVisitId;
                if (action.isReservation && action.receptionData && action.reservationPatient) {
                    const committed = await confirmReceptionForPatient(action.reservationPatient, action.receptionData, true);
                    pendingReceptionDataRef.current = null;
                    if (!committed) {
                        return;
                    }
                    visitId = committed.id;
                }

                await ticketService.useTicket(action.ticketId, action.isPeriod, {
                    usedRound: action.selectedPackageRound,
                    usedTreatments: action.selectedPackageTreatments,
                    allowCycleOverride: action.allowCycleOverride,
                    visitId,
                });
                if (action.extraTickets && action.extraTickets.length > 0) {
                    for (const extra of action.extraTickets) {
                        await ticketService.useTicket(extra.ticketId, extra.isPeriod, { visitId });
                    }
                }
                await visitService.updateVisit(visitId, {
                    room: action.targetRoomId,
                    status: action.targetStatus,
                    checkInAt: checkInAtIso,
                    isWalkIn: false,
                });

                let autoTodoCreated = false;
                let autoTodoCreatedCount = 0;
                const todoPayloads = (action.autoTodoPayloads || []).filter((payload) => {
                    return String(payload?.content || "").trim().length > 0;
                });
                if (todoPayloads.length > 0 && action.patientCustomerId > 0) {
                    const todoBranchId = resolveActiveBranchId();
                    if (todoBranchId) {
                        try {
                            for (const payload of todoPayloads) {
                                await procedureService.create(action.patientCustomerId, {
                                    chartId: visitId,
                                    content: payload.content,
                                    sourceType: payload.meta?.sourceType,
                                    sourceTicketId: payload.meta?.sourceTicketId ? Number(payload.meta.sourceTicketId) : undefined,
                                    procedureName: payload.meta?.procedureName,
                                    procedureKey: payload.meta?.procedureKey,
                                });
                                autoTodoCreated = true;
                                autoTodoCreatedCount += 1;
                            }
                        } catch (todoError) {
                            console.error("quick reception auto todo failed", todoError);
                        }
                    }
                }

                movePatient(visitId, action.targetRoomId, {
                    status: action.targetStatus,
                    checkInAt: checkInAtIso,
                    checkInTime: checkInLabel,
                    isWalkIn: false,
                });
                setSelectedReceptionPatient((prev) =>
                    prev && prev.id === visitId ? null : prev
                );

                setPrintPreviewByPatient((prev) => {
                    const next = { ...prev };
                    delete next[action.patientCustomerId];
                    return next;
                });

                setAlertMessage(
                    autoTodoCreated
                        ? `${action.patientName}님 빠른 차감/입실 및 자동 할일 ${autoTodoCreatedCount}건 생성이 완료되었습니다.`
                        : `${action.patientName}님 빠른 차감/입실 처리가 완료되었습니다.`
                );
                await loadAppointments();
            } catch (error: any) {
                console.error("quick reception action failed", error);
                const message =
                    error?.response?.data?.message ||
                    error?.response?.data ||
                    error?.message ||
                    "알 수 없는 오류";
                setAlertMessage(`빠른 차감/입실 실패: ${String(message)}`);
            } finally {
                setQuickPhase(action.patientVisitId, undefined);
                setQuickPendingAction((prev) =>
                    prev && prev.patientVisitId === action.patientVisitId ? null : prev
                );
                clearQuickPendingTimer();
            }
        },
        [clearQuickPendingTimer, dateISO, loadAppointments, movePatient, resolveActorDisplayName, setQuickPhase]
    );

    const queueQuickActionWithTicket = useCallback(
        (params: {
            patient: Patient;
            patientCustomerId: number;
            targetRoomId: string;
            targetStatus: string;
            option: QuickTicketOption;
            selectedPackage?: PackageRoundSelection;
            allowCycleOverride?: boolean;
            extraTickets?: QuickTicketOption[];
        }) => {
            const autoTodoPayloads = buildQuickTodoContents(params.option, params.selectedPackage);
            const extraTodoPayloads = (params.extraTickets || []).flatMap((t) => buildQuickTodoContents(t));
            const action: QuickReceptionAction = {
                patientVisitId: params.patient.id,
                patientCustomerId: params.patientCustomerId,
                patientName: params.patient.name,
                targetRoomId: params.targetRoomId,
                targetRoomLabel: getRoomLabel(params.targetRoomId),
                targetStatus: params.targetStatus,
                ticketId: params.option.ticketId,
                ticketName: params.option.ticketName,
                ticketBeforeRemaining: params.option.remaining,
                isPeriod: params.option.isPeriod,
                autoTodoPayloads: [...autoTodoPayloads, ...extraTodoPayloads],
                selectedPackageRound: params.selectedPackage?.round,
                selectedPackageTreatments: params.selectedPackage?.treatments,
                allowCycleOverride: params.allowCycleOverride,
                executeAt: Date.now(),
                isReservation: params.patient.location === 'reservation' || !!pendingReceptionDataRef.current,
                receptionData: pendingReceptionDataRef.current,
                reservationPatient: pendingReceptionDataRef.current ? params.patient : undefined,
                extraTickets: params.extraTickets,
            };

            clearQuickPendingTimer();
            setQuickPendingAction(null);
            void runQuickReceptionAction(action);
        },
        [clearQuickPendingTimer, getRoomLabel, runQuickReceptionAction, setQuickPhase]
    );

    const queueQuickReceptionAction = useCallback(
        async (patient: Patient) => {
            if (quickPendingAction && quickPendingAction.patientVisitId !== patient.id) {
                setAlertMessage("다른 환자의 원클릭 처리 대기 중입니다. 먼저 완료하거나 취소해 주세요.");
                return;
            }

            if (quickPhaseByPatient[patient.id]) return;
            setQuickPhase(patient.id, "checking");

            let queued = false;
            try {
                const customerId = Number(patient.patientId || 0);
                const reasons = getSpecialFlagReasons(patient);
                if (!Number.isFinite(customerId) || customerId <= 0) {
                    reasons.push("환자 식별 정보가 없어 자동 처리할 수 없습니다.");
                }

                const plannedText = getPlannedSummary(patient).join(" ");
                // 동의서 검증 Skip (백엔드 Consent API 미구현 상태)
                if (false && Number.isFinite(customerId) && customerId > 0) {
                    try {
                        const consentHistory = await consentService.getPatientHistory(customerId);
                        const latest = [...(consentHistory || [])].sort(
                            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                        )[0];
                        if (!latest) reasons.push("동의서 이력이 없습니다.");
                        else if (latest.status === "Expired") reasons.push("동의서가 만료되었습니다.");
                        else if (latest.status !== "Signed") reasons.push("동의서 서명이 완료되지 않았습니다.");
                    } catch (error) {
                        console.error("failed to load consent history", error);
                        reasons.push("동의서 상태 확인 실패");
                    }
                }

                if (reasons.length > 0) {
                    setQuickException({ patient, reasons });
                    return;
                }

                const plannedTicketIdKeys = new Set(
                    (patient.plannedTicketIds || []).map(normalizeTicketKey).filter(Boolean)
                );
                const plannedTicketNameKeys = new Set(
                    [
                        ...(patient.plannedTicketNames || []),
                        ...getPlannedSummary(patient),
                    ]
                        .map(normalizeTicketKey)
                        .filter(Boolean)
                );

                const ownedTickets = await ticketService.getTickets(customerId);
                const ticketOptions = (ownedTickets || [])
                    .map((ticket) => buildQuickTicketOption(ticket as CartItem, plannedTicketIdKeys, plannedTicketNameKeys))
                    .filter((option): option is QuickTicketOption => Boolean(option))
                    .filter((option) => option.remaining > 0)
                    .sort((a, b) => {
                        if (Number(a.matchedPlanned) !== Number(b.matchedPlanned)) {
                            return Number(b.matchedPlanned) - Number(a.matchedPlanned);
                        }
                        if (Number(a.cycleBlocked) !== Number(b.cycleBlocked)) {
                            return Number(a.cycleBlocked) - Number(b.cycleBlocked);
                        }
                        if (a.remaining !== b.remaining) {
                            return b.remaining - a.remaining;
                        }
                        return a.ticketName.localeCompare(b.ticketName, "ko-KR");
                    });

                if (ticketOptions.length === 0) {
                    setQuickException({ patient, reasons: ["잔여 횟수가 남은 시술권이 없습니다."] });
                    return;
                }

                const selectableOptions = ticketOptions.filter(
                    (option) => !option.cycleBlocked || canOverrideCycleBlock(option)
                );
                if (selectableOptions.length === 0) {
                    const earliest = ticketOptions
                        .map((option) => option.nextAvailableAt)
                        .filter((value): value is string => Boolean(value))
                        .sort()[0];
                    setQuickException({
                        patient,
                        reasons: [
                            earliest
                                ? `주기 제한으로 현재 사용 가능한 시술권이 없습니다. 다음 가능 시각: ${earliest}`
                                : "주기 제한으로 현재 사용 가능한 시술권이 없습니다.",
                        ],
                    });
                    return;
                }

                const targetRoomId = resolveFastTrackRoomId(patient);
                const targetStatus = resolveNextStatus(
                    "quick_reception",
                    patient.location,
                    targetRoomId,
                    patient.status
                );
                const pickerMessage = "차감할 시술권을 선택해 주세요.";

                setQuickTicketPicker({
                    patient,
                    patientCustomerId: customerId,
                    targetRoomId,
                    targetRoomLabel: getRoomLabel(targetRoomId),
                    targetStatus,
                    options: ticketOptions,
                    message: pickerMessage,
                    selectedIds: [],
                });
            } catch (error) {
                console.error("failed to queue quick reception action", error);
                setAlertMessage("빠른 차감/입실 준비 중 오류가 발생했습니다.");
            } finally {
                if (!queued) {
                    setQuickPhase(patient.id, undefined);
                }
            }
        },
        [
            buildQuickTicketOption,
            getRoomLabel,
            getSpecialFlagReasons,
            queueQuickActionWithTicket,
            quickPendingAction,
            quickPhaseByPatient,
            resolveFastTrackRoomId,
            resolveNextStatus,
            setQuickPhase,
        ]
    );

    const handleSelectQuickTicket = useCallback(
        (option: QuickTicketOption) => {
            if (!quickTicketPicker) return;
            if (option.remaining <= 0) return;

            const allowCycleOverride = canOverrideCycleBlock(option);
            if (option.cycleBlocked && !allowCycleOverride) return;

            if (
                quickPendingAction &&
                quickPendingAction.patientVisitId !== quickTicketPicker.patient.id
            ) {
                setAlertMessage("다른 환자의 원클릭 처리 대기 중입니다. 먼저 완료하거나 취소해 주세요.");
                return;
            }

            if (allowCycleOverride) {
                const reason = option.cycleBlockReason || "시술 주기가 아직 지나지 않았습니다.";
                setCycleOverrideConfirm({ option, reason });
                return;
            }

            if (option.isPackage && (option.packageSelections || []).length > 0) {
                const packageSelections = option.packageSelections || [];
                const preferredRound = option.defaultPackageRound || 1;
                const preferred =
                    packageSelections.find((item) => item.round === preferredRound) ||
                    packageSelections[0];
                if (preferred) {
                    setQuickPackagePicker({
                        patient: quickTicketPicker.patient,
                        patientCustomerId: quickTicketPicker.patientCustomerId,
                        targetRoomId: quickTicketPicker.targetRoomId,
                        targetRoomLabel: quickTicketPicker.targetRoomLabel,
                        targetStatus: quickTicketPicker.targetStatus,
                        option,
                        options: packageSelections,
                        selectedRoundKey: String(preferred.round),
                        selectedTreatments: [...preferred.treatments],
                        allowCycleOverride,
                    });
                    setQuickTicketPicker(null);
                    return;
                }
            }

            const payload = quickTicketPicker;
            setQuickTicketPicker(null);
            queueQuickActionWithTicket({
                patient: payload.patient,
                patientCustomerId: payload.patientCustomerId,
                targetRoomId: payload.targetRoomId,
                targetStatus: payload.targetStatus,
                option,
                allowCycleOverride,
            });
        },
        [quickPendingAction, quickTicketPicker, queueQuickActionWithTicket]
    );

    const moveQuickPackageTreatment = useCallback((index: number, dir: "up" | "down") => {
        setQuickPackagePicker((prev) => {
            if (!prev) return prev;
            const swapIndex = dir === "up" ? index - 1 : index + 1;
            if (swapIndex < 0 || swapIndex >= prev.selectedTreatments.length) return prev;

            const nextTreatments = [...prev.selectedTreatments];
            const temp = nextTreatments[index];
            nextTreatments[index] = nextTreatments[swapIndex]!;
            nextTreatments[swapIndex] = temp!;
            return {
                ...prev,
                selectedTreatments: nextTreatments,
            };
        });
    }, []);

    const handleUndoQuickReception = useCallback(() => {
        if (!quickPendingAction) return;
        clearQuickPendingTimer();
        setQuickPhase(quickPendingAction.patientVisitId, undefined);
        setAlertMessage(`${quickPendingAction.patientName}님 원클릭 처리 대기를 취소했습니다.`);
        setQuickPendingAction(null);
    }, [clearQuickPendingTimer, quickPendingAction, setQuickPhase]);

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
        } catch (e) {
            console.error("Failed to update todo status:", e);
            await loadAppointments();
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
        } catch (e) {
            console.error("Failed to update todo assignee:", e);
        }
    };

    // Calendar Logic
    const calendarTitle = format(viewDate, "yyyy.MM");
    const calendarDays = (() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const first = startOfMonth(viewDate);
        const last = endOfMonth(viewDate);
        const daysInMonth = getDate(last);
        const startDay = getDay(first); // 0 (Sun) to 6 (Sat)

        const cells: Array<number | null> = [];
        for (let i = 0; i < startDay; i++) cells.push(null);
        for (let i = 1; i <= daysInMonth; i++) cells.push(i);
        return cells;
    })();

    const handleDateClick = (day: number) => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth() + 1;
        const yyyy = year;
        const mm = String(month).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        setDateISO(`${yyyy}-${mm}-${dd}`);
    };

    const buildReservationDayGuardMessage = useCallback((reservedDateValue?: string) => {
        const todayISO = format(new Date(), "yyyy-MM-dd");
        const reservedDateISO = String(reservedDateValue || "").slice(0, 10) || dateISO;
        return `예약 접수는 예약 당일만 가능합니다. 예약일: ${reservedDateISO}, 오늘: ${todayISO}`;
    }, [dateISO]);

    const isSameAsToday = useCallback((reservedDateValue?: string) => {
        const todayISO = format(new Date(), "yyyy-MM-dd");
        const reservedDateISO = String(reservedDateValue || "").slice(0, 10);
        return reservedDateISO === todayISO;
    }, []);

    // DnD Handlers
    const handleDragStart = (e: React.DragEvent, patientId: number) => {
        e.dataTransfer.setData("patientId", patientId.toString());
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const resolveColumn = useCallback((patient: Patient) => {
        if (isReservationPatient(patient)) return 'reservation';
        if (isCompletedPatient(patient)) return 'done';
        return 'main_wait';
    }, [isReservationPatient, isCompletedPatient]);

    const resolveTargetColumn = useCallback((targetLocation: string) => {
        if (targetLocation === 'reservation') return 'reservation';
        if (isDoneLocation(targetLocation)) return 'done';
        return 'main_wait';
    }, [isDoneLocation]);

    const handleDrop = (e: React.DragEvent, targetLocation: string) => {
        e.preventDefault();
        const patientId = Number(e.dataTransfer.getData("patientId"));
        if (patientId) {
            const patient = patients.find(p => p.id === patientId);
            if (patient && resolveColumn(patient) === resolveTargetColumn(targetLocation)) return;
            if (patient && patient.location === targetLocation) return;

            // Check for completion constraint
            if (isDoneLocation(targetLocation) && patient) {
                const todos = chartTodosByPatient[(patient.patientId || patient.id) as number] || [];
                if (todos.length > 0) {
                    const allDone = todos.every(t => t.status === "done" || t.isCompleted);
                    if (!allDone) {
                        setAlertMessage("할일이 모두 완료되어야 완료 상태로 변경할 수 있습니다.");
                        return;
                    }
                }
            }

            const initialRoomId = resolveInitialReceptionRoomId();
            const isReceptionTarget = targetLocation === 'main_wait' || targetLocation === initialRoomId;

            if (patient && resolveColumn(patient) === 'main_wait' && targetLocation === 'reservation') {
                setPendingRollback(patient);
                return;
            }

            if (patient && isReservationPatient(patient) && isReceptionTarget) {
                if (!isSameAsToday(patient.visitDate || dateISO)) {
                    setAlertMessage(buildReservationDayGuardMessage(patient.visitDate || dateISO));
                    return;
                }
                if (patient.isTemporary) {
                    setSelectedNewPatient(patient);
                } else {
                    setSelectedReceptionPatient(patient);
                }
                return;
            }

            setPendingMove({ patientId, targetLocation });
        }
    };

    const handleMoveLocation = useCallback((patient: Patient, nextLocationId: string) => {
        if (patient.location === nextLocationId) return;
        const initialRoomId = resolveInitialReceptionRoomId();
        const isReceptionTarget = nextLocationId === 'main_wait' || nextLocationId === initialRoomId;
        if (isDoneLocation(nextLocationId)) {
            const todos = chartTodosByPatient[(patient.patientId || patient.id) as number] || [];
            if (todos.length > 0) {
                const allDone = todos.every(t => t.status === "done" || t.isCompleted);
                if (!allDone) {
                    setAlertMessage("할일이 모두 완료되어야 완료 상태로 변경할 수 있습니다.");
                    return;
                }
            }
        }
        if (resolveColumn(patient) === 'main_wait' && nextLocationId === 'reservation') {
            setPendingRollback(patient);
            return;
        }
        if (isReservationPatient(patient) && isReceptionTarget) {
            if (!isSameAsToday(patient.visitDate || dateISO)) {
                setAlertMessage(buildReservationDayGuardMessage(patient.visitDate || dateISO));
                return;
            }
            if (patient.isTemporary) {
                setSelectedNewPatient(patient);
            } else {
                setSelectedReceptionPatient(patient);
            }
            return;
        }
        setPendingMove({ patientId: patient.id, targetLocation: nextLocationId });
    }, [resolveColumn, resolveTargetColumn, isDoneLocation, isReservationPatient, resolveInitialReceptionRoomId, dateISO]);

    const confirmReceptionForPatient = useCallback(async (targetPatient: Patient, data: any, closeModal: boolean = true) => {
        if (!isSameAsToday(targetPatient.visitDate || dateISO)) {
            setAlertMessage(buildReservationDayGuardMessage(targetPatient.visitDate || dateISO));
            return null;
        }

        const checkInAtISO = new Date().toISOString();
        const checkInLabel = format(new Date(checkInAtISO), "HH:mm");
        const targetRoom = data.room || resolveInitialReceptionRoomId();
        const nextMemo = typeof data.memo === "string" ? data.memo : undefined;
        const nextDoctor = typeof data.doctor === "string" ? data.doctor.trim() : "";
        const nextVisitPurposeId = typeof data.visitPurposeId === "string" ? data.visitPurposeId.trim() : "";
        const targetStatus = resolveNextStatus(
            "reception_confirm",
            targetPatient.location,
            targetRoom,
            targetPatient.status
        );

        try {
            const branchId = resolveActiveBranchId();
            const receptionPayload: any = {
                customerId: targetPatient.patientId || targetPatient.id,
                branchId: Number(branchId),
                registerTime: checkInAtISO,
                status: targetStatus,
                room: targetRoom,
            };
            if (targetPatient.patientId) {
                receptionPayload.reservationId = targetPatient.id;
            }
            if (typeof nextMemo === "string") {
                receptionPayload.memo = nextMemo;
            }
            if (nextDoctor) {
                receptionPayload.doctorName = nextDoctor;
            }
            const allPurposeIds = Array.isArray(data.visitPurposeIds) && data.visitPurposeIds.length > 0
                ? data.visitPurposeIds.map((v: any) => String(v)).filter(Boolean)
                : (nextVisitPurposeId ? [nextVisitPurposeId] : []);
            if (allPurposeIds.length > 0) {
                receptionPayload.visitPurposeIds = allPurposeIds;
            }

            const createResult = await visitService.createVisit(receptionPayload);
            const newChartId = createResult?.chartId || createResult?.id;

            const nextPatient = {
                ...targetPatient,
                ...data,
                id: newChartId || targetPatient.id,
                memo: typeof nextMemo === "string" ? nextMemo : targetPatient.memo,
                doctor: nextDoctor || targetPatient.doctor,
                location: targetRoom,
                status: targetStatus,
                checkInAt: checkInAtISO,
                checkInTime: data.checkInTime || checkInLabel,
                isWalkIn: false
            } as Patient;

            movePatient(targetPatient.id, targetRoom, {
                ...data, // Merge modal data
                memo: typeof nextMemo === "string" ? nextMemo : targetPatient.memo,
                doctor: nextDoctor || targetPatient.doctor,
                status: targetStatus,
                checkInAt: checkInAtISO,
                checkInTime: data.checkInTime || checkInLabel,
                isWalkIn: false
            });

            if (closeModal) {
                setSelectedReceptionPatient((prev) =>
                    prev && prev.id === targetPatient.id ? null : prev
                );
            }
            return nextPatient;
        } catch (error) {
            console.error(error);
            const message =
                (error as any)?.response?.data?.message ??
                (error as any)?.message ??
                null;
            if (typeof message === "string" && message.trim()) {
                setAlertMessage(message);
            } else {
                setAlertMessage("접수 처리 실패");
            }
            return null;
        }
    }, [buildReservationDayGuardMessage, dateISO, isSameAsToday, movePatient, resolveNextStatus]);

    const handleConfirmReception = async (data: any) => {
        if (!selectedReceptionPatient) return;
        await confirmReceptionForPatient(selectedReceptionPatient, data, true);
    };

    const handleConfirmNewPatient = async (data: any) => { // You might need to adjust what data is passed back
        if (!selectedNewPatient) return;
        const checkInAtISO = new Date().toISOString();
        const checkInLabel = format(new Date(checkInAtISO), "HH:mm");
        const targetRoom = data.room || resolveInitialReceptionRoomId();
        const targetStatus = resolveNextStatus(
            "reception_confirm",
            selectedNewPatient.location,
            targetRoom,
            selectedNewPatient.status
        );

        // In a real app, you'd likely create a NEW full patient record or update the temporary one.
        // For now, we'll update the temporary patient to be 'registered' (remove isTemporary flag maybe?) and move them to wait.

        movePatient(selectedNewPatient.id, targetRoom, {
            ...data,
            isTemporary: false, // Mark as registered
            status: targetStatus,
            checkInAt: checkInAtISO,
            checkInTime: checkInLabel,
            isWalkIn: true
        });
        setSelectedNewPatient(null);
    };

    const handleDeleteClick = (patient: Patient) => {
        setPatientToDelete(patient);
    };

    const confirmDelete = async () => {
        if (!patientToDelete) return;

        try {
            await visitService.deleteVisit(patientToDelete.id);

            setPatients(patients.filter(p => p.id !== patientToDelete.id));
            await loadAppointments();

            setPatientToDelete(null);
        } catch (error) {
            console.error("Failed to delete visit:", error);
            setAlertMessage("접수 삭제에 실패했습니다.");
        }
    };

    const handleCancelReservationConfirm = async (reason: string, isNoShow: boolean) => {
        if (!reservationCancelTarget) return;
        try {
            await visitService.cancelReservation(reservationCancelTarget.id, reason, isNoShow);
            setReservationCancelTarget(null);
            setSelectedReceptionPatient(null);
            await loadAppointments();
        } catch (error) {
            console.error("Failed to cancel reservation:", error);
            setAlertMessage("예약 취소에 실패했습니다.");
        }
    };

    // Filter Lists
    const filteredPatients = patients.filter(p =>
        p.visitDate === dateISO &&
        (p.name.includes(searchTerm) || p.chartNo.includes(searchTerm))
    );

    const reservationPatientsRaw = filteredPatients.filter(isReservationPatient);
    const sortedReservationPatients = useMemo(() => {
        const dir = reservationSortDir === 'asc' ? 1 : -1;
        return [...reservationPatientsRaw].sort((a, b) => {
            if (reservationSortOption === 'doctor') {
                return dir * (a.doctor || '').localeCompare(b.doctor || '', 'ko-KR');
            }
            if (reservationSortOption === 'category') {
                return dir * (a.reservCategoryName || '').localeCompare(b.reservCategoryName || '', 'ko-KR');
            }
            if (reservationSortOption === 'name') {
                return dir * a.name.localeCompare(b.name, 'ko-KR');
            }
            return dir * a.time.localeCompare(b.time);
        });
    }, [reservationPatientsRaw, reservationSortOption, reservationSortDir]);
    const reservationPatients = sortedReservationPatients;
    // Show all active patients (not in reservation, not done/completed)
    const receptionPatients = filteredPatients.filter((p) => !isCompletedPatient(p) && !isReservationPatient(p));
    const statusOrderMap = useMemo(
        () =>
            new Map<string, number>(
                (settings.chartConfig?.statuses || [])
                    .filter((status) => status.enabled)
                    .map((status) => [String(status.id || "").trim().toLowerCase(), Number(status.order || 0)])
            ),
        [settings.chartConfig?.statuses]
    );
    const sortedReceptionPatients = useMemo(() => {
        const dir = receptionSortDir === 'asc' ? 1 : -1;
        const useStatusOrder = settings.chartConfig?.statusRules?.applyWaitOrderSorting ?? true;
        return [...receptionPatients].sort((a, b) => {
            if (receptionSortOption === "name") return dir * a.name.localeCompare(b.name, "ko-KR");

            if (receptionSortOption === "status") {
                const ao = statusOrderMap.get(String(a.status || "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
                const bo = statusOrderMap.get(String(b.status || "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
                if (ao !== bo) return dir * (ao - bo);
                return dir * a.name.localeCompare(b.name, "ko-KR");
            }

            if (useStatusOrder) {
                const ao = statusOrderMap.get(String(a.status || "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
                const bo = statusOrderMap.get(String(b.status || "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
                if (ao !== bo) return dir * (ao - bo);
            }

            const ac = String(a.checkInTime || "99:99");
            const bc = String(b.checkInTime || "99:99");
            if (ac !== bc) return dir * ac.localeCompare(bc);
            return dir * a.name.localeCompare(b.name, "ko-KR");
        });
    }, [
        receptionPatients,
        receptionSortOption,
        receptionSortDir,
        settings.chartConfig?.statusRules?.applyWaitOrderSorting,
        statusOrderMap,
    ]);
    const completePatients = filteredPatients.filter(isCompletedPatient);
    const sortedCompletePatients = useMemo(() => {
        const dir = completeSortDir === 'asc' ? 1 : -1;
        return [...completePatients].sort((a, b) => {
            if (sortOption === 'name') return dir * a.name.localeCompare(b.name, 'ko-KR');
            if (sortOption === 'checkInTime') return dir * (a.checkInTime || '').localeCompare(b.checkInTime || '');
            if (sortOption === 'completedTime') {
                const timeA = a.lastMovedAt ? new Date(a.lastMovedAt).getTime() : 0;
                const timeB = b.lastMovedAt ? new Date(b.lastMovedAt).getTime() : 0;
                return dir * (timeA - timeB);
            }
            return 0;
        });
    }, [completePatients, sortOption, completeSortDir]);

    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const reservationColRef = useRef<HTMLDivElement | null>(null);
    const receptionColRef = useRef<HTMLDivElement | null>(null);
    const completeColRef = useRef<HTMLDivElement | null>(null);

    const scrollToCol = (ref: React.RefObject<HTMLDivElement>) => {
        ref.current?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    };


    const jumpToCol = (col: MobileCol) => {
        if (isMobile) {
            setMobileCol(col);
            return;
        }
        if (col === "reservation") return scrollToCol(reservationColRef);
        if (col === "reception") return scrollToCol(receptionColRef);
        return scrollToCol(completeColRef);
    };

    const quickSecondsLeft = quickPendingAction
        ? Math.max(0, Math.ceil((quickPendingAction.executeAt - quickNow) / 1000))
        : 0;
    const selectedReceptionQuickPhase = selectedReceptionPatient
        ? quickPhaseByPatient[selectedReceptionPatient.id]
        : undefined;
    const selectedReceptionQueued = selectedReceptionPatient
        ? quickPendingAction?.patientVisitId === selectedReceptionPatient.id
        : false;
    const selectedReceptionBusy =
        selectedReceptionQuickPhase === "checking" || selectedReceptionQuickPhase === "running";
    const selectedReceptionQuickDisabled =
        (Boolean(selectedReceptionQuickPhase) && !selectedReceptionQueued) ||
        Boolean(
            quickPendingAction &&
            selectedReceptionPatient &&
            quickPendingAction.patientVisitId !== selectedReceptionPatient.id
        );
    const hoveredCustomerId = hoveredCard
        ? Number(hoveredCard.data.patientId || hoveredCard.data.id)
        : 0;
    const hoveredTickets =
        hoveredCustomerId > 0 ? (hoverTicketsByPatient[hoveredCustomerId] || []) : [];
    const hasHoverTicketSnapshot =
        hoveredCustomerId > 0 &&
        Object.prototype.hasOwnProperty.call(hoverTicketsByPatient, hoveredCustomerId);
    const isHoverTicketLoading =
        hoveredCustomerId > 0 && hoverTicketLoadingPatientId === hoveredCustomerId;
    const hoveredKeyRecords =
        hoveredCustomerId > 0 ? (hoverKeyRecordsByPatient[hoveredCustomerId] || []) : [];
    const hasHoverKeyRecordSnapshot =
        hoveredCustomerId > 0 &&
        Object.prototype.hasOwnProperty.call(hoverKeyRecordsByPatient, hoveredCustomerId);
    const isHoverKeyRecordLoading =
        hoveredCustomerId > 0 && hoverKeyRecordLoadingPatientId === hoveredCustomerId;
    const hoveredPlannedSummary = hoveredCard
        ? getHoverPlannedProcedures(hoveredCard.data, hoveredTickets, hasHoverTicketSnapshot)
        : [];
    const hoverHistoryText = hoveredCard?.data?.history
        ? String(hoveredCard.data.history)
            .split("\n")
            .filter((line) => {
                const trimmed = line.trim();
                if (!trimmed) return true;
                return !trimmed.includes("선택 시술권") && !trimmed.includes("예약 시술");
            })
            .join("\n")
            .trim()
        : "";

    const shouldShowHoverOverlay = Boolean(
        hoveredCard &&
        !isDropdownOpen &&
        (
            hoveredPlannedSummary.length > 0 ||
            hoverHistoryText ||
            hoveredTickets.length > 0 ||
            isHoverTicketLoading ||
            hasHoverTicketSnapshot ||
            hoveredKeyRecords.length > 0 ||
            isHoverKeyRecordLoading ||
            hasHoverKeyRecordSnapshot
        )
    );

    const updateHoverPosition = useCallback(() => {
        if (!hoveredCard) return;
        const margin = 8;
        const gap = 12;
        const overlayEl = hoverOverlayRef.current;
        const liveAnchorRect = hoveredCard.anchorEl?.getBoundingClientRect();
        const anchorRect = liveAnchorRect && liveAnchorRect.width > 0
            ? liveAnchorRect
            : hoveredCard.rect;

        const overlayHeight = overlayEl?.getBoundingClientRect().height ?? anchorRect.height;
        const overlayWidth = anchorRect.width;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        let left = anchorRect.left;
        const maxLeft = Math.max(margin, viewportWidth - overlayWidth - margin);
        left = Math.min(Math.max(margin, left), maxLeft);

        let top = anchorRect.bottom + gap;
        if (top + overlayHeight > viewportHeight - margin) {
            const topAbove = anchorRect.top - overlayHeight - gap;
            top = topAbove >= margin
                ? topAbove
                : Math.max(margin, viewportHeight - overlayHeight - margin);
        }

        setHoverOverlayStyle({
            top,
            left,
            width: overlayWidth,
            minHeight: anchorRect.height,
        });
    }, [hoveredCard]);

    useEffect(() => {
        if (!shouldShowHoverOverlay || !hoveredCard) {
            setHoverOverlayStyle(null);
            return;
        }

        updateHoverPosition();
        const frameId = window.requestAnimationFrame(updateHoverPosition);
        window.addEventListener("resize", updateHoverPosition);
        window.addEventListener("scroll", updateHoverPosition, true);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener("resize", updateHoverPosition);
            window.removeEventListener("scroll", updateHoverPosition, true);
        };
    }, [shouldShowHoverOverlay, hoveredCard, updateHoverPosition]);

    useEffect(() => {
        if (!shouldShowHoverOverlay || !hoveredCard) return;
        requestAnimationFrame(updateHoverPosition);
    }, [shouldShowHoverOverlay, hoveredCard, hoveredTickets.length, hoveredKeyRecords.length, isHoverTicketLoading, isHoverKeyRecordLoading, updateHoverPosition]);


    return (
        <div className="flex flex-1 h-full overflow-hidden border-t border-slate-200/70 relative rounded-2xl">
            {/* In-Page Sidebar (Calendar & Tasks) */}
            <aside className="hidden xl:flex w-64 kkeut-panel border-r border-slate-200/70 flex flex-col shrink-0 overflow-y-auto">
                {/* Mini Calendar */}
                <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded">
                            <ChevronLeft className="w-4 h-4 text-gray-400" />
                        </button>
                        <span className="text-sm font-bold text-gray-600">
                            {calendarTitle}
                        </span>
                        <div className="flex gap-1">
                            <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded">
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            </button>
                        </div>
                    </div>
                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1 text-[10px] text-center text-gray-500 mb-2">
                        <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-xs text-center text-gray-700 font-medium">
                        {calendarDays.map((day, i) => {
                            if (!day) return <div key={i} />;

                            const isSelected = (() => {
                                const checkDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
                                const checkISO = format(checkDate, 'yyyy-MM-dd');
                                return checkISO === dateISO;
                            })();

                            return (
                                <div
                                    key={i}
                                    onClick={() => handleDateClick(day)}
                                    className={`p-1 rounded-full cursor-pointer hover:bg-[#FCEBEF] ${isSelected ? 'bg-[rgb(var(--kkeut-primary-strong))] text-white' : ''}`}
                                >
                                    {day}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Tasks */}
                <div className="p-4 flex-1">
                    <div
                        className="flex items-center justify-between mb-3 cursor-pointer"
                        onClick={() => setIsTaskOpen(!isTaskOpen)}
                    >
                        <span className="text-xs font-bold text-gray-500">업무 {tasks.length}</span>
                        <ChevronLeft className={`w-3 h-3 text-gray-400 transition-transform ${isTaskOpen ? 'rotate-90' : '-rotate-90'}`} />
                    </div>



                    {isTaskOpen && (
                        <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                            {tasks.map((task: TaskItem) => (
                                <div key={task.id} className="group py-1">
                                    <div className="flex items-start gap-2">
                                        <button
                                            onClick={() => toggleTask(task.id)}
                                            className={`mt-0.5 shrink-0 transition-colors ${task.completed ? "text-gray-300" : "text-[rgb(var(--kkeut-primary))]"}`}
                                        >
                                            {task.completed ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-xs leading-relaxed whitespace-pre-wrap ${task.completed ? "text-gray-400 line-through decoration-gray-300" : "text-gray-800"}`}>
                                                {task.content}
                                            </div>
                                            {task.subContent && <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed whitespace-pre-wrap">{task.subContent}</div>}
                                            <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
                                                <span>{task.author}</span>
                                                <button
                                                    onClick={() => deleteTask(task.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 transition-opacity px-1"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Add Task UI */}
                            {isAddingTask ? (
                                <form onSubmit={handleAddTask} className="pt-2">
                                    <input
                                        autoFocus
                                        type="text"
                                        className="w-full text-xs p-1.5 border border-[rgb(var(--kkeut-border))] rounded mb-1 focus:outline-none focus:border-[rgb(var(--kkeut-primary))]"
                                        placeholder="업무 내용..."
                                        value={newTaskContent}
                                        onChange={(e) => setNewTaskContent(e.target.value)}
                                        onBlur={() => !newTaskContent && setIsAddingTask(false)}
                                    />
                                    <div className="flex justify-end gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddingTask(false)}
                                            className="px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded"
                                        >
                                            취소
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!newTaskContent.trim()}
                                            className="px-2 py-0.5 text-[10px] text-white bg-[rgb(var(--kkeut-primary))] rounded hover:opacity-90 disabled:opacity-50"
                                        >
                                            등록
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <button
                                    onClick={() => setIsAddingTask(true)}
                                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 w-full py-1 mt-1 hover:bg-gray-50 rounded transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                    <span>업무 추가</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Columns */}
            <main className="flex-1 flex flex-col overflow-hidden kkeut-panel">

                {/* Mobile Column Tabs */}
                <div className="xl:hidden shrink-0 border-b border-slate-200/70 bg-white/80 px-3 py-2 backdrop-blur">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <button
                            type="button"
                            onClick={() => jumpToCol("reservation")}
                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-gray-50 ${(isMobile && mobileCol === "reservation" ? "bg-[rgb(var(--kkeut-primary-strong))] text-white border-[rgb(var(--kkeut-primary-strong))]" : "bg-white text-gray-800 border-slate-200/80")}`}
                        >
                            예약
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${(isMobile && mobileCol === "reservation" ? "bg-white/20 text-white" : "bg-cyan-100 text-cyan-800")}`}>{reservationPatients.length}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => jumpToCol("reception")}
                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-gray-50 ${(isMobile && mobileCol === "reception" ? "bg-[rgb(var(--kkeut-primary-strong))] text-white border-[rgb(var(--kkeut-primary-strong))]" : "bg-white text-gray-800 border-slate-200/80")}`}
                        >
                            접수
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${(isMobile && mobileCol === "reception" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700")}`}>{receptionPatients.length}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => jumpToCol("complete")}
                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-gray-50 ${(isMobile && mobileCol === "complete" ? "bg-[rgb(var(--kkeut-primary-strong))] text-white border-[rgb(var(--kkeut-primary-strong))]" : "bg-white text-gray-800 border-slate-200/80")}`}
                        >
                            완료
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${(isMobile && mobileCol === "complete" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700")}`}>{completePatients.length}</span>
                        </button>
                    </div>
                </div>

                <div ref={scrollerRef} className={isMobile ? "flex-1 flex min-h-0 overflow-x-hidden overflow-y-hidden p-2.5" : "flex-1 flex min-h-0 overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory xl:overflow-x-hidden p-2.5 gap-2"}>
                    {/* Reservation Column */}
                    <div
                        ref={reservationColRef}
                        className={`${isMobile ? (mobileCol === "reservation" ? "flex-1 w-full" : "hidden") : "snap-start shrink-0 w-[92vw] sm:w-[420px]"} xl:w-auto xl:shrink kkeut-panel flex flex-col min-h-0 rounded-2xl xl:flex-1 xl:min-w-[320px]`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, 'reservation')}
                    >
                        <div className="p-3 border-b border-[#F8DCE2] flex items-center justify-between bg-white/75 shrink-0 backdrop-blur relative z-10">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-gray-800">예약</h3>
                                <span className="text-cyan-700 font-bold">{reservationPatients.length}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 relative">
                                <button
                                    className="flex items-center gap-1 hover:text-gray-800 transition-colors"
                                    onClick={() => setIsReservationSortDropdownOpen(!isReservationSortDropdownOpen)}
                                >
                                    <span>
                                        {reservationSortOption === 'time' ? '예약시각순' :
                                            reservationSortOption === 'doctor' ? '담당의순' :
                                                reservationSortOption === 'category' ? '카테고리순' : '환자이름순'}
                                    </span>
                                </button>
                                <button
                                    className="text-[10px] leading-none hover:text-gray-800 transition-colors"
                                    onClick={() => setReservationSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    title={reservationSortDir === 'asc' ? '오름차순 (내림차순으로 변경)' : '내림차순 (오름차순으로 변경)'}
                                >
                                    {reservationSortDir === 'asc' ? '▲' : '▼'}
                                </button>

                                {isReservationSortDropdownOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-[100]"
                                            onClick={() => setIsReservationSortDropdownOpen(false)}
                                        />
                                        <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-xl shadow-2xl border border-slate-200/80 py-1 z-[9999] animate-in fade-in zoom-in-95 duration-200">
                                            {[
                                                { id: 'time', label: '예약시각순' },
                                                { id: 'doctor', label: '담당의순' },
                                                { id: 'category', label: '카테고리순' },
                                                { id: 'name', label: '환자이름순' }
                                            ].map((option) => (
                                                <button
                                                    key={option.id}
                                                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-[#D27A8C] transition-colors"
                                                    onClick={() => {
                                                        setReservationSortOption(option.id as any);
                                                        setIsReservationSortDropdownOpen(false);
                                                    }}
                                                >
                                                    <span>{option.label}</span>
                                                    {reservationSortOption === option.id && <Check className="w-3 h-3 text-cyan-600" />}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-transparent">
                            {reservationPatients.map(res => (
                                <ReservationCard
                                    key={res.id}
                                    data={res}
                                    onDragStart={(e) => handleDragStart(e, res.id)}
                                    onMouseEnter={(e) => handleCardHover(e, res)}
                                    onMouseLeave={handleCardLeave}
                                    onClick={() => {
                                        if (!isSameAsToday(res.visitDate || dateISO)) {
                                            setAlertMessage(buildReservationDayGuardMessage(res.visitDate || dateISO));
                                            return;
                                        }
                                        if (res.isTemporary) {
                                            setSelectedNewPatient(res);
                                        } else {
                                            setSelectedReceptionPatient(res);
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Reception Column */}
                    <div
                        ref={receptionColRef}
                        className={`${isMobile ? (mobileCol === "reception" ? "flex-1 w-full" : "hidden") : "snap-start shrink-0 w-[92vw] sm:w-[420px]"} xl:w-auto xl:shrink kkeut-panel flex flex-col min-h-0 rounded-2xl xl:flex-1 xl:min-w-[320px]`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, resolveInitialReceptionRoomId())}
                    >
                        <div className="p-3 border-b border-[#F8DCE2] flex items-center justify-between bg-white/75 shrink-0 backdrop-blur relative z-10">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-gray-800">접수</h3>
                                <span className="text-gray-400 font-bold">{receptionPatients.length}</span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-gray-500 relative">
                                <button
                                    className="flex items-center gap-1 hover:text-gray-800 transition-colors"
                                    onClick={() => setIsReceptionSortDropdownOpen(!isReceptionSortDropdownOpen)}
                                >
                                    <span>
                                        {receptionSortOption === 'checkInTime' ? '접수시각순' :
                                            receptionSortOption === 'status' ? '상태태그순' : '환자이름순'}
                                    </span>
                                </button>
                                <button
                                    className="text-[10px] leading-none hover:text-gray-800 transition-colors"
                                    onClick={() => setReceptionSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    title={receptionSortDir === 'asc' ? '오름차순 (내림차순으로 변경)' : '내림차순 (오름차순으로 변경)'}
                                >
                                    {receptionSortDir === 'asc' ? '▲' : '▼'}
                                </button>

                                {isReceptionSortDropdownOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-[100]"
                                            onClick={() => setIsReceptionSortDropdownOpen(false)}
                                        />
                                        <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-xl shadow-2xl border border-slate-200/80 py-1 z-[9999] animate-in fade-in zoom-in-95 duration-200">
                                            {[
                                                { id: 'checkInTime', label: '접수시각순' },
                                                { id: 'status', label: '상태태그순' },
                                                { id: 'name', label: '환자이름순' }
                                            ].map((option) => (
                                                <button
                                                    key={option.id}
                                                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-[#D27A8C] transition-colors"
                                                    onClick={() => {
                                                        setReceptionSortOption(option.id as any);
                                                        setIsReceptionSortDropdownOpen(false);
                                                    }}
                                                >
                                                    <span>{option.label}</span>
                                                    {receptionSortOption === option.id && <Check className="w-3 h-3 text-cyan-600" />}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-transparent">
                            {sortedReceptionPatients.length === 0 ? (
                                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                                    대기 환자가 없어요.
                                </div>
                            ) : (
                                sortedReceptionPatients.map(res => (
                                    (() => {
                                        const quickPhase = quickPhaseByPatient[res.id];
                                        const hasQueued = quickPendingAction?.patientVisitId === res.id;
                                        const isBusy = quickPhase === "checking" || quickPhase === "running";
                                        const quickHint = hasQueued
                                            ? "3초 내 취소 가능"
                                            : quickPhase === "checking"
                                                ? "조건 확인 중"
                                                : quickPhase === "running"
                                                    ? "차감/입실 처리 중"
                                                    : "잔여 차감 + 시술실 입실";
                                        return (
                                    <WaitCard
                                        key={res.id}
                                        patient={res}
                                        isHighlighted={false}
                                        patientTodos={chartTodosByPatient[(res.patientId || res.id) as number] || []}
                                        todoAssignableMembers={todoAssignableMembers}
                                        showTodos={false}
                                        locationOptions={(settings.chartConfig?.waitLists || []).filter(w => w.enabled).map(w => ({ id: w.id, label: w.label }))}
                                        onMoveLocation={handleMoveLocation}
                                        onTodoCycle={handleCycleTodoStatus}
                                        onTodoAssigneeChange={handleTodoAssigneeChange}
                                        onStatusDropdownChange={setIsDropdownOpen}
                                        onDragStart={(e) => handleDragStart(e, res.id)}
                                        onMouseEnter={(e) => handleCardHover(e, res)}
                                        onMouseLeave={handleCardLeave}
                                        onPrint={() => handlePrintPatientChart(res)}
                                        printPreview={printPreviewByPatient[Number(res.patientId || res.id)] || "인쇄 미리보기 로드 중..."}
                                        onCardClick={() => {
                                            setReceptionEditMode(true);
                                            setSelectedReceptionPatient(res);
                                        }}
                                        quickAction={{
                                            label: hasQueued ? "실행 대기 중" : "빠른 차감/입실",
                                            hint: quickHint,
                                            disabled: Boolean(quickPhase) && !hasQueued,
                                            busy: isBusy,
                                            queued: hasQueued,
                                            compact: true,
                                            iconTitle: hasQueued
                                                ? "빠른 차감/입실 실행 대기 중 (클릭 시 취소)"
                                                : "빠른 차감/입실",
                                            onClick: () => {
                                                if (hasQueued) {
                                                    handleUndoQuickReception();
                                                    return;
                                                }
                                                void queueQuickReceptionAction(res);
                                            },
                                        }}
                                        onAlert={setAlertMessage}
                                    />
                                        );
                                    })()
                                ))
                            )}
                        </div>
                    </div>

                    {/* Complete Column */}
                    <div
                        ref={completeColRef}
                        className={`${isMobile ? (mobileCol === "complete" ? "flex-1 w-full" : "hidden") : "snap-start shrink-0 w-[92vw] sm:w-[420px]"} xl:w-auto xl:shrink kkeut-panel flex flex-col min-h-0 rounded-2xl xl:flex-1 xl:min-w-[320px]`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, resolveCompletionRoomId())}
                    >
                        <div className="p-3 border-b border-[#F8DCE2] flex items-center justify-between bg-white/75 shrink-0 backdrop-blur relative z-10">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-gray-800">완료</h3>
                                <span className="text-gray-400 font-bold">{completePatients.length}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 relative">
                                <button
                                    className="flex items-center gap-1 hover:text-gray-800 transition-colors"
                                    onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                                >
                                    <span>
                                        {sortOption === 'completedTime' ? '완료시각순' :
                                            sortOption === 'checkInTime' ? '접수시각순' : '환자이름순'}
                                    </span>
                                </button>
                                <button
                                    className="text-[10px] leading-none hover:text-gray-800 transition-colors"
                                    onClick={() => setCompleteSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    title={completeSortDir === 'asc' ? '오름차순 (내림차순으로 변경)' : '내림차순 (오름차순으로 변경)'}
                                >
                                    {completeSortDir === 'asc' ? '▲' : '▼'}
                                </button>

                                {isSortDropdownOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-[100]"
                                            onClick={() => setIsSortDropdownOpen(false)}
                                        />
                                        <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-xl shadow-2xl border border-slate-200/80 py-1 z-[9999] animate-in fade-in zoom-in-95 duration-200">
                                            {[
                                                { id: 'completedTime', label: '완료시각순' },
                                                { id: 'checkInTime', label: '접수시각순' },
                                                { id: 'name', label: '환자이름순' }
                                            ].map((option) => (
                                                <button
                                                    key={option.id}
                                                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-[#D27A8C] transition-colors"
                                                    onClick={() => {
                                                        setSortOption(option.id as any);
                                                        setIsSortDropdownOpen(false);
                                                    }}
                                                >
                                                    <span>{option.label}</span>
                                                    {sortOption === option.id && <Check className="w-3 h-3 text-cyan-600" />}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-transparent">
                            {sortedCompletePatients.length === 0 ? (
                                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                                    완료 환자가 없어요.
                                </div>
                            ) : (
                                sortedCompletePatients.map(res => (
                                    <WaitCard
                                        key={res.id}
                                        patient={res}
                                        isHighlighted={false}
                                        patientTodos={chartTodosByPatient[(res.patientId || res.id) as number] || []}
                                        todoAssignableMembers={todoAssignableMembers}
                                        showTodos={false}
                                        locationOptions={(settings.chartConfig?.waitLists || []).filter(w => w.enabled).map(w => ({ id: w.id, label: w.label }))}
                                        onMoveLocation={handleMoveLocation}
                                        onTodoCycle={handleCycleTodoStatus}
                                        onTodoAssigneeChange={handleTodoAssigneeChange}
                                        onStatusDropdownChange={setIsDropdownOpen}
                                        onDragStart={(e) => handleDragStart(e, res.id)}
                                        onMouseEnter={(e) => handleCardHover(e, res)}
                                        onMouseLeave={handleCardLeave}
                                        onPrint={() => handlePrintPatientChart(res)}
                                        printPreview={printPreviewByPatient[Number(res.patientId || res.id)] || "인쇄 미리보기 로드 중..."}
                                        onAlert={setAlertMessage}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Hover Overlay */}
            {shouldShowHoverOverlay && hoveredCard && (
                <div
                    ref={hoverOverlayRef}
                    className="fixed z-[9999] kkeut-card-luxe p-3 animate-in fade-in duration-200 pointer-events-none"
                    style={hoverOverlayStyle ?? {
                        top: hoveredCard.rect.bottom + 12,
                        left: hoveredCard.rect.left,
                        width: hoveredCard.rect.width,
                        minHeight: hoveredCard.rect.height,
                    }}
                >
                    <div className="space-y-3">
                        {hoveredPlannedSummary.length > 0 && (
                            <div>
                                <div className="text-xs font-bold text-blue-800 mb-1">예약 시술</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {hoveredPlannedSummary.map((name, idx) => (
                                        <span
                                            key={`hover-planned-${hoveredCustomerId}-${idx}-${name}`}
                                            className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50/70 px-2 py-1 text-[11px] font-medium text-blue-700"
                                        >
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {(hoveredCustomerId > 0 || isHoverTicketLoading || hoveredTickets.length > 0) && (
                            <div>
                                <div className="text-xs font-bold text-cyan-800 mb-1">남은 시술권</div>
                                {isHoverTicketLoading ? (
                                    <div className="text-xs text-slate-500">불러오는 중...</div>
                                ) : hoveredTickets.length === 0 ? (
                                    <div className="text-xs text-slate-500">남은 시술권이 없습니다.</div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {hoveredTickets.slice(0, 6).map((ticket) => (
                                            <div
                                                key={`hover-ticket-${hoveredCustomerId}-${ticket.ticketId}`}
                                                className={`rounded-lg border px-2.5 py-1.5 ${
                                                    ticket.cycleBlocked
                                                        ? "border-red-200 bg-red-50/50 opacity-70"
                                                        : ticket.isReserved
                                                            ? "border-cyan-200 bg-cyan-50/60"
                                                            : "border-slate-200 bg-white/70"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2 text-xs">
                                                    <div className="min-w-0 flex items-center gap-1.5">
                                                        <Ticket className="h-3 w-3 shrink-0 text-slate-500" />
                                                        <span className="truncate font-semibold text-slate-700">{ticket.ticketName}</span>
                                                        {ticket.isReserved && (
                                                            <span className="shrink-0 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700">
                                                                예약 매칭
                                                            </span>
                                                        )}
                                                        {ticket.isPeriod && (
                                                            <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                                                                주기권
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="shrink-0 font-bold text-[#D27A8C]">
                                                        잔여 {ticket.remaining}회
                                                    </span>
                                                </div>
                                                <div className={`mt-0.5 text-[10px] font-medium ${
                                                    ticket.cycleBlocked ? "text-red-500" : "text-emerald-600"
                                                }`}>
                                                    {ticket.cycleBlocked
                                                        ? `⛔ ${ticket.cycleBlockReason || "사용 불가"}`
                                                        : "즉시 차감 가능"}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {(hoveredCustomerId > 0 || isHoverKeyRecordLoading || hoveredKeyRecords.length > 0) && (
                            <div>
                                <div className="text-xs font-bold text-amber-800 mb-1">중요기록</div>
                                {isHoverKeyRecordLoading ? (
                                    <div className="text-xs text-slate-500">불러오는 중...</div>
                                ) : hoveredKeyRecords.length === 0 ? (
                                    <div className="text-xs text-slate-500">중요기록이 없습니다.</div>
                                ) : (
                                    <div className="space-y-1">
                                        {hoveredKeyRecords.map((record) => {
                                            const createdAtLabel = (() => {
                                                if (!record.createdAt) return "";
                                                const parsed = new Date(record.createdAt);
                                                if (Number.isNaN(parsed.getTime())) return "";
                                                return format(parsed, "yyyy.MM.dd HH:mm");
                                            })();
                                            return (
                                                <div
                                                    key={`hover-key-record-${hoveredCustomerId}-${record.id}`}
                                                    className="rounded border border-amber-200/70 bg-amber-50/40 px-2 py-1.5"
                                                >
                                                    <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                        {record.content}
                                                    </div>
                                                    {(createdAtLabel || record.createdByName) && (
                                                        <div className="mt-1 text-[10px] text-slate-500">
                                                            {createdAtLabel}
                                                            {createdAtLabel && record.createdByName ? " · " : ""}
                                                            {record.createdByName || ""}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                        {hoverHistoryText && (
                            <div className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                                {hoverHistoryText}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {quickTicketPicker && (
                <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/35 backdrop-blur-[1px] p-4">
                    <div className="w-full max-w-[620px] max-h-[80vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <div>
                                <div className="text-base font-bold text-slate-900">차감할 시술권 선택</div>
                                <div className="mt-0.5 text-xs text-slate-500">
                                    {quickTicketPicker.patient.name}님 · {quickTicketPicker.targetRoomLabel} 입실 예정
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setQuickTicketPicker(null)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                title="닫기"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        {quickTicketPicker.message && (
                            <div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs text-slate-600">
                                {quickTicketPicker.message}
                            </div>
                        )}
                        <div className="max-h-[52vh] overflow-y-auto px-5 py-4 space-y-2.5">
                            {quickTicketPicker.options.map((option) => {
                                const allowCycleOverride = canOverrideCycleBlock(option);
                                const disabled = option.remaining <= 0 || (option.cycleBlocked && !allowCycleOverride);
                                return (
                                    <button
                                        key={`quick-ticket-option-${option.ticketId}`}
                                        type="button"
                                        onClick={() => {
                                            if (disabled) return;
                                            setQuickTicketPicker((prev) => {
                                                if (!prev) return prev;
                                                const ids = prev.selectedIds || [];
                                                const next = ids.includes(option.ticketId)
                                                    ? ids.filter((id) => id !== option.ticketId)
                                                    : [...ids, option.ticketId];
                                                return { ...prev, selectedIds: next };
                                            });
                                        }}
                                        disabled={disabled}
                                        className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                                            disabled
                                                ? "cursor-not-allowed border-red-200 bg-red-50/50 text-slate-400 opacity-70"
                                                : (quickTicketPicker?.selectedIds || []).includes(option.ticketId)
                                                    ? "border-[#D27A8C] bg-[#FCEBEF] ring-1 ring-[#D27A8C]/30"
                                                : allowCycleOverride
                                                    ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
                                                : option.matchedPlanned
                                                    ? "border-cyan-200 bg-cyan-50/60 hover:bg-[#FCEBEF]"
                                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                                disabled ? "border-gray-300 bg-gray-200" :
                                                (quickTicketPicker?.selectedIds || []).includes(option.ticketId)
                                                    ? "border-[#D27A8C] bg-[#D27A8C] text-white" : "border-gray-300 bg-white"
                                            }`}>
                                                {(quickTicketPicker?.selectedIds || []).includes(option.ticketId) && (
                                                    <Check className="h-3 w-3" strokeWidth={3} />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Ticket className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate text-sm font-semibold">
                                                        {option.ticketName}
                                                    </span>
                                                    {option.matchedPlanned && (
                                                        <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700">
                                                            예약 매칭
                                                        </span>
                                                    )}
                                                    {option.isPeriod && (
                                                        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                                                            주기권
                                                        </span>
                                                    )}
                                                    {option.isPackage && (
                                                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                                            패키지
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`mt-1 text-[11px] leading-relaxed ${disabled ? "text-red-500 font-medium" : "text-slate-500"}`}>
                                                    {disabled
                                                        ? `⛔ ${option.cycleBlockReason || "지금은 사용할 수 없습니다."}`
                                                        : allowCycleOverride
                                                            ? `${option.cycleBlockReason || "시술 주기 확인 필요"} · 클릭 시 경고 후 진행`
                                                        : option.isPackage
                                                            ? "회차/시술 선택 후 차감됩니다."
                                                            : "즉시 차감 가능"}
                                                </div>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                                                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-cyan-700">
                                                        대기 {Math.max(0, Number(option.queueTodoCount || 0))}건
                                                    </span>
                                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                                                        진행 {Math.max(0, Number(option.queueDoingCount || 0))}건
                                                    </span>
                                                    <span
                                                        className={`rounded-full border px-1.5 py-0.5 ${
                                                            Number(option.queueEstimatedWaitMinutes || 0) >= 70
                                                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                                                : Number(option.queueEstimatedWaitMinutes || 0) >= 40
                                                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                        }`}
                                                    >
                                                        예상 {Math.max(0, Number(option.queueEstimatedWaitMinutes || 0))}분
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="text-sm font-bold text-slate-800">
                                                    잔여 {option.remaining}회
                                                </div>
                                                {option.nextAvailableAt && (
                                                    <div className="mt-1 text-[10px] text-amber-600">
                                                        다음 가능: {option.nextAvailableAt}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setQuickTicketPicker(null)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                disabled={!(quickTicketPicker?.selectedIds?.length)}
                                onClick={async () => {
                                    if (!quickTicketPicker) return;
                                    const selected = quickTicketPicker.options.filter((o) => quickTicketPicker.selectedIds.includes(o.ticketId));
                                    if (selected.length === 0) return;
                                    if (selected.length === 1) {
                                        handleSelectQuickTicket(selected[0]);
                                        return;
                                    }
                                    const payload = quickTicketPicker;
                                    setQuickTicketPicker(null);
                                    queueQuickActionWithTicket({
                                        patient: payload.patient,
                                        patientCustomerId: payload.patientCustomerId,
                                        targetRoomId: payload.targetRoomId,
                                        targetStatus: payload.targetStatus,
                                        option: selected[0],
                                        allowCycleOverride: false,
                                        extraTickets: selected.slice(1),
                                    });
                                }}
                                className="rounded-lg bg-[#D27A8C] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#8B3F50] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                차감하기 ({quickTicketPicker?.selectedIds?.length || 0}건)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {quickPackagePicker && (
                <div className="fixed inset-0 z-[10035] flex items-center justify-center bg-black/45 backdrop-blur-[1px] p-4">
                    <div className="w-full max-w-3xl max-h-[84vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-100 px-5 py-4">
                            <div className="text-base font-bold text-slate-900">패키지 시술 선택</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                                {quickPackagePicker.option.ticketName}
                            </div>
                        </div>
                        <div className="max-h-[66vh] overflow-y-auto px-5 py-4">
                            <label className="mb-1 block text-xs text-slate-600">진행할 회차/시술</label>
                            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                                {quickPackagePicker.options.map((opt, idx) => {
                                    const key = `${opt.round}`;
                                    const isSelected = quickPackagePicker.selectedRoundKey === key;
                                    return (
                                        <button
                                            key={`${opt.round}-${idx}`}
                                            type="button"
                                            className={`w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 transition-colors ${
                                                isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                                            }`}
                                            onClick={() => {
                                                setQuickPackagePicker((prev) =>
                                                    prev
                                                        ? {
                                                              ...prev,
                                                              selectedRoundKey: key,
                                                              selectedTreatments: [...(opt.treatments || [])],
                                                          }
                                                        : prev
                                                );
                                            }}
                                        >
                                            <div className="flex items-start gap-2">
                                                <span
                                                    className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${
                                                        isSelected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                                                    }`}
                                                >
                                                    {opt.round}회차
                                                </span>
                                                <span className="whitespace-normal break-keep text-sm leading-5 text-slate-800">
                                                    {opt.treatments.join(" + ")}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-2 text-[11px] text-slate-500">
                                패키지는 순차 진행 고정이 아니며, 원하는 회차/시술을 선택해 사용할 수 있습니다.
                            </div>

                            {(quickPackagePicker.selectedTreatments || []).length > 0 && (
                                <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
                                    <div className="mb-1 text-[11px] font-bold text-slate-600">할일 생성 순서</div>
                                    <div className="space-y-1">
                                        {quickPackagePicker.selectedTreatments.map((name, idx) => (
                                            <div
                                                key={`${name}-${idx}`}
                                                className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1"
                                            >
                                                <span className="text-xs text-slate-700">
                                                    {idx + 1}. {name}
                                                </span>
                                                <div className="flex gap-1">
                                                    <button
                                                        type="button"
                                                        className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 disabled:opacity-40"
                                                        disabled={idx === 0}
                                                        onClick={() => moveQuickPackageTreatment(idx, "up")}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 disabled:opacity-40"
                                                        disabled={idx === quickPackagePicker.selectedTreatments.length - 1}
                                                        onClick={() => moveQuickPackageTreatment(idx, "down")}
                                                    >
                                                        ↓
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                            <button
                                type="button"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                onClick={() => setQuickPackagePicker(null)}
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
                                onClick={() => {
                                    const payload = quickPackagePicker;
                                    const selectedRound = Number(payload.selectedRoundKey || 0);
                                    const selected =
                                        payload.options.find((item) => item.round === selectedRound) ||
                                        payload.options[0];
                                    if (!selected) {
                                        setQuickPackagePicker(null);
                                        return;
                                    }

                                    queueQuickActionWithTicket({
                                        patient: payload.patient,
                                        patientCustomerId: payload.patientCustomerId,
                                        targetRoomId: payload.targetRoomId,
                                        targetStatus: payload.targetStatus,
                                        option: payload.option,
                                        allowCycleOverride: payload.allowCycleOverride,
                                        selectedPackage: {
                                            round: selected.round,
                                            treatments:
                                                payload.selectedTreatments.length > 0
                                                    ? payload.selectedTreatments
                                                    : selected.treatments,
                                        },
                                    });
                                    setQuickPackagePicker(null);
                                }}
                            >
                                사용하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {quickPendingAction && (
                <div className="fixed bottom-6 right-6 z-[10020] w-[320px] rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-2xl backdrop-blur">
                    <div className="text-sm font-bold text-emerald-700">빠른 차감/입실 대기</div>
                    <div className="mt-1 text-xs text-gray-600">
                        {quickPendingAction.patientName}님
                        {" · "}
                        {quickPendingAction.ticketName}
                        {" · "}
                        {quickPendingAction.targetRoomLabel}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                        {quickSecondsLeft}초 후 실행됩니다.
                    </div>
                    <div className="mt-3 flex justify-end">
                        <button
                            type="button"
                            onClick={handleUndoQuickReception}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                        >
                            실행 취소
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {pendingMove && (
                <ConfirmModal
                    title="상태 변경 확인"
                    description="환자의 상태를 변경하시겠습니까?"
                    onClose={() => setPendingMove(null)}
                    onConfirm={async () => {
                        const movingPatient = patients.find((patient) => patient.id === pendingMove.patientId);
                        const isDoneTarget = isDoneLocation(pendingMove.targetLocation);
                        const newStatus = isDoneTarget
                            ? "done"
                            : resolveNextStatus(
                                "drag_move",
                                movingPatient?.location,
                                pendingMove.targetLocation,
                                movingPatient?.status
                            );

                        try {
                            await visitService.updateVisit(pendingMove.patientId, {
                                room: pendingMove.targetLocation,
                                status: newStatus
                            });
                            if (isDoneTarget) {
                                const completedAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                movePatient(pendingMove.patientId, pendingMove.targetLocation, {
                                    status: "done",
                                    completedAt,
                                });
                            } else {
                                movePatient(pendingMove.patientId, pendingMove.targetLocation, {
                                    status: newStatus,
                                });
                            }
                        } catch (error) {
                            console.error("Failed to move patient:", error);
                            setAlertMessage("환자 이동 저장 실패: " + String(error));
                            // Optimistic update rollback could go here, but for now just alerting
                        }
                        setPendingMove(null);
                    }}
                />
            )}

            {cycleOverrideConfirm && (
                <ConfirmModal
                    title="시술 주기 제한 확인"
                    description={`${cycleOverrideConfirm.reason}\n\n주기 제한을 무시하고 시술권을 사용하시겠습니까?`}
                    onClose={() => setCycleOverrideConfirm(null)}
                    onConfirm={() => {
                        const opt = cycleOverrideConfirm.option;
                        setCycleOverrideConfirm(null);
                        if (!quickTicketPicker) return;
                        if (opt.isPackage && (opt.packageSelections || []).length > 0) {
                            const packageSelections = opt.packageSelections || [];
                            const preferredRound = opt.defaultPackageRound || 1;
                            const preferred = packageSelections.find((item) => item.round === preferredRound) || packageSelections[0];
                            if (preferred) {
                                setQuickPackagePicker({
                                    patient: quickTicketPicker.patient,
                                    patientCustomerId: quickTicketPicker.patientCustomerId,
                                    targetRoomId: quickTicketPicker.targetRoomId,
                                    targetRoomLabel: quickTicketPicker.targetRoomLabel,
                                    targetStatus: quickTicketPicker.targetStatus,
                                    option: opt,
                                    options: packageSelections,
                                    selectedRoundKey: String(preferred.round),
                                    selectedTreatments: [...preferred.treatments],
                                    allowCycleOverride: true,
                                });
                                setQuickTicketPicker(null);
                                return;
                            }
                        }
                        const payload = quickTicketPicker;
                        setQuickTicketPicker(null);
                        queueQuickActionWithTicket({
                            patient: payload.patient,
                            patientCustomerId: payload.patientCustomerId,
                            targetRoomId: payload.targetRoomId,
                            targetStatus: payload.targetStatus,
                            option: opt,
                            allowCycleOverride: true,
                        });
                    }}
                />
            )}

            {pendingRollback && (
                <ConfirmModal
                    title="접수 롤백 확인"
                    description={`${pendingRollback.name} 환자의 접수를 취소하고 예약 상태로 되돌리시겠습니까?\n${(() => { const d = new Date(); return `${String(d.getFullYear()).slice(2)}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()} 차트 내용에 연관된 모든 데이터가 삭제됩니다.`}
                    onClose={() => setPendingRollback(null)}
                    onConfirm={async () => {
                        if (rollbackBusyRef.current) return;
                        rollbackBusyRef.current = true;
                        try {
                            await visitService.rollbackReception(pendingRollback.id);
                        } catch (error) {
                            console.error("Failed to rollback reception:", error);
                            setAlertMessage("접수 롤백 실패: " + String(error));
                        } finally {
                            rollbackBusyRef.current = false;
                            await loadAppointments();
                        }
                        setPendingRollback(null);
                    }}
                />
            )}

            {/* Delete Confirmation Modal */}
            {patientToDelete && (
                <ConfirmModal
                    title="접수 삭제"
                    description={`'${patientToDelete.name}' 님의 접수를 삭제하시겠습니까?\n${(() => { const d = new Date(); return `${String(d.getFullYear()).slice(2)}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()} 차트 내용에 연관된 모든 데이터가 삭제됩니다.`}
                    confirmColor="red"
                    onClose={() => setPatientToDelete(null)}
                    onConfirm={confirmDelete}
                    confirmText="삭제"
                />
            )}

            {/* Alert Modal */}
            {quickException && (
                <ConfirmModal
                    title="차트 확인 필요"
                    description={[
                        `${quickException.patient.name}님은 원클릭 처리 예외 대상입니다.`,
                        ...quickException.reasons.map((reason) => `- ${reason}`),
                    ].join("\n")}
                    onClose={() => setQuickException(null)}
                    onConfirm={() => {
                        const targetId = quickException.patient.patientId || quickException.patient.id;
                        setQuickException(null);
                        navigate(`/app/chart-view/${targetId}`);
                    }}
                    confirmText="차트 열기"
                />
            )}

            {/* Reception Form Modal (Directly render ReceptionForm in a modal wrapper) */}
            {selectedReceptionPatient && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1500px] max-h-[85vh] flex flex-col overflow-hidden border border-[#F8DCE2] animate-in fade-in zoom-in-95 duration-200">
                        <ReceptionForm
                            patient={selectedReceptionPatient}
                            isEditMode={receptionEditMode}
                            onClose={() => { setSelectedReceptionPatient(null); setReceptionEditMode(false); }}
                            onConfirm={receptionEditMode ? async (data) => {
                                if (!selectedReceptionPatient) return;
                                try {
                                    const updates: any = {};
                                    if (data.room) updates.room = data.room;
                                    if (typeof data.memo === "string") updates.memo = data.memo;
                                    if (data.doctor) updates.doctorName = data.doctor;
                                    const editPurposeIds = Array.isArray(data.visitPurposeIds) && data.visitPurposeIds.length > 0
                                        ? data.visitPurposeIds.map((v: any) => String(v)).filter(Boolean)
                                        : (data.visitPurposeId ? [String(data.visitPurposeId)] : []);
                                    if (editPurposeIds.length > 0) updates.visitPurposeIds = editPurposeIds;
                                    await visitService.updateVisit(selectedReceptionPatient.id, updates);
                                    await loadAppointments();
                                    setSelectedReceptionPatient(null);
                                    setReceptionEditMode(false);
                                } catch (error) {
                                    console.error("Failed to update reception:", error);
                                    setAlertMessage("접수 정보 저장에 실패했습니다.");
                                }
                            } : handleConfirmReception}
                            onQuickAction={receptionEditMode ? undefined : async (data) => {
                                if (selectedReceptionQueued) {
                                    handleUndoQuickReception();
                                    return;
                                }
                                if (!selectedReceptionPatient) return;
                                const isReservation = selectedReceptionPatient.location === 'reservation';
                                if (isReservation) {
                                    pendingReceptionDataRef.current = data;
                                    void queueQuickReceptionAction(selectedReceptionPatient);
                                } else {
                                    const customerId = Number(selectedReceptionPatient.patientId || 0);
                                    if (!Number.isFinite(customerId) || customerId <= 0) {
                                        setAlertMessage("빠른 차감 대상이 아닙니다. (환자 식별 정보 없음)");
                                        return;
                                    }
                                    try {
                                        const ownedTickets = await ticketService.getTickets(customerId);
                                        const available = (ownedTickets || []).filter((t: any) => (t.remainingCount ?? t.quantity ?? 0) > 0);
                                        if (available.length === 0) {
                                            setAlertMessage("빠른 차감 대상이 아닙니다. (잔여 시술권 없음)");
                                            return;
                                        }
                                    } catch (e) {
                                        console.error("ticket check failed", e);
                                        setAlertMessage("시술권 조회에 실패했습니다.");
                                        return;
                                    }
                                    pendingReceptionDataRef.current = data;
                                    void queueQuickReceptionAction(selectedReceptionPatient);
                                }
                            }}
                            quickActionLabel={selectedReceptionQueued ? "실행 대기 취소" : "빠른 차감/입실"}
                            quickActionDisabled={selectedReceptionQuickDisabled}
                            quickActionBusy={selectedReceptionBusy}
                            onCancelReservation={receptionEditMode ? undefined : () => setReservationCancelTarget(selectedReceptionPatient)}
                        />
                    </div>
                </div>
            )}

            {/* New Patient Registration Modal (for Temporary Patients) */}
            <NewPatientModal
                isOpen={!!selectedNewPatient}
                onClose={() => setSelectedNewPatient(null)}
                initialData={selectedNewPatient ? {
                    name: selectedNewPatient.name,
                    phone: selectedNewPatient.phone,
                } : undefined}
                onConfirm={handleConfirmNewPatient}
            />

            <ReservationCancelModal
                isOpen={!!reservationCancelTarget}
                onClose={() => setReservationCancelTarget(null)}
                onConfirm={(reason, isNoShow) => handleCancelReservationConfirm(reason, isNoShow)}
            />

            {alertMessage && createPortal(
                <ConfirmModal
                    title="알림"
                    description={alertMessage}
                    variant="alert"
                    onClose={() => setAlertMessage(null)}
                    onConfirm={() => setAlertMessage(null)}
                />,
                document.body
            )}
        </div>
    );
}

function ReservationCard({ data, onDragStart, onMouseEnter, onMouseLeave, onClick }: {
    data: Patient;
    onDragStart: (e: React.DragEvent) => void;
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
    onClick: () => void;
}) {
    const navigate = useNavigate();
    return (
        <div
            draggable
            onDragStart={onDragStart}
            onClick={onClick}
            className="kkeut-subtle-card p-3 hover:shadow-[0_18px_34px_rgba(15,23,42,.14)] transition-all cursor-pointer relative group min-h-[120px] flex flex-col justify-between"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="pl-1">
                <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-normal text-gray-400">{data.chartNo}</span>
                        <span className="text-lg font-bold text-gray-900">{data.name}</span>
                        {data.isNew && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/app/chart-view/${data.patientId}`);
                            }}
                            className="ml-1 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-[#D27A8C] transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                        </button>
                    </div>
                    <span className="text-sm font-bold text-[rgb(var(--kkeut-primary-strong))]">{data.time}</span>
                </div>

                {data.reservCategoryName && (
                    <div className="mb-1">
                        <span className="px-1.5 py-0.5 text-[10px] rounded font-medium bg-cyan-50 text-cyan-700">{data.reservCategoryName}</span>
                    </div>
                )}
                {(data.tags || []).length > 0 && (
                    <div className="mb-1 flex flex-wrap items-center gap-1">
                        {data.tags!.map((tag, i) => (
                            <span key={i} className="px-1.5 py-0 text-[10px] rounded font-medium bg-gray-100 text-gray-500">{tag}</span>
                        ))}
                    </div>
                )}
                {data.memo && <div className="text-sm text-gray-600 mb-2">{data.memo}</div>}
                <div className="text-sm text-gray-500 space-y-1">
                    <div>{data.info}</div>
                    {data.history && (
                        <div className="text-xs text-gray-400 pt-2 border-t border-gray-50 mt-1 truncate">
                            {data.history.split('\n')[0]}...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


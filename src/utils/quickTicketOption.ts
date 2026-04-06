import { format } from "date-fns";
import { resolveProcedureQueueSummary, buildProcedureQueueMap, buildProcedureDurationOverrideMap, type ProcedureQueueSummary } from "./todoQueue";

export interface QuickTicketOption {
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

export interface PackageRoundSelection {
    round: number;
    treatments: string[];
}

function normalizeTicketKey(value: unknown): string {
    return String(value ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

function toPositiveInt(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.trunc(n));
}

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

function toPackageRoundSelections(rounds: any): PackageRoundSelection[] {
    if (!Array.isArray(rounds)) return [];
    const options: PackageRoundSelection[] = [];
    for (const round of rounds) {
        const roundNo = Number(round?.round || 0);
        const treatments = Array.isArray(round?.treatments) ? round.treatments : [];
        const normalizedTreatments = treatments.map((value: any) => String(value || "").trim()).filter(Boolean);
        if (normalizedTreatments.length === 0) continue;
        options.push({ round: roundNo, treatments: normalizedTreatments });
    }
    return options;
}

export function canOverrideCycleBlock(option: Pick<QuickTicketOption, "cycleBlocked" | "nextAvailableAt">): boolean {
    return Boolean(option.cycleBlocked && option.nextAvailableAt);
}

export function buildQuickTicketOption(
    ticket: any,
    ticketDefs: any[],
    queueByProcedure: Record<string, ProcedureQueueSummary>,
    plannedTicketIdKeys?: Set<string>,
    plannedTicketNameKeys?: Set<string>
): QuickTicketOption | null {
    const ticketId = String(ticket.id || "");
    if (!ticketId) return null;

    const ticketName = String(ticket.itemName || ticket.name || "시술권");
    const ticketDef = (ticketDefs || []).find((def: any) =>
        normalizeTicketKey(def?.id) === normalizeTicketKey(ticket.itemId) ||
        normalizeTicketKey(def?.code) === normalizeTicketKey(ticket.itemId) ||
        normalizeTicketKey(def?.name) === normalizeTicketKey(ticket.itemName || ticket.name)
    );

    const usageUnit = normalizeTicketKey(ticket.itemType || ticketDef?.usageUnit || "");
    const isPeriod = usageUnit === "period";
    const isPackage = usageUnit === "package";
    const isInactive = ticket.isActive === false;
    const expiryRaw = ticket.expiryDate;

    const minIntervalDays = toPositiveInt(ticket.minIntervalDays ?? ticketDef?.minIntervalDays ?? 0);
    const lastUsedRaw = ticket.lastUsedAt || ticket.lastUsedDate;

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
        const weekTicketName = ticket.weekTicketName || ticket.snapshotWeekTicketName || ticketDef?.weekTicketName;
        const availableDayValue = Number(ticket.availableDayValue ?? ticket.snapshotAvailableDayValue ?? ticketDef?.availableDayValue ?? 0);
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
    const ticketNameKey = normalizeTicketKey(ticket.itemName || ticket.name);
    const pIdKeys = plannedTicketIdKeys || new Set<string>();
    const pNameKeys = plannedTicketNameKeys || new Set<string>();
    const matchedPlanned =
        (pIdKeys.size > 0 && (pIdKeys.has(itemIdKey) || pIdKeys.has(ticketIdKey))) ||
        (pNameKeys.size > 0 && pNameKeys.has(ticketNameKey));

    const autoTodoEnabled = ticketDef ? Boolean(ticketDef.autoTodoEnabled) : true;
    const autoTodoTemplate = String(ticketDef?.autoTodoTitleTemplate || "").trim() || undefined;
    const autoTodoTasks = toStringArray(ticketDef?.autoTodoTasks).map((t) => String(t || "").trim()).filter(Boolean);

    const queueCategoryName = String(ticketDef?.queueCategoryName || ticketDef?.autoTodoProcedureName || "").trim() || undefined;
    const queueDurationMinutes = Math.max(0, Number(ticketDef?.queueDurationMinutes || 0)) || undefined;
    const queueProcedureName = queueCategoryName || ticketName;
    const legacyProcedureName = ticketName;
    const queueSummary =
        resolveProcedureQueueSummary(queueByProcedure, queueProcedureName) ||
        (queueCategoryName ? resolveProcedureQueueSummary(queueByProcedure, legacyProcedureName) : null) ||
        undefined;

    const packageSelections = isPackage ? toPackageRoundSelections(ticketDef?.rounds) : [];
    const defaultPackageRound = Math.max(1, toPositiveInt(ticket.usageCount || 0) + 1);

    return {
        ticketId,
        ticketName,
        remaining: toPositiveInt(ticket.remainingCount ?? ticket.quantity),
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
}

export async function fetchQuickTicketOptions(
    tickets: any[],
    ticketDefs: any[],
    branchId: string,
    dateISO: string
): Promise<QuickTicketOption[]> {
    let queueByProcedure: Record<string, ProcedureQueueSummary> = {};
    try {
        const { procedureTodoStatsService } = await import("../services/procedureTodoStatsService");
        const stats = await procedureTodoStatsService.getDashboard({ branchId, fromDateISO: dateISO, toDateISO: dateISO });
        const procedureDurationOverrides = buildProcedureDurationOverrideMap(ticketDefs);
        queueByProcedure = buildProcedureQueueMap(stats?.byProcedure || [], { averageByProcedureKey: procedureDurationOverrides });
    } catch {}

    return tickets
        .map((ticket) => buildQuickTicketOption(ticket, ticketDefs, queueByProcedure))
        .filter((opt): opt is QuickTicketOption => opt !== null && opt.remaining > 0)
        .sort((a, b) => {
            if (Number(a.cycleBlocked) !== Number(b.cycleBlocked)) return Number(a.cycleBlocked) - Number(b.cycleBlocked);
            return b.remaining - a.remaining;
        });
}

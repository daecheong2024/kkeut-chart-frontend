import type { ProcedureTodoProcedureStats } from "../types/procedureTodoStats";

export type ProcedureQueueSummary = {
  procedureKey: string;
  procedureName: string;
  todoCount: number;
  doingCount: number;
  doneCount: number;
  averageWorkMinutes: number;
  estimatedWaitMinutes: number;
};

type QueueBuildOptions = {
  fallbackAverageMinutes?: number;
  doingWeight?: number;
  capacityByProcedureKey?: Record<string, number>;
  averageByProcedureKey?: Record<string, number>;
};

type TicketQueueRuleLike = {
  name?: string;
  autoTodoProcedureName?: string;
  queueCategoryName?: string;
  queueDurationMinutes?: number;
};

export function normalizeQueueProcedureKey(value?: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[()[\]{}\/\\+_:\-·]/g, " ")
    .replace(/\s+/g, "_");
  return normalized || "etc";
}

export function buildProcedureQueueMap(
  rows?: ProcedureTodoProcedureStats[] | null,
  options?: QueueBuildOptions
): Record<string, ProcedureQueueSummary> {
  const fallbackAverage = Math.max(1, Number(options?.fallbackAverageMinutes || 20));
  const doingWeight = Math.min(1, Math.max(0, Number(options?.doingWeight || 0.5)));
  const capacityByKey = options?.capacityByProcedureKey || {};
  const averageByKey = options?.averageByProcedureKey || {};

  const map: Record<string, ProcedureQueueSummary> = {};
  for (const row of rows || []) {
    const procedureName = String(row?.procedureName || "").trim() || "기타";
    const procedureKey = normalizeQueueProcedureKey(row?.procedureKey || procedureName);
    const todoCount = Math.max(0, Number(row?.todoCount || 0));
    const doingCount = Math.max(0, Number(row?.doingCount || 0));
    const doneCount = Math.max(0, Number(row?.doneCount || 0));
    const configuredAverage = Math.max(0, Number(averageByKey[procedureKey] || 0));
    const avg =
      configuredAverage ||
      Math.max(0, Number(row?.averageWorkMinutes || 0)) ||
      fallbackAverage;
    const capacity = Math.max(1, Number(capacityByKey[procedureKey] || 1));

    const pendingMinutes = todoCount * avg + doingCount * Math.max(5, avg * doingWeight);
    const estimatedWaitMinutes = Math.max(0, Math.round(pendingMinutes / capacity));

    map[procedureKey] = {
      procedureKey,
      procedureName,
      todoCount,
      doingCount,
      doneCount,
      averageWorkMinutes: avg,
      estimatedWaitMinutes,
    };
  }

  return map;
}

export function buildProcedureDurationOverrideMap(
  ticketItems?: TicketQueueRuleLike[] | null
): Record<string, number> {
  const durationsByKey: Record<string, number[]> = {};
  for (const item of ticketItems || []) {
    const categoryName = String(
      item?.queueCategoryName || item?.autoTodoProcedureName || item?.name || ""
    ).trim();
    const duration = Math.max(0, Number(item?.queueDurationMinutes || 0));
    if (!categoryName || duration <= 0) continue;

    const key = normalizeQueueProcedureKey(categoryName);
    if (!durationsByKey[key]) durationsByKey[key] = [];
    durationsByKey[key]!.push(duration);
  }

  const overrides: Record<string, number> = {};
  Object.entries(durationsByKey).forEach(([key, values]) => {
    if (!values || values.length === 0) return;
    const sum = values.reduce((acc, n) => acc + n, 0);
    overrides[key] = Math.max(1, Math.round(sum / values.length));
  });
  return overrides;
}

export function resolveProcedureQueueSummary(
  map: Record<string, ProcedureQueueSummary>,
  procedureNameOrKey?: string
): ProcedureQueueSummary | null {
  const key = normalizeQueueProcedureKey(procedureNameOrKey);
  return map[key] || null;
}

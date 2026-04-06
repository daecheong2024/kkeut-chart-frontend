import type {
  ChartStatusRules,
  ChartStatusTransitionRule,
  StatusItem,
  StatusTransitionActionType,
} from "../types/settings";

export const STATUS_TRANSITION_ANY_LOCATION = "*";

const normalize = (value?: string | null) => String(value || "").trim().toLowerCase();

const isEnabledStatus = (statusId: string, statuses?: StatusItem[]) => {
  const normalized = normalize(statusId);
  if (!normalized) return false;
  if (!statuses || statuses.length === 0) return true;

  return statuses.some((status) => {
    if (status.enabled === false) return false;
    return normalize(status.id) === normalized;
  });
};

const resolveStartProgressFallback = (statusRules?: ChartStatusRules, statuses?: StatusItem[]) => {
  const configured = String(statusRules?.startProgressStatusId || "").trim();
  if (configured && isEnabledStatus(configured, statuses)) return configured;

  const enabledStatuses = (statuses || []).filter((status) => status.enabled);
  const keywordMatched = enabledStatuses.find((status) =>
    /proc|treatment|진행|시술/i.test(`${status.id} ${status.label}`)
  );
  if (keywordMatched?.id) return keywordMatched.id;

  return configured || "proc";
};

const resolveSendFallback = (statusRules?: ChartStatusRules, statuses?: StatusItem[]) => {
  const configured = String(statusRules?.sendDefaultStatusId || "").trim();
  if (configured && isEnabledStatus(configured, statuses)) return configured;
  return configured || "wait";
};

const resolveTabletFallback = (statusRules?: ChartStatusRules, statuses?: StatusItem[]) => {
  const configured = String(statusRules?.tabletReceptionStatusId || "").trim();
  if (configured && isEnabledStatus(configured, statuses)) return configured;
  return configured || "wait";
};

const getRuleSpecificity = (
  rule: ChartStatusTransitionRule,
  actionType: StatusTransitionActionType,
  fromLocationId?: string | null,
  toLocationId?: string | null
) => {
  const action = normalize(rule.actionType);
  const from = normalize(rule.fromLocationId);
  const to = normalize(rule.toLocationId);
  const targetAction = normalize(actionType);
  const targetFrom = normalize(fromLocationId);
  const targetTo = normalize(toLocationId);

  if (action !== "any" && action !== targetAction) return -1;
  if (from !== STATUS_TRANSITION_ANY_LOCATION && from !== targetFrom) return -1;
  if (to !== STATUS_TRANSITION_ANY_LOCATION && to !== targetTo) return -1;

  let score = 0;
  score += action === targetAction ? 100 : 10;
  score += from === targetFrom ? 10 : 1;
  score += to === targetTo ? 10 : 1;
  return score;
};

export interface ResolveTransitionStatusParams {
  actionType: StatusTransitionActionType;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  currentStatus?: string | null;
  statusRules?: ChartStatusRules;
  statuses?: StatusItem[];
}

export function resolveTransitionStatus({
  actionType,
  fromLocationId,
  toLocationId,
  currentStatus,
  statusRules,
  statuses,
}: ResolveTransitionStatusParams): string {
  const activeRules = (statusRules?.statusTransitions || []).filter((rule) => rule.enabled !== false);
  const matched = activeRules
    .map((rule, index) => ({
      rule,
      index,
      specificity: getRuleSpecificity(rule, actionType, fromLocationId, toLocationId),
    }))
    .filter((item) => item.specificity >= 0)
    .sort((a, b) => {
      if (b.specificity !== a.specificity) return b.specificity - a.specificity;
      const ao = Number.isFinite(Number(a.rule.order)) ? Number(a.rule.order) : a.index;
      const bo = Number.isFinite(Number(b.rule.order)) ? Number(b.rule.order) : b.index;
      return ao - bo;
    });

  for (const item of matched) {
    const candidate = String(item.rule.defaultStatusId || "").trim();
    if (candidate && isEnabledStatus(candidate, statuses)) {
      return candidate;
    }
  }

  if (actionType === "quick_reception" || actionType === "start_progress") {
    return resolveStartProgressFallback(statusRules, statuses);
  }

  if (actionType === "send") {
    return resolveSendFallback(statusRules, statuses);
  }

  if (actionType === "tablet_reception") {
    return resolveTabletFallback(statusRules, statuses);
  }

  const current = String(currentStatus || "").trim();
  if (current && isEnabledStatus(current, statuses)) return current;

  return resolveSendFallback(statusRules, statuses);
}

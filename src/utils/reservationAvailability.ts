import type { KioskTicket } from "../services/kioskService";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_EN_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_EN_LONG = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DEFAULT_CATEGORY_DAY_RANGE = "09:00~18:00";

export interface ReservationCategoryLike {
  id?: string;
  interval?: number;
  days?: string[];
  operatingHours?: Record<string, string>;
  breakHours?: Record<string, string>;
  startDate?: string;
  endDate?: string;
  useEndDate?: boolean;
}

export type TicketCycleState = {
  canReserve: boolean;
  isExpired: boolean;
  intervalBlocked: boolean;
  nextAvailableAt?: Date;
  message: string;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const pad2 = (value: number): string => String(value).padStart(2, "0");

const normalizeWeekdayToken = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const toMinutes = (time: string): number => {
  const [hour, minute] = String(time || "").split(":");
  return (parseInt(hour || "0", 10) * 60) + parseInt(minute || "0", 10);
};

const formatMinutesAsTime = (minutes: number): string =>
  `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

const getWeekdayKeys = (date: Date): string[] => {
  const index = date.getDay();
  return [WEEKDAY_KO[index], WEEKDAY_EN_SHORT[index], WEEKDAY_EN_LONG[index], String(index)].filter(
    (value): value is string => Boolean(value)
  );
};

const getDayValue = (source: Record<string, string> | undefined, date: Date): string | undefined => {
  if (!source) return undefined;

  const keys = getWeekdayKeys(date);
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const normalizedKeys = new Set(keys.map(normalizeWeekdayToken));
  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (!normalizedKeys.has(normalizeWeekdayToken(rawKey))) continue;
    if (typeof rawValue === "string" && rawValue.trim()) {
      return rawValue.trim();
    }
  }

  return undefined;
};

const parseTimeRange = (range?: string | null): { start: number; end: number } | null => {
  if (!range) return null;

  const normalized = String(range).replace("-", "~");
  const [start, end] = normalized.split("~").map((value) => value.trim());
  if (!start || !end) return null;

  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (endMinutes <= startMinutes) return null;

  return { start: startMinutes, end: endMinutes };
};

export const formatDateOnly = (value?: string | Date | null): string => {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
};

export const isCategoryActiveOnDate = (category: ReservationCategoryLike | null | undefined, date: Date): boolean => {
  if (!category) return true;

  const targetDate = startOfDay(date);

  if (category.startDate) {
    const startDate = startOfDay(new Date(category.startDate));
    if (!Number.isNaN(startDate.getTime()) && targetDate < startDate) {
      return false;
    }
  }

  if (category.useEndDate && category.endDate) {
    const endDate = startOfDay(new Date(category.endDate));
    if (!Number.isNaN(endDate.getTime()) && targetDate > endDate) {
      return false;
    }
  }

  const configuredDays = Array.isArray(category.days)
    ? category.days.map((value) => String(value)).filter(Boolean)
    : [];
  if (configuredDays.length > 0) {
    const daySet = new Set(configuredDays.map(normalizeWeekdayToken));
    const matches = getWeekdayKeys(targetDate).some((key) => daySet.has(normalizeWeekdayToken(key)));
    if (!matches) {
      return false;
    }
  }

  const hasOperatingHours = !!category.operatingHours && Object.keys(category.operatingHours).length > 0;
  const operatingHours = getDayValue(category.operatingHours, targetDate);
  if (hasOperatingHours && !operatingHours) {
    return false;
  }

  return true;
};

const resolveCategoryInterval = (
  category: ReservationCategoryLike | null | undefined,
  selectedTickets: KioskTicket[],
  categoryId: string
): number => {
  const categoryInterval = Number(category?.interval || 0);
  if (Number.isFinite(categoryInterval) && categoryInterval > 0) {
    return Math.max(5, categoryInterval);
  }

  for (const ticket of selectedTickets) {
    const matchedCategory = (ticket.categories || []).find((item) => String(item.id) === String(categoryId));
    const ticketInterval = Number(matchedCategory?.interval || 0);
    if (Number.isFinite(ticketInterval) && ticketInterval > 0) {
      return Math.max(5, ticketInterval);
    }
  }

  return 30;
};

const isTicketAllowedAtTime = (ticket: KioskTicket, date: Date, slotMinutes: number): boolean => {
  const allowedDays = Array.isArray(ticket.allowedDays)
    ? ticket.allowedDays.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6)
    : [];
  if (allowedDays.length > 0 && !allowedDays.includes(date.getDay())) {
    return false;
  }

  const hasTimeRestriction = !!ticket.allowedTimeRange?.start || !!ticket.allowedTimeRange?.end;
  if (!hasTimeRestriction) {
    return true;
  }

  const start = ticket.allowedTimeRange?.start ? toMinutes(ticket.allowedTimeRange.start) : 0;
  const end = ticket.allowedTimeRange?.end ? toMinutes(ticket.allowedTimeRange.end) : (23 * 60) + 59;
  return slotMinutes >= start && slotMinutes <= end;
};

export const buildAllowedTimesForCategory = (
  category: ReservationCategoryLike | null | undefined,
  date: Date,
  hospitalOperatingHours: Record<string, string> | undefined,
  selectedTickets: KioskTicket[]
): string[] => {
  const targetDate = startOfDay(date);
  if (category && !isCategoryActiveOnDate(category, date)) {
    return [];
  }

  const hasCategoryOperatingHours = !!category?.operatingHours && Object.keys(category.operatingHours).length > 0;
  const categoryRange = category ? getDayValue(category.operatingHours, targetDate) : undefined;
  if (category && hasCategoryOperatingHours && !categoryRange) {
    return [];
  }

  const openRange = parseTimeRange(
    categoryRange || getDayValue(hospitalOperatingHours, targetDate) || DEFAULT_CATEGORY_DAY_RANGE
  );
  if (!openRange) {
    return [];
  }

  const breakRange = category ? parseTimeRange(getDayValue(category.breakHours, targetDate)) : null;
  const interval = resolveCategoryInterval(category, selectedTickets, String(category?.id || ""));
  const now = new Date();
  const isToday = startOfDay(now).getTime() === targetDate.getTime();
  const minSlot = (now.getHours() * 60) + now.getMinutes();
  const slots: string[] = [];

  for (let minute = openRange.start; minute + interval <= openRange.end; minute += interval) {
    const slotEnd = minute + interval;
    if (isToday && minute < minSlot) {
      continue;
    }
    if (breakRange && minute < breakRange.end && slotEnd > breakRange.start) {
      continue;
    }
    if (!selectedTickets.every((ticket) => isTicketAllowedAtTime(ticket, targetDate, minute))) {
      continue;
    }
    slots.push(formatMinutesAsTime(minute));
  }

  return slots;
};

export const pickNearestAllowedTime = (current: string, allowedTimes: string[]): string => {
  if (allowedTimes.length === 0) return "";
  if (allowedTimes.includes(current)) return current;

  const currentMinutes = /^\d{2}:\d{2}$/.test(current)
    ? toMinutes(current)
    : toMinutes(allowedTimes[0] || "00:00");

  let nearest = allowedTimes[0] || "";
  let nearestDiff = Number.MAX_SAFE_INTEGER;

  for (const time of allowedTimes) {
    const diff = Math.abs(toMinutes(time) - currentMinutes);
    if (diff < nearestDiff) {
      nearest = time;
      nearestDiff = diff;
    }
  }

  return nearest;
};

export const evaluateTicketCycleState = (ticket: KioskTicket, targetDate: Date): TicketCycleState => {
  const target = startOfDay(targetDate);

  if ((ticket.remainingCount || 0) <= 0) {
    return {
      canReserve: false,
      isExpired: false,
      intervalBlocked: false,
      message: "잔여 횟수가 없어 예약할 수 없습니다.",
    };
  }

  if (ticket.expiryDate) {
    const expiry = startOfDay(new Date(ticket.expiryDate));
    if (!Number.isNaN(expiry.getTime()) && target > expiry) {
      return {
        canReserve: false,
        isExpired: true,
        intervalBlocked: false,
        message: `만료된 시술권입니다. (만료일: ${formatDateOnly(ticket.expiryDate)})`,
      };
    }
  }

  if ((ticket.minIntervalDays || 0) > 0 && ticket.lastUsedDate) {
    const lastUsed = startOfDay(new Date(ticket.lastUsedDate));
    if (!Number.isNaN(lastUsed.getTime())) {
      const nextAvailableAt = new Date(lastUsed);
      nextAvailableAt.setDate(nextAvailableAt.getDate() + (ticket.minIntervalDays || 0));
      if (target < nextAvailableAt) {
        return {
          canReserve: false,
          isExpired: false,
          intervalBlocked: true,
          nextAvailableAt,
          message: `주기 미충족: 다음 가능일 ${formatDateOnly(nextAvailableAt)}`,
        };
      }
    }
  }

  return {
    canReserve: true,
    isExpired: false,
    intervalBlocked: false,
    message: "예약 가능한 시술권입니다.",
  };
};

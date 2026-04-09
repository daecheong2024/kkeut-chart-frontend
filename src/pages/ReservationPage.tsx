
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
    format, addDays, startOfWeek, endOfWeek, eachDayOfInterval,
    isSameDay, startOfMonth, endOfMonth, getDay, isSameMonth,
    addMonths, subMonths, addWeeks, subWeeks, startOfDay, addMinutes, subDays,
    differenceInYears
} from 'date-fns';
import { ko } from "date-fns/locale";
import {
    Search, ChevronLeft, ChevronRight, Settings,
    Calendar as CalendarIcon, Filter, CheckCircle2, Circle, PlusIcon
} from "lucide-react";
import { useHospitalTaskStore, TaskItem } from "../stores/useHospitalTaskStore";
import { cn } from "../lib/cn";
import { TopBar } from '../components/layout/TopBar';
import { useLocation } from 'react-router-dom';
import ReservationDetailPanel from './ReservationDetailPanel';
import { ReservationSettingsModal } from './ReservationSettingsModal';
import { useChartStore } from '../stores/useChartStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAppShell } from '../components/layout/AppShellContext';
import { visitService } from '../services/visitService';
import { hospitalSettingsService } from '../services/hospitalSettingsService';
import { useAlert } from '../components/ui/AlertDialog';
import { useCurrentUserPermissions } from "../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../components/common/NoPermissionOverlay";

/* ==============================
   Mobile-friendly content blocks
   ============================== */

type MobileReservationContentProps = {
    currentDate: Date;
    viewMode: 'day' | 'week' | 'month';
    setViewMode: (m: 'day' | 'week' | 'month') => void;
    setCurrentDate: (d: Date) => void;
    appointments: any[];
    procedureCategories: any[];
    tasks: TaskItem[];
    isTaskOpen: boolean;
    setIsTaskOpen: (v: boolean) => void;
    onSelectAppointment: (appt: any) => void;
    onCreate: () => void;
};

function MobileReservationContent({
    currentDate,
    viewMode,
    setViewMode,
    setCurrentDate,
    appointments,
    procedureCategories,
    tasks,
    isTaskOpen,
    setIsTaskOpen,
    onSelectAppointment,
    onCreate,
}: MobileReservationContentProps) {
    const colNameById = useMemo(() => {
        const m = new Map<string, string>();
        (procedureCategories || []).forEach((c: any) => {
            if (c?.id) m.set(String(c.id), String(c.name ?? c.id));
        });
        return m;
    }, [procedureCategories]);

    if (viewMode === 'week') {
        return (
            <MobileWeekList
                currentDate={currentDate}
                onPickDay={(d) => {
                    setCurrentDate(d);
                    setViewMode('day');
                }}
            />
        );
    }

    if (viewMode === 'month') {
        return (
            <MobileMonthGrid
                currentDate={currentDate}
                onPickDay={(d) => {
                    setCurrentDate(d);
                    setViewMode('day');
                }}
            />
        );
    }

    return (
        <MobileDayList
            currentDate={currentDate}
            appointments={appointments}
            colNameById={colNameById}
            tasks={tasks}
            isTaskOpen={isTaskOpen}
            setIsTaskOpen={setIsTaskOpen}
            onSelectAppointment={onSelectAppointment}
            onCreate={onCreate}
        />
    );
}

function timeToMinutes(time: string) {
    const [hh, mm] = String(time).split(':');
    const h = Number(hh || 0);
    const m = Number(mm || 0);
    return h * 60 + m;
}

function parseScheduleDateTime(value: unknown): Date | null {
    if (!value) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const primary = new Date(raw);
    if (!Number.isNaN(primary.getTime())) return primary;

    const normalized = raw.includes(' ') && !raw.includes('T')
        ? raw.replace(' ', 'T')
        : raw;
    const fallback = new Date(normalized);
    if (!Number.isNaN(fallback.getTime())) return fallback;

    return null;
}

function isNewVisitAppointment(value: any): boolean {
    if (typeof value?.isFirstVisit === 'boolean') return value.isFirstVisit;
    if (typeof value?.firstVisit === 'boolean') return value.firstVisit;

    const firstVisitRaw = value?.isFirstVisit ?? value?.firstVisit;
    if (typeof firstVisitRaw === 'number') return firstVisitRaw > 0;
    if (typeof firstVisitRaw === 'string') {
        const normalized = firstVisitRaw.trim().toLowerCase();
        if (['true', '1', 'y', 'yes'].includes(normalized)) return true;
        if (['false', '0', 'n', 'no'].includes(normalized)) return false;
    }

    const normalizedType = String(value?.type ?? value?.visitType ?? '').trim().toLowerCase();
    if (normalizedType === 'new' || normalizedType === 'first' || normalizedType === 'initial' || normalizedType === '초진') return true;
    if (normalizedType === 'revisit' || normalizedType === 'return' || normalizedType === '재진') return false;

    const normalizedCategory = String(value?.category ?? '').trim().toLowerCase();
    if (normalizedCategory === 'new' || normalizedCategory === '초진') return true;
    if (normalizedCategory === 'revisit' || normalizedCategory === '재진') return false;

    return false;
}

function matchesVisitTypeColumn(value: any, colId: string): boolean {
    const isNew = isNewVisitAppointment(value);
    return colId === 'new' ? isNew : !isNew;
}

function MobileDayList({
    currentDate,
    appointments,
    colNameById,
    tasks,
    isTaskOpen,
    setIsTaskOpen,
    onSelectAppointment,
    onCreate,
}: {
    currentDate: Date;
    appointments: any[];
    colNameById: Map<string, string>;
    tasks: TaskItem[];
    isTaskOpen: boolean;
    setIsTaskOpen: (v: boolean) => void;
    onSelectAppointment: (appt: any) => void;
    onCreate: () => void;
}) {
    const sorted = useMemo(() => {
        return [...(appointments || [])].sort((a, b) => {
            const t = timeToMinutes(a?.time) - timeToMinutes(b?.time);
            if (t !== 0) return t;
            return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
        });
    }, [appointments]);

    const grouped = useMemo(() => {
        const g = new Map<string, any[]>();
        sorted.forEach((a) => {
            const key = String(a?.time ?? '');
            if (!g.has(key)) g.set(key, []);
            g.get(key)!.push(a);
        });
        return g;
    }, [sorted]);

    const times = useMemo(() => {
        return Array.from(grouped.keys()).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    }, [grouped]);

    return (
        <div className="flex-1 overflow-auto bg-gray-50">
            {/* Tasks accordion (mobile) */}
            <div className="bg-white border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-extrabold text-gray-900">{format(currentDate, 'M월 d일 (eee)', { locale: ko })}</div>
                        <div className="text-xs text-gray-500">예약 {appointments?.length ?? 0}건</div>
                    </div>
                    <button
                        onClick={onCreate}
                        className="px-3 py-2 rounded-xl bg-[#E26B7C] text-white text-xs font-bold hover:bg-[#99354E]"
                    >
                        예약 등록
                    </button>
                </div>

                <button
                    onClick={() => setIsTaskOpen(!isTaskOpen)}
                    className="mt-3 w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
                >
                    <span className="text-xs font-bold text-gray-700">업무 {tasks.length}</span>
                    <ChevronRight className={cn("w-4 h-4 text-gray-500 transition-transform", isTaskOpen ? "rotate-90" : "-rotate-90")} />
                </button>
                {isTaskOpen && (
                    <div className="mt-2 space-y-2">
                        {tasks.length === 0 ? (
                            <div className="text-xs text-gray-500 px-1">등록된 업무가 없습니다.</div>
                        ) : (
                            tasks.map((t) => (
                                <div key={t.id} className="rounded-2xl border border-gray-100 bg-white px-3 py-2">
                                    <div className="text-xs font-semibold text-gray-900 whitespace-pre-wrap">{t.content}</div>
                                    {t.subContent && <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{t.subContent}</div>}
                                    <div className="mt-1 text-[10px] text-gray-400">{t.author}</div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Day list */}
            <div className="p-4 space-y-3">
                {times.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                        <div className="text-sm font-bold text-gray-800">예약이 없습니다</div>
                        <div className="mt-1 text-xs text-gray-500">좌측 상단에서 예약 등록 버튼을 눌러 추가해보세요.</div>
                    </div>
                ) : (
                    times.map((time) => {
                        const items = grouped.get(time) || [];
                        return (
                            <div key={time} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                                    <div className="text-xs font-extrabold text-gray-800">{time}</div>
                                    <div className="text-[10px] font-bold text-[#E26B7C]">{items.length}건</div>
                                </div>
                                <div className="p-3 space-y-2">
                                    {items.map((a) => {
                                        const type = a?.type === 'new' ? '초진' : '재진';
                                        const typeClass = a?.type === 'new'
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            : 'bg-blue-50 text-blue-600 border-blue-100';

                                        const cat = colNameById.get(String(a?.colId)) || a?.title || '미정';
                                        const cancelled = a?.status === 'cancelled';
                                        return (
                                            <button
                                                key={a.id}
                                                onClick={() => onSelectAppointment(a)}
                                                className={cn(
                                                    "w-full text-left rounded-2xl border px-4 py-3 transition-shadow hover:shadow-md",
                                                    cancelled ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
                                                )}
                                                style={{ borderLeft: `6px solid ${getVisitColor(String(a?.type))}` }}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className={cn("text-sm font-extrabold text-gray-900 truncate", cancelled && "line-through text-gray-500")}>
                                                            {a?.name}
                                                        </div>
                                                        <div className="mt-1 text-xs text-gray-600">{a?.age ?? '-'}</div>
                                                        <div className="mt-1 text-xs text-gray-500 truncate">{cat}</div>
                                                    </div>
                                                    <div className="shrink-0 flex flex-col items-end gap-2">
                                                        <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border", typeClass)}>{type}</span>
                                                        {cancelled && <span className="text-[10px] font-bold text-gray-500">취소</span>}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function MobileWeekList({
    currentDate,
    onPickDay,
}: {
    currentDate: Date;
    onPickDay: (d: Date) => void;
}) {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });
    const weekDays = eachDayOfInterval({ start, end });

    return (
        <div className="flex-1 overflow-auto bg-gray-50 p-4">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <div className="text-sm font-extrabold text-gray-900">주간 보기</div>
                    <div className="text-xs text-gray-500">날짜를 누르면 일간 보기로 이동합니다.</div>
                </div>
                <div className="p-3 space-y-2">
                    {weekDays.map((d) => {
                        const seed = (d.getFullYear() * 10000) + ((d.getMonth() + 1) * 100) + d.getDate();
                        const count = (seed * 17) % 24; // 0~23
                        const isToday = isSameDay(d, new Date());
                        const isSelected = isSameDay(d, currentDate);
                        return (
                            <button
                                key={d.toISOString()}
                                onClick={() => onPickDay(d)}
                                className={cn(
                                    "w-full flex items-center justify-between rounded-2xl border px-4 py-3",
                                    isSelected ? "border-violet-300 bg-[#FCEBEF]" : "border-gray-200 bg-white",
                                    isToday && !isSelected ? "ring-1 ring-blue-200" : ""
                                )}
                            >
                                <div className="text-left">
                                    <div className="text-sm font-extrabold text-gray-900">{format(d, 'M월 d일 (eee)', { locale: ko })}</div>
                                    {isToday && <div className="text-xs text-blue-600 font-bold">오늘</div>}
                                </div>
                                <div className="text-xs font-bold text-gray-700">{count}건</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function MobileMonthGrid({
    currentDate,
    onPickDay,
}: {
    currentDate: Date;
    onPickDay: (d: Date) => void;
}) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    return (
        <div className="flex-1 overflow-auto bg-gray-50 p-4">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <div className="text-sm font-extrabold text-gray-900">월간 보기</div>
                    <div className="text-xs text-gray-500">날짜를 누르면 일간 보기로 이동합니다.</div>
                </div>

                <div className="grid grid-cols-7 gap-1 p-3 text-center text-[11px] font-bold text-gray-500">
                    {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                        <div key={d} className={cn(d === '일' ? 'text-red-500' : '')}>{d}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1 px-3 pb-3">
                    {days.map((d) => {
                        const inMonth = isSameMonth(d, currentDate);
                        const isSelected = isSameDay(d, currentDate);
                        const seed = (d.getFullYear() * 10000) + ((d.getMonth() + 1) * 100) + d.getDate();
                        const count = (seed * 7) % 18; // 0~17
                        return (
                            <button
                                key={d.toISOString()}
                                onClick={() => onPickDay(d)}
                                className={cn(
                                    "aspect-square rounded-2xl border flex flex-col items-center justify-center",
                                    inMonth ? "bg-white" : "bg-gray-50",
                                    isSelected ? "border-violet-300 bg-[#FCEBEF]" : "border-gray-200",
                                )}
                            >
                                <div className={cn("text-xs font-extrabold", inMonth ? "text-gray-900" : "text-gray-300")}>{format(d, 'd')}</div>
                                <div className={cn("text-[10px] font-bold", inMonth ? "text-gray-500" : "text-gray-300")}>{count}</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

const VISIT_TYPE_COLUMNS = [
    { id: 'new', label: '초진', count: 0 },
    { id: 'revisit', label: '재진', count: 0 },
];

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
const WEEKDAY_EN_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEKDAY_EN_LONG = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DEFAULT_DAY_RANGE = '09:00~18:00';
const DEFAULT_SLOT_INTERVAL = 30;

function normalizeDateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeWeekdayToken(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function getWeekdayKeys(date: Date): string[] {
    const dayIndex = date.getDay();
    return [
        WEEKDAY_KO[dayIndex],
        WEEKDAY_EN_SHORT[dayIndex],
        WEEKDAY_EN_LONG[dayIndex],
        String(dayIndex),
    ].filter((v): v is string => Boolean(v));
}

function parseRange(range?: string): { start: number; end: number } | null {
    if (!range) return null;
    const normalized = String(range).replace('-', '~');
    const [start, end] = normalized.split('~').map((v) => v.trim());
    if (!start || !end) return null;
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (endMin <= startMin) return null;
    return { start: startMin, end: endMin };
}

function formatMinutesAsTime(minutes: number): string {
    const hh = Math.floor(minutes / 60).toString().padStart(2, '0');
    const mm = (minutes % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
}

function getDayValue(source: Record<string, any> | undefined, date: Date): string | undefined {
    if (!source) return undefined;
    const dayKeys = getWeekdayKeys(date);

    for (const key of dayKeys) {
        const v = source[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }

    const normalizedKeys = new Set(dayKeys.map(normalizeWeekdayToken));
    for (const [rawKey, rawValue] of Object.entries(source)) {
        if (!normalizedKeys.has(normalizeWeekdayToken(rawKey))) continue;
        if (typeof rawValue === 'string' && rawValue.trim()) return rawValue.trim();
    }

    return undefined;
}

function isCategoryActiveOnDate(category: any, date: Date): boolean {
    const targetDate = normalizeDateOnly(date);

    if (category?.startDate) {
        const startDate = normalizeDateOnly(new Date(category.startDate));
        if (!Number.isNaN(startDate.getTime()) && targetDate < startDate) return false;
    }

    if (category?.useEndDate && category?.endDate) {
        const endDate = normalizeDateOnly(new Date(category.endDate));
        if (!Number.isNaN(endDate.getTime()) && targetDate > endDate) return false;
    }

    const days = Array.isArray(category?.days)
        ? category.days.map((d: unknown) => String(d)).filter(Boolean)
        : [];
    if (days.length > 0) {
        const daySet = new Set(days.map(normalizeWeekdayToken));
        const matchesDay = getWeekdayKeys(targetDate).some((k) => daySet.has(normalizeWeekdayToken(k)));
        if (!matchesDay) return false;
    }

    const hasOperatingHours = !!category?.operatingHours && Object.keys(category.operatingHours).length > 0;
    const operatingHours = getDayValue(category?.operatingHours, targetDate);
    if (hasOperatingHours && !operatingHours) return false;

    return true;
}

function resolveSlotIntervalForDate(categories: any[], _date: Date): number {
    const intervals = (categories || [])
        .map((c) => Number(c?.interval || 0))
        .filter((v) => Number.isFinite(v) && v > 0);

    if (intervals.length === 0) return DEFAULT_SLOT_INTERVAL;
    return Math.max(5, Math.min(...intervals));
}

function buildTimeSlotsForDate(
    categories: any[],
    date: Date,
    hospitalOperatingHours?: Record<string, any>
): string[] {
    const targetDate = normalizeDateOnly(date);
    const allCategories = categories || [];
    const hospitalDayRange = parseRange(getDayValue(hospitalOperatingHours, targetDate) || DEFAULT_DAY_RANGE) || { start: 9 * 60, end: 18 * 60 };
    const fallbackRangeString = `${formatMinutesAsTime(hospitalDayRange.start)}~${formatMinutesAsTime(hospitalDayRange.end)}`;

    const ranges = allCategories
        .map((category) => {
            const dayOpenHours = getDayValue(category?.operatingHours, targetDate);
            return parseRange(dayOpenHours || fallbackRangeString);
        })
        .filter((v): v is { start: number; end: number } => Boolean(v));

    const fallback = hospitalDayRange;
    const startMin = ranges.length > 0 ? Math.min(...ranges.map((r) => r.start)) : fallback.start;
    const endMin = ranges.length > 0 ? Math.max(...ranges.map((r) => r.end)) : fallback.end;

    const interval = resolveSlotIntervalForDate(allCategories, targetDate);
    const slots: string[] = [];
    for (let m = startMin; m + interval <= endMin; m += interval) {
        const hh = Math.floor(m / 60).toString().padStart(2, '0');
        const mm = (m % 60).toString().padStart(2, '0');
        slots.push(`${hh}:${mm}`);
    }

    if (slots.length > 0) return slots;

    const safeFallback: string[] = [];
    for (let m = fallback.start; m + DEFAULT_SLOT_INTERVAL <= fallback.end; m += DEFAULT_SLOT_INTERVAL) {
        const hh = Math.floor(m / 60).toString().padStart(2, '0');
        const mm = (m % 60).toString().padStart(2, '0');
        safeFallback.push(`${hh}:${mm}`);
    }
    return safeFallback;
}

function getCategoryCapacityForDate(category: any, date: Date): number {
    const fallback = Number(category?.reservationCount || 0);
    const days = Array.isArray(category?.days) ? category.days as string[] : [];
    const daily = category?.dailyReservationCounts as Record<string, number> | undefined;
    const dayIndex = date.getDay();
    const dayKo = WEEKDAY_KO[dayIndex];

    if (days.length > 0 && dayKo && !days.includes(dayKo)) {
        return 0;
    }

    if (daily && typeof daily === 'object') {
        const keys = [
            dayKo,
            WEEKDAY_EN_SHORT[dayIndex],
            WEEKDAY_EN_LONG[dayIndex],
            String(dayIndex)
        ].filter((key): key is string => typeof key === 'string');

        for (const key of keys) {
            const raw = daily[key];
            const value = typeof raw === 'number' ? raw : Number(raw);
            if (Number.isFinite(value) && value > 0) {
                return value;
            }
        }
    }

    if (fallback > 0) return fallback;
    return 0;
}

// Appointments - load from backend
export default function ReservationPage() {
    const { showAlert } = useAlert();
    const location = useLocation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
    const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
    const [initialPatient, setInitialPatient] = useState<any>(null);
    const [createCellInfo, setCreateCellInfo] = useState<{ categoryId?: string; date?: Date; time?: string } | null>(null);
    const [appointments, setAppointments] = useState<any[]>([]);

    // Handle patient data from navigation state (e.g. from search modal reservation button)
    const consumedStateRef = useRef<string | null>(null);
    useEffect(() => {
        const state = location.state as any;
        if (state?.reservePatient && JSON.stringify(state.reservePatient) !== consumedStateRef.current) {
            consumedStateRef.current = JSON.stringify(state.reservePatient);
            setInitialPatient(state.reservePatient);
            setIsCreatePanelOpen(true);
            // Clear the state to prevent re-triggering
            window.history.replaceState({}, '');
        }
    }, [location.state]);

    // View Mode State (Hoisted for use in fetchAppointments)
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
    const [groupingMode, setGroupingMode] = useState<'category' | 'visitType'>('category');
    const dayGridScrollRef = useRef<HTMLDivElement | null>(null);
    const dayAutoScrollKeyRef = useRef<string>('');

    // Store
    const { tasks, fetchTasks } = useHospitalTaskStore();
    const { settings, updateSettings } = useSettingsStore();
    const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);
    const { procedureCategories, fetchProcedureCategories } = useChartStore();

    const fetchAppointments = async () => {
        if (!settings.activeBranchId) return;
        try {
            let data: any[] = [];

            if (viewMode === 'day') {
                const dateStr = format(currentDate, 'yyyy-MM-dd');
                data = await visitService.getReservationsByDate(dateStr, settings.activeBranchId);
            } else if (viewMode === 'week') {
                const start = startOfWeek(currentDate, { weekStartsOn: 0 });
                const end = endOfWeek(currentDate, { weekStartsOn: 0 });
                const startStr = format(start, 'yyyy-MM-dd');
                const endStr = format(end, 'yyyy-MM-dd');
                data = await visitService.getReservationsByRange(startStr, endStr, settings.activeBranchId);
            } else if (viewMode === 'month') {
                const monthStart = startOfMonth(currentDate);
                const monthEnd = endOfMonth(currentDate);
                const start = startOfWeek(monthStart, { weekStartsOn: 0 });
                const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
                const startStr = format(start, 'yyyy-MM-dd');
                const endStr = format(end, 'yyyy-MM-dd');
                data = await visitService.getReservationsByRange(startStr, endStr, settings.activeBranchId);
            }

            const mapped = data.map((d: any) => {
                let localTime = '00:00';
                const scheduledDate = parseScheduleDateTime(d.reservDateTime);
                if (scheduledDate) {
                    localTime = format(scheduledDate, 'HH:mm');
                }
                const isFirstVisit = d.reservType === 'FIRST_VISIT';
                return {
                    ...d,
                    name: d.customerName,
                    phone: d.customerTelNo,
                    gender: d.customerGender || '',
                    age: d.customerBirthDate ? differenceInYears(new Date(), new Date(d.customerBirthDate)) : 0,
                    scheduledAt: d.reservDateTime,
                    time: localTime,
                    colId: String(d.reservCategoryId),
                    categoryName: d.reservCategoryName,
                    memo: d.reservationMemo,
                    customerId: d.customerId,
                    visitPurposeId: d.visitPurposes?.[0]?.name,
                    isFirstVisit,
                    type: isFirstVisit ? 'new' : 'revisit',
                    status: d.isCancelled ? 'cancelled' : (d.status || 'active'),
                };
            });

            setAppointments(mapped);
        } catch (error) {
            console.error('Failed to fetch appointments:', error);
        }
    };

    useEffect(() => {
        fetchAppointments();
    }, [currentDate, settings.activeBranchId, viewMode]);

    useEffect(() => {
        if (!settings.activeBranchId) return;
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        void fetchTasks(dateStr);
    }, [currentDate, settings.activeBranchId, fetchTasks]);

    // Keep hospital settings fresh so reservation time slots follow latest branch operating hours.
    useEffect(() => {
        if (!settings.activeBranchId) return;
        let active = true;

        hospitalSettingsService.get(settings.activeBranchId)
            .then((data) => {
                if (!active || !data) return;
                updateSettings({
                    hospital: {
                        ...data,
                        operatingHours: data.operatingHours || {},
                    } as any,
                });
            })
            .catch((error) => {
                if (!active) return;
                console.error('Failed to sync hospital settings for reservation:', error);
            });

        return () => { active = false; };
    }, [settings.activeBranchId, updateSettings]);

    // Fetch categories on mount or branch change
    useEffect(() => {
        if (settings.activeBranchId) {
            fetchProcedureCategories();
        }
    }, [settings.activeBranchId]);

    // Use procedureCategories from useChartStore directly
    const reservationCategories = useMemo(
        () => (procedureCategories || [])
            .filter((vp: any) => !!vp?.id)
            .map((vp: any, index: number) => ({
                ...vp,
                label: vp.name || vp.id,
                __index: index,
            }))
            .sort((a: any, b: any) => {
                const ao = typeof a?.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
                const bo = typeof b?.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
                if (ao !== bo) return ao - bo;
                return (a?.__index ?? 0) - (b?.__index ?? 0);
            })
            .map((vp: any) => {
                const { __index, ...rest } = vp;
                return rest;
            }),
        [procedureCategories]
    );

    const hospitalOperatingHours = settings.hospital?.operatingHours;

    const timeSlots = useMemo(() => {
        if (viewMode !== 'week') {
            return buildTimeSlotsForDate(reservationCategories, currentDate, hospitalOperatingHours);
        }

        const start = startOfWeek(currentDate, { weekStartsOn: 0 });
        const end = endOfWeek(currentDate, { weekStartsOn: 0 });
        const days = eachDayOfInterval({ start, end });
        const slotSet = new Set<string>();
        for (const day of days) {
            const slots = buildTimeSlotsForDate(reservationCategories, day, hospitalOperatingHours);
            for (const slot of slots) slotSet.add(slot);
        }
        const merged = Array.from(slotSet).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
        if (merged.length > 0) return merged;
        return buildTimeSlotsForDate(reservationCategories, currentDate, hospitalOperatingHours);
    }, [reservationCategories, currentDate, viewMode, hospitalOperatingHours]);

    const timeSlotInterval = useMemo(() => {
        if (timeSlots.length < 2) return DEFAULT_SLOT_INTERVAL;
        const first = timeToMinutes(timeSlots[0] || '');
        const second = timeToMinutes(timeSlots[1] || '');
        const diff = second - first;
        return diff > 0 ? diff : DEFAULT_SLOT_INTERVAL;
    }, [timeSlots]);

    useEffect(() => {
        if (viewMode !== 'day') return;
        const container = dayGridScrollRef.current;
        if (!container) return;

        const dayKey = format(currentDate, 'yyyy-MM-dd');
        const normalizeSlotTime = (raw: string) => {
            const [hRaw, mRaw] = String(raw || '').split(':');
            const hh = Number.parseInt(hRaw || '0', 10);
            const mm = String(mRaw || '00').padStart(2, '0');
            if (!Number.isFinite(hh)) return '';
            return `${hh}:${mm}`;
        };

        const dayAppointments = (appointments || [])
            .filter((appt) => {
                if (!appt?.scheduledAt) return false;
                const dt = parseScheduleDateTime(appt.scheduledAt);
                return dt ? format(dt, 'yyyy-MM-dd') === dayKey : false;
            })
            .sort((a, b) => timeToMinutes(String(a?.time || '00:00')) - timeToMinutes(String(b?.time || '00:00')));

        if (dayAppointments.length === 0) {
            const nextKey = `${dayKey}|none`;
            if (dayAutoScrollKeyRef.current !== nextKey) {
                container.scrollTop = 0;
                dayAutoScrollKeyRef.current = nextKey;
            }
            return;
        }

        const firstAppt = dayAppointments[0];
        const slotIndex = timeSlots.findIndex((slot) => normalizeSlotTime(slot) === normalizeSlotTime(String(firstAppt?.time || '')));
        if (slotIndex < 0) return;

        const nextKey = `${dayKey}|${firstAppt?.id}|${slotIndex}`;
        if (dayAutoScrollKeyRef.current === nextKey) return;

        const rowHeight = 76;
        const targetTop = Math.max(0, slotIndex * rowHeight - rowHeight);
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
        dayAutoScrollKeyRef.current = nextKey;
    }, [viewMode, currentDate, appointments, timeSlots]);

    // Accordion State
    const [isTaskOpen, setIsTaskOpen] = useState(true);

    // Filter Logic Helper
    const isAppointmentVisible = (appt: any) => {
        return true;
    };

    const handleCancelReservation = async (id: number, reason?: string, isNoShow?: boolean) => {
        try {
            await visitService.cancelReservation(id, reason, isNoShow);
            fetchAppointments();
            setSelectedAppointment(null);
        } catch (error) {
            console.error('Failed to cancel reservation:', error);
            showAlert({ message: '예약 취소 중 오류가 발생했습니다.', type: 'error' });
            throw error;
        }
    };

    // Drag and Drop State
    const [draggedAppt, setDraggedAppt] = useState<any>(null);
    const [dragOverCell, setDragOverCell] = useState<{ time: string; colId: string } | null>(null);

    const handleDragStart = (e: React.DragEvent, appt: any) => {
        setDraggedAppt(appt);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ id: appt.id, name: appt.name }));
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnter = (time: string, colId: string) => {
        setDragOverCell({ time, colId });
    };

    const handleDragLeave = () => {
        setDragOverCell(null);
    };

    const handleDrop = async (e: React.DragEvent, targetTime: string, targetColId: string) => {
        e.preventDefault();
        setDragOverCell(null);

        if (!draggedAppt) return;

        // Calculate new scheduledAt based on target time
        const [hours, minutes] = targetTime.split(':').map(Number);
        const newScheduledAt = new Date(currentDate);
        newScheduledAt.setHours(hours ?? 0, minutes ?? 0, 0, 0);

        try {
            const effectiveCategory =
                groupingMode === 'category'
                    ? targetColId
                    : (draggedAppt.colId || draggedAppt.category);

            const cellAppts = appointments.filter((a: any) => {
                const matchesCol = a.colId === effectiveCategory;
                const matchesTime = a.time?.replace(/^0/, '') === targetTime.replace(/^0/, '');
                return matchesCol && matchesTime && a.status !== 'cancelled' && a.id !== draggedAppt.id;
            });
            const targetCol = activeColumns.find((c: any) => c.id === effectiveCategory);
            const totalSlots = (targetCol as any)?.capacity || 5;
            if (cellAppts.length >= totalSlots) {
                showAlert({ message: '해당 예약시간이 꽉 찼습니다.', type: 'warning' });
                return;
            }

            const customerId = Number(draggedAppt.customerId || draggedAppt.patientId || 0);
            if (customerId > 0 && settings.activeBranchId) {
                const ticketIds = Array.isArray(draggedAppt.plannedTicketIds)
                    ? draggedAppt.plannedTicketIds.map(Number).filter(Boolean)
                    : undefined;

                const validation = await visitService.validateReservation({
                    branchId: String(settings.activeBranchId),
                    customerId,
                    scheduledAt: newScheduledAt.toISOString(),
                    reservationId: draggedAppt.id,
                    ticketIds,
                });

                if (!validation.allowed) {
                    showAlert({ message: validation.message || '예약 이동 조건을 만족하지 않습니다.', type: 'warning' });
                    return;
                }
            }

            await visitService.updateReservation(draggedAppt.id, {
                reservationDateTime: newScheduledAt.toISOString(),
                reservCategoryId: groupingMode === 'category' ? Number(effectiveCategory) : undefined,
            });

            fetchAppointments();
        } catch (error: any) {
            console.error('Failed to move reservation:', error);
            const message =
                error?.response?.data?.message ||
                error?.message ||
                '예약 이동 중 오류가 발생했습니다.';
            showAlert({ message, type: 'error' });
        } finally {
            setDraggedAppt(null);
        }
    };

    const shell = useAppShell();
    const isMobile = !!shell?.isMobile;

    const activeColumns = groupingMode === 'category'
        ? reservationCategories.map(c => ({
            id: c.id,
            label: c.label,
            count: 0,
            capacity: getCategoryCapacityForDate(c, currentDate)
        })) // Use per-weekday capacity from settings
        : VISIT_TYPE_COLUMNS.map(c => ({ ...c, capacity: 5 }));

    // Settings Modal State
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    // ... (existing state)

    if (permLoaded && !permissions["reservation.view"]) {
        return (
            <div className="flex h-full flex-col overflow-hidden bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
                <TopBar title="예약" />
                <NoPermissionOverlay />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
            <TopBar title="예약" />

            {/* Sub header: date nav + view controls */}
            <div className="shrink-0 border-b border-[#F8DCE2] bg-[#FCF7F8] px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-1 py-1 text-sm font-semibold text-slate-700 shadow-sm">
                            <button
                                onClick={() => {
                                    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
                                    else setCurrentDate(subDays(currentDate, viewMode === 'week' ? 7 : 1));
                                }}
                                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-[#FCEBEF] hover:text-slate-900"
                                aria-label="이전"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="min-w-[220px] px-2 text-center text-sm font-extrabold tracking-tight text-slate-900">
                                {format(
                                    currentDate,
                                    viewMode === 'month'
                                        ? "yyyy년 MM월"
                                        : viewMode === 'week'
                                            ? "yyyy년 MM월"
                                            : "yyyy년 MM월 dd일 eeee",
                                    { locale: ko }
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
                                    else setCurrentDate(addDays(currentDate, viewMode === 'week' ? 7 : 1));
                                }}
                                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-[#FCEBEF] hover:text-slate-900"
                                aria-label="다음"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                        <button
                            onClick={() => setCurrentDate(new Date())}
                            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-[#FCEBEF]"
                        >
                            오늘
                        </button>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {/* Grouping Toggle (Only in Day view) */}
                        {viewMode === 'day' && (
                            <div className="flex shrink-0 rounded-xl border border-slate-200 bg-[#FCEBEF]/40 p-1">
                                <button
                                    onClick={() => setGroupingMode('category')}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${groupingMode === 'category' ? 'bg-[#E26B7C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]' : 'text-slate-600 hover:bg-white'}`}
                                >
                                    시술별                                </button>
                                <button
                                    onClick={() => setGroupingMode('visitType')}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${groupingMode === 'visitType' ? 'bg-[#E26B7C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]' : 'text-slate-600 hover:bg-white'}`}
                                >
                                    초/재진별                                </button>
                            </div>
                        )}

                        <div className="flex shrink-0 rounded-xl border border-slate-200 bg-[#FCEBEF]/40 p-1">
                            <button
                                onClick={() => setViewMode('day')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${viewMode === 'day' ? 'bg-[#E26B7C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]' : 'text-slate-600 hover:bg-white'}`}
                            >
                                일                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${viewMode === 'week' ? 'bg-[#E26B7C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]' : 'text-slate-600 hover:bg-white'}`}
                            >
                                주                            </button>
                            <button
                                onClick={() => setViewMode('month')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${viewMode === 'month' ? 'bg-[#E26B7C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]' : 'text-slate-600 hover:bg-white'}`}
                            >
                                월                            </button>
                        </div>

                        <button
                            onClick={() => { if (permissions["reservation.create"] !== false) { setCreateCellInfo({ date: currentDate }); setIsCreatePanelOpen(true); } }}
                            disabled={permLoaded && !permissions["reservation.create"]}
                            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)] transition-all ${permLoaded && !permissions["reservation.create"] ? "bg-[#e0e0e0] text-[#616161] cursor-not-allowed" : "bg-[#E26B7C] hover:bg-[#99354E]"}`}
                        >
                            예약 등록
                        </button>

                        <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-[#FCEBEF]"
                            aria-label="설정"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <aside className="hidden lg:flex w-64 shrink-0 flex-col overflow-y-auto border-r border-[#F8DCE2] bg-[#FCF7F8]">
                    {/* ... (Sidebar content remains same) ... */}
                    {/* Mini Calendar / Date Picker Placeholder */}
                    <div className="p-4 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-bold text-gray-600">{format(currentDate, 'yyyy.MM')}</span>
                            <div className="flex gap-1">
                                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-gray-100 rounded">
                                    <ChevronLeft className="w-4 h-4 text-gray-400" />
                                </button>
                                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-gray-100 rounded">
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                </button>
                            </div>
                        </div>
                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-1 text-[10px] text-center text-gray-500 mb-2">
                            <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-xs text-center text-gray-700 font-medium">
                            {eachDayOfInterval({
                                start: startOfWeek(startOfMonth(currentDate)),
                                end: endOfWeek(endOfMonth(currentDate))
                            }).map((day, i) => (
                                <div
                                    key={i}
                                    onClick={() => setCurrentDate(day)}
                                    className={`
                                        p-1 rounded-full cursor-pointer hover:bg-[#FCEBEF] aspect-square flex items-center justify-center
                                        ${isSameDay(day, currentDate) ? 'bg-[#E26B7C] text-white hover:bg-[#99354E]' : ''}
                                        ${!isSameMonth(day, currentDate) ? 'text-gray-300' : ''}
                                    `}
                                >
                                    {format(day, 'd')}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="p-4 border-b border-gray-100">
                        <button
                            onClick={() => { if (permissions["reservation.create"] !== false) { setCreateCellInfo({ date: currentDate }); setIsCreatePanelOpen(true); } }}
                            disabled={permLoaded && !permissions["reservation.create"]}
                            className={`w-full py-2 px-3 text-white text-xs font-bold rounded-lg shadow-sm ${permLoaded && !permissions["reservation.create"] ? "bg-[#e0e0e0] text-[#616161] cursor-not-allowed" : "bg-[#E26B7C] hover:bg-[#99354E]"}`}
                        >
                            예약 등록
                        </button>
                    </div>

                    {/* Tasks */}
                    <div className="p-4 flex-1">
                        <div
                            className="flex items-center justify-between mb-3 cursor-pointer"
                            onClick={() => setIsTaskOpen(!isTaskOpen)}
                        >
                            <span className="text-xs font-bold text-gray-500">업무 {tasks.length}</span>
                            <ChevronLeft className={`w-3 h-3 text-gray-400 transition-transform ${isTaskOpen ? 'rotate-90' : '-rotate-90'} `} />
                        </div>

                        {isTaskOpen && (
                            <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                                {tasks.map((task: TaskItem) => (
                                    <div
                                        key={task.id}
                                        className="py-1"
                                    >
                                        <div className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{task.content}</div>
                                        {task.subContent && <div className="text-xs text-gray-600 mt-0.5 leading-relaxed whitespace-pre-wrap">{task.subContent}</div>}
                                        <div className="text-[10px] text-gray-400 mt-1">{task.author}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Scheduler Grid */}
                <main className="relative flex flex-1 overflow-hidden bg-gradient-to-b from-slate-50/70 to-white">
                    {isMobile ? (
                        <MobileReservationContent
                            currentDate={currentDate}
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            setCurrentDate={setCurrentDate}
                            appointments={appointments}
                            procedureCategories={reservationCategories}
                            tasks={tasks}
                            isTaskOpen={isTaskOpen}
                            setIsTaskOpen={setIsTaskOpen}
                            onSelectAppointment={setSelectedAppointment}
                            onCreate={() => { setCreateCellInfo({ date: currentDate }); setIsCreatePanelOpen(true); }}
                        />
                    ) : (
                        <div className="flex h-full min-w-[1000px] flex-1 flex-col overflow-auto px-3 pb-3 pt-2">
                            {viewMode === 'day' ? (
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_16px_38px_rgba(15,23,42,.08)]">
                                    {/* Day View — single scroll area for header + body */}
                                    <div ref={dayGridScrollRef} className="flex-1 overflow-y-auto bg-slate-50/40">
                                        {/* Day View Column Headers */}
                                        <div className="sticky top-0 z-20 flex border-b border-slate-200/80 bg-[#FCF7F8] backdrop-blur">
                                            <div className="w-16 shrink-0 border-r border-slate-200/70 px-2 py-2 text-[11px] font-bold text-slate-500">시간</div>
                                        {activeColumns.map(col => {
                                            const colAppts = appointments.filter(a => (groupingMode === 'category' ? a.colId === col.id : matchesVisitTypeColumn(a, col.id)) && a.status !== 'cancelled');
                                            const colTotal = colAppts.length;
                                            const colNew = colAppts.filter(a => isNewVisitAppointment(a)).length;
                                            const colOld = colTotal - colNew;

                                            return (
                                                <div key={col.id} className="min-w-[190px] flex-1 border-r border-slate-200/70 px-3 py-2.5">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-extrabold tracking-tight text-slate-800">
                                                                {col.label}
                                                                <span className="ml-1 text-xs font-semibold text-slate-400">{colTotal}</span>
                                                            </span>
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                                                초<span className="font-bold text-emerald-600">{colNew}</span>
                                                                <span>/</span>
                                                                재<span className="font-bold text-sky-700">{colOld}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                        {timeSlots.map((slotTime) => {
                                            // Calculate end time for the slot
                                            const timeParts = slotTime.split(':').map(Number);
                                            const h = timeParts[0] ?? 0;
                                            const m = timeParts[1] ?? 0;
                                            const endMinutes = m + timeSlotInterval;
                                            const endHour = endMinutes >= 60 ? h + 1 : h;
                                            const endMin = endMinutes >= 60 ? endMinutes - 60 : endMinutes;
                                            const endTimeStr = `${endHour}:${endMin.toString().padStart(2, '0')}`;
                                            const timeRangeDisplay = `${slotTime}-${endTimeStr}`;

                                            return (
                                                <div key={slotTime} className="flex min-h-[76px] border-b border-slate-200/70 last:border-b-0">
                                                    {/* Time Column */}
                                                    <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-slate-200/70 bg-[#FCF7F8] px-2 py-2 text-[11px] font-semibold text-slate-600 backdrop-blur">
                                                        {slotTime}
                                                    </div>

                                                    {/* Category Columns */}
                                                    {activeColumns.map((col) => {
                                                        // Filter appointments for this cell
                                                        // Normalize time comparison: strip leading zero for comparison
                                                        const normalizeTime = (t: string) => {
                                                            const parts = t.split(':');
                                                            const hour = parts[0] ?? '0';
                                                            const min = parts[1] ?? '00';
                                                            return `${parseInt(hour, 10)}:${min}`;
                                                        };

                                                        const cellAppts = appointments.filter(appt => {
                                                            const matchesCol = groupingMode === 'category'
                                                                ? appt.colId === col.id
                                                                : matchesVisitTypeColumn(appt, col.id);
                                                            const apptTimeNorm = appt.time ? normalizeTime(appt.time) : '';
                                                            const slotTimeNorm = normalizeTime(slotTime);
                                                            const matchesTime = apptTimeNorm === slotTimeNorm;

                                                            // Debug logging for first slot only
                                                            if (slotTime === '10:30' && matchesCol) {
                                                                console.log('[TimeMatch]', {
                                                                    apptName: appt.name,
                                                                    apptTime: appt.time,
                                                                    apptTimeNorm,
                                                                    slotTime,
                                                                    slotTimeNorm,
                                                                    matchesTime,
                                                                    colId: col.id,
                                                                    apptColId: appt.colId
                                                                });
                                                            }

                                                            return matchesCol && matchesTime;
                                                        });

                                                        const activeCount = cellAppts.filter((a: any) => a.status !== 'cancelled').length;
                                                        const rawSlots = (col as any).capacity;
                                                        const totalSlots = rawSlots || 0;
                                                        const isUnavailable = totalSlots === 0;
                                                        const isFull = !isUnavailable && activeCount >= totalSlots;
                                                        const hasAvailableSlots = !isUnavailable && !isFull;
                                                        const isVisitTypeMode = groupingMode !== 'category';

                                                        return (
                                                            <div
                                                                key={col.id}
                                                                className={cn(
                                                                    "relative min-w-[190px] flex-1 border-r border-slate-200/70 p-2.5 transition-colors",
                                                                    dragOverCell?.time === slotTime && dragOverCell?.colId === col.id
                                                                        ? 'bg-cyan-50/80 ring-2 ring-inset ring-cyan-300'
                                                                        : isUnavailable || isFull ? 'bg-slate-50/80' : 'hover:bg-white'
                                                                )}
                                                                onDragOver={handleDragOver}
                                                                onDragEnter={() => handleDragEnter(slotTime, col.id)}
                                                                onDragLeave={handleDragLeave}
                                                                onDrop={(e) => handleDrop(e, slotTime, col.id)}
                                                            >
                                                                <div className={cn("mb-2 flex items-center justify-between text-[11px]", isUnavailable || isFull ? "text-slate-300" : activeCount > 0 ? "text-cyan-700" : "text-slate-400")}>
                                                                    <span>{timeRangeDisplay}</span>
                                                                    {isVisitTypeMode ? (
                                                                        <span className={cn("font-semibold", isUnavailable ? "text-slate-300" : activeCount > 0 ? "text-cyan-700" : "text-slate-400")}>
                                                                            {activeCount}건
                                                                        </span>
                                                                    ) : (
                                                                        <div className="flex items-center gap-1">
                                                                            <span className={cn("font-semibold", isUnavailable || isFull ? "text-slate-300" : activeCount > 0 ? "text-cyan-700" : "text-cyan-600")}>
                                                                                {isUnavailable ? "0/0" : `${activeCount}/${totalSlots}`}
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                disabled={!hasAvailableSlots}
                                                                                className={cn(
                                                                                    "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                                                                                    hasAvailableSlots
                                                                                        ? "border-cyan-300 bg-white text-cyan-700 hover:bg-cyan-50 hover:border-cyan-400"
                                                                                        : "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed opacity-50"
                                                                                )}
                                                                                aria-label="예약 추가"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (!hasAvailableSlots) return;
                                                                                    setSelectedAppointment(null);
                                                                                    setCreateCellInfo({ categoryId: col.id, date: currentDate, time: slotTime });
                                                                                    setIsCreatePanelOpen(true);
                                                                                }}
                                                                            >
                                                                                +
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Appointment Cards */}
                                                                <div className="space-y-1.5">
                                                                    {cellAppts.map(appt => {
                                                                        const genderColor = appt.gender === '여' || appt.gender === 'F' || appt.gender === 'FEMALE'
                                                                            ? 'bg-pink-500'
                                                                            : 'bg-blue-500';
                                                                        const isNew = isNewVisitAppointment(appt);

                                                                        return (
                                                                            <div
                                                                                key={appt.id}
                                                                                className={`group/card relative ${appt.status === 'cancelled' ? 'cursor-default' : appt.isCheckedIn ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${draggedAppt?.id === appt.id ? 'opacity-50' : ''}`}
                                                                                draggable={!appt.isCheckedIn && appt.status !== 'cancelled'}
                                                                                onDragStart={(e) => { if (appt.isCheckedIn || appt.status === 'cancelled') { e.preventDefault(); return; } handleDragStart(e, appt); }}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedAppointment(appt);
                                                                                }}
                                                                            >
                                                                                {/* Patient Card */}
                                                                                <div
                                                                                    className={cn(
                                                                                        "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 shadow-sm transition-all group-hover/card:-translate-y-[1px]",
                                                                                        selectedAppointment?.id === appt.id
                                                                                            ? "border-cyan-300 bg-cyan-50 shadow-cyan-100"
                                                                                            : appt.isCheckedIn
                                                                                                ? "border-[#F8DCE2] bg-[#FCEBEF]/80"
                                                                                                : isNew
                                                                                                    ? "border-emerald-200 bg-emerald-50/80"
                                                                                                    : "border-slate-200 bg-white",
                                                                                        appt.status === 'cancelled' && "border-slate-300 bg-slate-200/80 opacity-60"
                                                                                    )}
                                                                                >
                                                                                    {/* Name with asterisk for first visit */}
                                                                                    <span className={cn("max-w-[92px] truncate text-sm font-bold", isNew ? "text-rose-600" : "text-slate-800", appt.status === 'cancelled' && "line-through text-slate-500")}>
                                                                                        {appt.name}{isNew ? '*' : ''}
                                                                                    </span>
                                                                                    {/* Gender Badge */}
                                                                                    <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ${genderColor}`}>
                                                                                        {appt.gender === '여' || appt.gender === 'F' || appt.gender === 'FEMALE' ? '여' : '남'}
                                                                                    </span>
                                                                                    {/* Age */}
                                                                                    <span className="text-xs text-slate-500">
                                                                                        {appt.age ? `${appt.age}세` : ''}
                                                                                    </span>
                                                                                    <span className="ml-auto flex items-center gap-1">
                                                                                        {appt.status === 'cancelled' && (
                                                                                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">취소</span>
                                                                                        )}
                                                                                        {appt.isCheckedIn && (
                                                                                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">접수</span>
                                                                                        )}
                                                                                        {appt.status !== 'cancelled' && (
                                                                                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", isNew ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                                                                                                {isNew ? '초진' : '재진'}
                                                                                            </span>
                                                                                        )}
                                                                                    </span>
                                                                                </div>

                                                                                {/* Hover Detail Popup */}
                                                                                {!draggedAppt && (
                                                                                    <div className="absolute left-0 top-full z-[200] mt-2 hidden w-[300px] rounded-2xl border border-slate-200 bg-[#FCF7F8] p-3 shadow-2xl backdrop-blur group-hover/card:block">
                                                                                        <div className="mb-2 flex items-center gap-2">
                                                                                            <span className={`text-lg font-bold ${isNew ? 'text-rose-600' : 'text-slate-900'}`}>
                                                                                                {appt.name}
                                                                                            </span>
                                                                                            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${genderColor}`}>
                                                                                                {appt.gender === '여' || appt.gender === 'F' || appt.gender === 'FEMALE' ? '여' : '남'}
                                                                                            </span>
                                                                                            <span className="text-sm text-slate-500">{appt.age ? `${appt.age}세` : ''}</span>
                                                                                        </div>
                                                                                        {appt.phone && <div className="mb-1 text-sm text-slate-700">{appt.phone}</div>}
                                                                                        {appt.memo && <div className="text-xs leading-relaxed text-cyan-700">{appt.memo}</div>}
                                                                                        <div className="mt-2 text-xs text-slate-400">
                                                                                            예약: {appt.time} | {isNew ? '초진' : '재진'}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : viewMode === 'week' ? (
                                <WeekView
                                    currentDate={currentDate}
                                    appointments={appointments}
                                    timeSlots={timeSlots}
                                    categories={reservationCategories}
                                />
                            ) : (
                                <MonthView currentDate={currentDate} appointments={appointments} categories={reservationCategories} />
                            )}
                        </div>
                    )}

                    {/* Reservation Detail Panel (Overlay) */}
                    {isMobile ? (
                        (!!selectedAppointment || isCreatePanelOpen) ? (
                            <div className="fixed inset-0 z-40 md:hidden">
                                <div
                                    className="absolute inset-0 bg-black/30"
                                    onClick={() => {
                                        setSelectedAppointment(null);
                                        setIsCreatePanelOpen(false);
                                    }}
                                />
                                <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl">
                                    <div className="max-h-[92vh] overflow-y-auto">
                                        <ReservationDetailPanel
                                            isOpen={!!selectedAppointment || isCreatePanelOpen}
                                            onClose={() => {
                                                setSelectedAppointment(null);
                                                setIsCreatePanelOpen(false);
                                                setInitialPatient(null);
                                                setCreateCellInfo(null);
                                            }}
                                            appointment={isCreatePanelOpen ? null : selectedAppointment}
                                            onCancel={(!permLoaded || !!permissions["reservation.cancel"]) ? handleCancelReservation : (() => {})}
                                            onSave={fetchAppointments}
                                            initialPatient={initialPatient}
                                            initialCategoryId={createCellInfo?.categoryId}
                                            initialDate={createCellInfo?.date}
                                            initialTime={createCellInfo?.time}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : null
                    ) : (
                        <div className={`absolute top-0 right-0 h-full bg-white border-l border-gray-200 z-20 shadow-2xl transition-transform duration-300 transform ${selectedAppointment || isCreatePanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                            <ReservationDetailPanel
                                isOpen={!!selectedAppointment || isCreatePanelOpen}
                                onClose={() => {
                                    setSelectedAppointment(null);
                                    setIsCreatePanelOpen(false);
                                    setInitialPatient(null);
                                    setCreateCellInfo(null);
                                }}
                                appointment={isCreatePanelOpen ? null : selectedAppointment}
                                onCancel={(!permLoaded || !!permissions["reservation.cancel"]) ? handleCancelReservation : (() => {})}
                                onSave={fetchAppointments}
                                initialPatient={initialPatient}
                                initialCategoryId={createCellInfo?.categoryId}
                                initialDate={createCellInfo?.date}
                                initialTime={createCellInfo?.time}
                            />
                        </div>
                    )}

                </main>
            </div>
            <ReservationSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
            />
        </div >
    );
}

// Separate WeekView Component
function WeekView({
    currentDate,
    appointments,
    timeSlots,
    categories
}: {
    currentDate: Date;
    appointments: any[];
    timeSlots: string[];
    categories: any[];
}) {
    const weekDays = useMemo(() => {
        const start = startOfWeek(currentDate, { weekStartsOn: 0 });
        const end = endOfWeek(currentDate, { weekStartsOn: 0 });
        return eachDayOfInterval({ start, end });
    }, [currentDate]);

    const colNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const category of categories || []) {
            const key = String(category?.id || "").trim();
            if (!key) continue;
            map.set(key, String(category?.label || category?.name || key));
        }
        return map;
    }, [categories]);

    const slotApptsByKey = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const appt of appointments || []) {
            if (!appt?.scheduledAt) continue;
            const apptDate = parseScheduleDateTime(appt.scheduledAt);
            if (!apptDate) continue;
            const key = `${format(apptDate, 'yyyy-MM-dd')}|${format(apptDate, 'HH:mm')}`;
            const prev = map.get(key);
            if (prev) prev.push(appt);
            else map.set(key, [appt]);
        }
        return map;
    }, [appointments]);

    const dailyVisitTypeStatsByKey = useMemo(() => {
        const map = new Map<string, { total: number; firstVisit: number; revisit: number }>();
        for (const appt of appointments || []) {
            if (!appt?.scheduledAt || appt?.status === 'cancelled') continue;
            const apptDate = parseScheduleDateTime(appt.scheduledAt);
            if (!apptDate) continue;

            const dayKey = format(apptDate, 'yyyy-MM-dd');
            const prev = map.get(dayKey) || { total: 0, firstVisit: 0, revisit: 0 };
            const isFirstVisit = isNewVisitAppointment(appt);

            const next = {
                total: prev.total + 1,
                firstVisit: prev.firstVisit + (isFirstVisit ? 1 : 0),
                revisit: prev.revisit + (isFirstVisit ? 0 : 1),
            };
            map.set(dayKey, next);
        }
        return map;
    }, [appointments]);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_16px_38px_rgba(15,23,42,.08)]">
            {/* Week — single scroll area for header + body */}
            <div className="flex-1 overflow-auto bg-slate-50/40">
                {/* Week Headers */}
                <div className="sticky top-0 z-20 flex border-b border-slate-200/80 bg-[#FCF7F8] backdrop-blur">
                    <div className="w-16 shrink-0 border-r border-slate-200/70 px-2 py-2 text-[11px] font-bold text-slate-500">
                        시간
                    </div>
                    {weekDays.map((day: Date, i: number) => {
                        const dayKey = format(day, 'yyyy-MM-dd');
                        const isToday = isSameDay(day, new Date());
                        const dayStats = dailyVisitTypeStatsByKey.get(dayKey) || { total: 0, firstVisit: 0, revisit: 0 };
                        const dayTotal = dayStats.total;
                        return (
                            <div
                                key={i}
                                className={cn(
                                    "min-w-[150px] flex-1 border-r border-slate-200/70 px-2 py-2 text-center",
                                    isToday && "bg-cyan-50/60"
                                )}
                            >
                                <div className={cn("text-xs font-bold", isToday ? "text-cyan-800" : "text-slate-700")}>
                                    {format(day, 'MM월 dd일 (eee)', { locale: ko })}
                                </div>
                                <div className={cn("mt-1 text-[10px] font-semibold", dayTotal > 0 ? "text-cyan-700" : "text-slate-400")}>
                                    {dayTotal}건
                                </div>
                                {dayTotal > 0 && (
                                    <div className="mt-1.5 flex items-center justify-center gap-1">
                                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                                            초진 {dayStats.firstVisit}
                                        </span>
                                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                                            재진 {dayStats.revisit}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {timeSlots.map((time: string) => (
                    <div key={time} className="flex h-11 border-b border-slate-200/70 last:border-b-0">
                        {/* Time Label */}
                        <div className="sticky left-0 z-10 flex w-16 shrink-0 items-center justify-center border-r border-slate-200/70 bg-[#FCF7F8] text-[11px] font-semibold text-slate-600 backdrop-blur">
                            {time}
                        </div>
                        {/* Days */}
                        {weekDays.map((day: Date, i: number) => {
                            const dayStr = format(day, 'yyyy-MM-dd');
                            const slotAppts = slotApptsByKey.get(`${dayStr}|${time}`) || [];
                            const count = slotAppts.length;
                            const hasCount = count > 0;
                            const isToday = isSameDay(day, new Date());

                            return (
                                <div
                                    key={i}
                                    className={cn(
                                        "group relative flex min-w-[150px] flex-1 items-center justify-center border-r border-slate-200/70 text-xs text-slate-700 transition-colors",
                                        hasCount ? "cursor-pointer hover:bg-white" : "hover:bg-white/60",
                                        isToday && "bg-cyan-50/30"
                                    )}
                                >
                                    {hasCount && (
                                        <>
                                            <span className="inline-flex rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-700 ring-1 ring-cyan-100">
                                                {count}명
                                            </span>
                                            {/* Hover Popup */}
                                            <div className="absolute left-1 top-full z-50 mt-1 hidden w-56 rounded-xl border border-slate-200 bg-[#FCF7F8] p-2 shadow-2xl backdrop-blur group-hover:block">
                                                <div className="mb-2 border-b border-slate-100 pb-1 text-xs font-bold text-slate-700">
                                                    {format(day, 'M월 d일')} {time} ({count}명)
                                                </div>
                                                <div className="custom-scrollbar max-h-[220px] space-y-1.5 overflow-y-auto">
                                                    {slotAppts.map(a => {
                                                        const memoText = String(a?.memo || "").trim();
                                                        const hoverNote = memoText;

                                                        return (
                                                            <div key={a.id} className="flex flex-col rounded-lg border border-slate-100 bg-slate-50 p-1.5 text-xs">
                                                                <div className="group/name">
                                                                    <div className="mb-0.5 flex items-center justify-between">
                                                                        <span className={`font-bold ${hoverNote ? "cursor-help text-slate-900 underline decoration-dotted underline-offset-2" : "text-slate-800"}`}>
                                                                            {a.name}
                                                                            <span className="ml-1 text-[10px] font-normal text-slate-500">
                                                                                ({a.gender === '여' || a.gender === 'F' || a.gender === 'FEMALE' ? '여' : '남'}/{a.age ?? '-'})
                                                                            </span>
                                                                        </span>
                                                                        {a.isFirstVisit && <span className="text-[10px] font-bold text-rose-500">초진</span>}
                                                                    </div>
                                                                    {hoverNote && (
                                                                        <div className="max-h-0 overflow-hidden transition-all duration-200 group-hover/name:mt-1 group-hover/name:max-h-28">
                                                                            <div className="rounded-md border border-cyan-100 bg-cyan-50 px-1.5 py-1 text-[10px] leading-relaxed text-cyan-800 whitespace-pre-wrap">
                                                                                {hoverNote}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="truncate text-[10px] text-slate-500">
                                                                    {colNameById.get(String(a.colId || a.category || "")) || a.title || "미정"}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}


// Helper for visit colors
function getVisitColor(type: string) {
    switch (type) {
        case 'new': return '#ef4444'; // Red
        case 'revisit': return '#3b82f6'; // Blue
        default: return '#a855f7'; // Purple
    }
}

// --- Month View Component ---
function MonthView({ currentDate, appointments, categories }: { currentDate: Date, appointments: any[], categories: any[] }) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const colNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const category of categories || []) {
            const key = String(category?.id || "").trim();
            if (!key) continue;
            map.set(key, String(category?.label || category?.name || key));
        }
        return map;
    }, [categories]);

    // Predefined colors for dynamic categories
    const categoryColors = [
        'bg-violet-100 text-violet-700',
        'bg-green-100 text-green-700',
        'bg-blue-100 text-blue-700',
        'bg-orange-100 text-orange-700',
        'bg-pink-100 text-pink-700',
        'bg-teal-100 text-teal-700',
        'bg-indigo-100 text-indigo-700',
        'bg-yellow-100 text-yellow-700'
    ];

    return (
        <div className="flex flex-col flex-1 h-full bg-white">
            {/* Month Header (Days of Week) */}
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                {['일', '월', '화', '수', '목', '금', '토'].map((dayName, idx) => (
                    <div key={idx} className={`text-center py-2 text-sm font-bold ${idx === 0 ? 'text-red-500' : 'text-gray-600'}`}>
                        {dayName}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 grid grid-cols-7 grid-rows-6">
                {days.map((day, idx) => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const isSunday = getDay(day) === 0;

                    // Filter appointments for this day
                    const dayAppts = appointments.filter(a => {
                        const apptDate = parseScheduleDateTime(a?.scheduledAt);
                        return apptDate ? format(apptDate, 'yyyy-MM-dd') === dayStr : false;
                    });
                    const activeDayAppts = dayAppts.filter(a => a.status !== 'cancelled');
                    const totalReservations = activeDayAppts.length;
                    const firstVisitCount = activeDayAppts.filter((a) => isNewVisitAppointment(a)).length;
                    const revisitCount = Math.max(0, totalReservations - firstVisitCount);

                    // Categories breakdown
                    const categoryStats = categories.map((cat, i) => {
                        const count = activeDayAppts.filter(a => a.colId === cat.id).length;
                        return {
                            label: cat.label,
                            count: count,
                            color: categoryColors[i % categoryColors.length]
                        };
                    }).filter(c => c.count > 0);

                    // If 'Other' or 'Unspecified' needed
                    const specifiedCount = categoryStats.reduce((sum, c) => sum + c.count, 0);
                    const unspecifiedCount = totalReservations - specifiedCount;
                    if (unspecifiedCount > 0) {
                        categoryStats.push({
                            label: '미정',
                            count: unspecifiedCount,
                            color: 'bg-gray-100 text-gray-700'
                        });
                    }

                    const isCurrentMonth = isSameMonth(day, currentDate);
                    const isToday = isSameDay(day, new Date());

                    return (
                        <div
                            key={idx}
                            className={`
                                border-r border-b border-gray-100 p-2 flex flex-col relative transition-colors group hover:bg-gray-50
                                ${!isCurrentMonth ? 'bg-gray-50/30' : 'bg-white'}
                            `}
                        >
                            {/* Date Header */}
                            <div className="flex justify-between items-start mb-2">
                                <span className={`
                                    text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full
                                    ${isToday ? 'bg-[#99354E] text-white' : isCurrentMonth ? (isSunday ? 'text-red-500' : 'text-gray-700') : 'text-gray-300'}
                                `}>
                                    {format(day, 'd')}
                                </span>
                                {totalReservations > 0 && (
                                    <span className="text-xs font-bold text-gray-600 group-hover:text-gray-900">
                                        {totalReservations}건                                    </span>
                                )}
                            </div>

                            {/* Statistical Bars */}
                            {isCurrentMonth && (
                                <div className="space-y-1 overflow-hidden">
                                    {totalReservations > 0 && (
                                        <div className="mb-1 flex items-center gap-1">
                                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                                                초진 {firstVisitCount}
                                            </span>
                                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                                                재진 {revisitCount}
                                            </span>
                                        </div>
                                    )}
                                    {categoryStats.slice(0, 4).map((cat, catIdx) => (
                                        <div
                                            key={catIdx}
                                            className={`flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded-sm hover:opacity-80 cursor-pointer transition-opacity ${cat.color}`}
                                        // Optional safe background logic if using arbitrary colors, but tailwind classes are safer
                                        >
                                            <span className="font-medium truncate max-w-[70%]">{cat.label}</span>
                                            <span className="font-bold">{cat.count}</span>
                                        </div>
                                    ))}
                                    {categoryStats.length > 4 && (
                                        <div className="text-[10px] text-gray-400 text-center">+ {categoryStats.length - 4} more</div>
                                    )}
                                </div>
                            )}

                            {/* Hover Popup for Day Details */}
                            {totalReservations > 0 && (
                                <div className="absolute top-full left-0 z-50 w-56 bg-white border border-gray-200 shadow-xl rounded-lg p-2 hidden group-hover:block ml-1 mt-[-20px]">
                                    <div className="text-xs font-bold text-gray-700 mb-2 border-b border-gray-100 pb-1">
                                        {format(day, 'M월 d일')} 예약 ({totalReservations}건)
                                    </div>
                                    <div className="mb-2 flex items-center gap-1.5">
                                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                            초진 {firstVisitCount}
                                        </span>
                                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                                            재진 {revisitCount}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                                        {activeDayAppts.map(a => (
                                            <div key={a.id} className="flex flex-col text-xs bg-gray-50 p-1.5 rounded">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <span className="font-bold text-gray-800">
                                                        {a.name}
                                                        <span className="ml-1 text-[10px] font-normal text-gray-500">
                                                            ({a.gender === '여' || a.gender === 'F' || a.gender === 'FEMALE' ? '여' : '남'}/{a.age ?? '-'})
                                                        </span>
                                                    </span>
                                                    <span className="text-[10px] text-gray-400">{a.time}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[10px] text-gray-500 truncate max-w-[80px]">
                                                        {colNameById.get(String(a.colId || a.category || "")) || a.title || "미정"}
                                                    </div>
                                                    <span className={`text-[10px] font-bold ${isNewVisitAppointment(a) ? "text-rose-500" : "text-blue-500"}`}>
                                                        {isNewVisitAppointment(a) ? "초진" : "재진"}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}



import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, User, Phone, Check, Activity, Clock, FileText, ChevronDown, History, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import ReservationCancelModal from './ReservationCancelModal';
import { ReservationChangeHistoryModal } from '../components/reservation/ReservationChangeHistoryModal';
import { CustomDatePicker } from '../components/common/CustomDatePicker';
import { CustomTimePicker } from '../components/common/CustomTimePicker';
import { PatientSearchModal } from '../components/common/PatientSearchModal';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useChartStore } from '../stores/useChartStore';
import { visitService } from '../services/visitService';
import { type KioskTicket } from '../services/kioskService';
import apiClient from '../services/apiClient';
import { useAlert } from '../components/ui/AlertDialog';

interface CustomerTicketItem {
    id: number;
    ticketDefId?: number;
    name: string;
    type: string;
    totalAmount: number;
    totalUsed: number;
    balance: number;
    maximumUseCount?: number;
    usedCount: number;
    remainingCount: number;
    expiryDate?: string;
    minIntervalDays?: number;
    lastUsedDate?: string;
    reservCategoryId?: number;
    reservCategoryName?: string;
}

function mapCustomerTicketToKioskTicket(item: CustomerTicketItem): KioskTicket {
    const categories: KioskTicket['categories'] = [];
    if (item.reservCategoryId && item.reservCategoryName) {
        categories.push({
            id: String(item.reservCategoryId),
            name: item.reservCategoryName,
            interval: 30,
        });
    }
    return {
        ticketHistId: item.id,
        ticketId: (item as any).ticketDefId || item.id,
        ticketName: item.name,
        remainingCount: item.remainingCount,
        totalCount: item.maximumUseCount ?? 0,
        usageCount: item.usedCount,
        expiryDate: item.expiryDate,
        minIntervalDays: item.minIntervalDays,
        lastUsedDate: item.lastUsedDate,
        categories,
    };
}

const toStringArray = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v)).map((v) => v.trim()).filter(Boolean);
    return [String(value).trim()].filter(Boolean);
};

const normalizeToken = (value: unknown): string =>
    String(value ?? '').replace(/\s+/g, '').trim().toLowerCase();

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
const WEEKDAY_EN_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEKDAY_EN_LONG = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DEFAULT_CATEGORY_DAY_RANGE = '09:00~18:00';

const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatDateOnly = (value?: string | Date | null): string => {
    if (!value) return '-';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
};

const normalizeWeekdayToken = (value: unknown): string =>
    String(value ?? '').trim().toLowerCase();

const toMinutes = (t: string): number => {
    const [hStr, mStr] = String(t || '').split(':');
    const h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);
    return h * 60 + m;
};

const formatMinutesAsTime = (minutes: number): string =>
    `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

const getWeekdayKeys = (date: Date): string[] => {
    const dayIndex = date.getDay();
    return [
        WEEKDAY_KO[dayIndex],
        WEEKDAY_EN_SHORT[dayIndex],
        WEEKDAY_EN_LONG[dayIndex],
        String(dayIndex),
    ].filter((value): value is string => Boolean(value));
};

const getDayValue = (source: Record<string, string> | undefined, date: Date): string | undefined => {
    if (!source) return undefined;
    const dayKeys = getWeekdayKeys(date);

    for (const key of dayKeys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }

    const normalizedKeys = new Set(dayKeys.map(normalizeWeekdayToken));
    for (const [rawKey, rawValue] of Object.entries(source)) {
        if (!normalizedKeys.has(normalizeWeekdayToken(rawKey))) continue;
        if (typeof rawValue === 'string' && rawValue.trim()) return rawValue.trim();
    }

    return undefined;
};

const parseTimeRange = (range?: string | null): { start: number; end: number } | null => {
    if (!range) return null;
    const normalized = String(range).replace('-', '~');
    const [start, end] = normalized.split('~').map((value) => value.trim());
    if (!start || !end) return null;
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    if (endMin <= startMin) return null;
    return { start: startMin, end: endMin };
};

const isCategoryActiveOnDate = (category: any, date: Date): boolean => {
    const targetDate = startOfDay(date);

    if (category?.startDate) {
        const startDate = startOfDay(new Date(category.startDate));
        if (!Number.isNaN(startDate.getTime()) && targetDate < startDate) return false;
    }

    if (category?.useEndDate && category?.endDate) {
        const endDate = startOfDay(new Date(category.endDate));
        if (!Number.isNaN(endDate.getTime()) && targetDate > endDate) return false;
    }

    const days = Array.isArray(category?.days)
        ? category.days.map((value: unknown) => String(value)).filter(Boolean)
        : [];
    if (days.length > 0) {
        const daySet = new Set(days.map(normalizeWeekdayToken));
        const matchesDay = getWeekdayKeys(targetDate).some((key) => daySet.has(normalizeWeekdayToken(key)));
        if (!matchesDay) return false;
    }

    const hasOperatingHours = !!category?.operatingHours && Object.keys(category.operatingHours).length > 0;
    const operatingHours = getDayValue(category?.operatingHours, targetDate);
    if (hasOperatingHours && !operatingHours) return false;

    return true;
};

const resolveCategoryInterval = (category: any, selectedTickets: KioskTicket[], categoryId: string): number => {
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

const buildAllowedTimesForCategory = (
    category: any,
    date: Date,
    hospitalOperatingHours: Record<string, string> | undefined,
    selectedTickets: KioskTicket[]
): string[] => {
    const targetDate = startOfDay(date);
    if (category && !isCategoryActiveOnDate(category, date)) {
        return [];
    }

    const hasCategoryOperatingHours = !!category?.operatingHours && Object.keys(category.operatingHours).length > 0;
    const categoryRange = category ? getDayValue(category?.operatingHours, targetDate) : undefined;
    if (category && hasCategoryOperatingHours && !categoryRange) {
        return [];
    }

    const openRange = parseTimeRange(categoryRange || getDayValue(hospitalOperatingHours, targetDate) || DEFAULT_CATEGORY_DAY_RANGE);
    if (!openRange) {
        return [];
    }

    const breakRange = category ? parseTimeRange(getDayValue(category?.breakHours, targetDate)) : null;
    const interval = category ? resolveCategoryInterval(category, selectedTickets, String(category?.id || '')) : 30;
    const slots: string[] = [];

    for (let minute = openRange.start; minute + interval <= openRange.end; minute += interval) {
        const slotEnd = minute + interval;
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

const pickNearestAllowedTime = (current: string, allowedTimes: string[]): string => {
    if (allowedTimes.length === 0) return '';
    if (allowedTimes.includes(current)) return current;

    const currentMinutes = /^\d{2}:\d{2}$/.test(current) ? toMinutes(current) : toMinutes(allowedTimes[0] || '00:00');
    let nearest = allowedTimes[0] || '';
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

type TicketCycleState = {
    canReserve: boolean;
    isExpired: boolean;
    intervalBlocked: boolean;
    nextAvailableAt?: Date;
    message: string;
};

const evaluateTicketCycleState = (ticket: KioskTicket, targetDate: Date): TicketCycleState => {
    const target = startOfDay(targetDate);

    if ((ticket.remainingCount || 0) <= 0) {
        return {
            canReserve: false,
            isExpired: false,
            intervalBlocked: false,
            message: '잔여 횟수가 없어 예약할 수 없습니다.',
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
        message: '예약 가능한 시술권입니다.',
    };
};

const matchesPlannedTicket = (ticket: KioskTicket, tokens: string[]): boolean => {
    if (tokens.length === 0) return false;
    const ticketIdToken = normalizeToken(ticket.ticketId);
    const ticketNameToken = normalizeToken(ticket.ticketName);
    const itemCodeToken = normalizeToken(ticket.itemCode || '');
    return tokens.some((token) =>
        token === ticketIdToken ||
        (!!itemCodeToken && token === itemCodeToken) ||
        token === ticketNameToken
    );
};

interface ReservationDetailPanelProps {
    isOpen: boolean;
    onClose: () => void;
    appointment: any;
    onCancel: (id: number, reason?: string, isNoShow?: boolean) => void;
    onSave?: () => void;
    initialPatient?: any;
    initialCategoryId?: string;
    initialDate?: Date;
    initialTime?: string;
}

const ReservationDetailPanel: React.FC<ReservationDetailPanelProps> = ({ isOpen, onClose, appointment, onCancel, onSave, initialPatient, initialCategoryId, initialDate, initialTime }) => {
    const navigate = useNavigate();
    const { showAlert } = useAlert();
    const { settings } = useSettingsStore();
    const { procedureCategories } = useChartStore();

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    // Form state
    const [apptDate, setApptDate] = useState<Date>(new Date());
    const [apptTime, setApptTime] = useState('10:00');
    const [visitPurposeId, setVisitPurposeId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [memo, setMemo] = useState('');
    const [skipCrmMessage, setSkipCrmMessage] = useState(false);

    // Create Mode State
    const isCreateMode = !appointment;
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false);
    const [availableTickets, setAvailableTickets] = useState<KioskTicket[]>([]);
    const [ticketsLoading, setTicketsLoading] = useState(false);
    const [ticketLoadError, setTicketLoadError] = useState<string>('');
    const [selectedPlannedTicketIds, setSelectedPlannedTicketIds] = useState<number[]>([]);

    // Pre-fill patient from external navigation (e.g. search modal)
    useEffect(() => {
        if (initialPatient) {
            setSelectedPatient(initialPatient);
        }
    }, [initialPatient]);


    // Initialize form when panel opens or appointment changes
    useEffect(() => {
        if (!isOpen) return;
        if (appointment) {
            setApptDate(new Date(appointment.scheduledAt || appointment.time || new Date()));
            const timeStr = appointment.scheduledAt
                ? new Date(appointment.scheduledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                : appointment.time || '10:00';
            setApptTime(timeStr);
            setVisitPurposeId(appointment.visitPurposeId || '');
            setCategoryId(appointment.category || appointment.colId || '');
            setMemo(appointment.memo || '');
            setSkipCrmMessage(appointment.skipCrmMessage || false);
        } else {
            setApptDate(initialDate || new Date());
            setApptTime(initialTime || '10:00');
            setVisitPurposeId('');
            setCategoryId(initialCategoryId || '');
            setMemo('');
            setSkipCrmMessage(false);
            setSelectedPatient(initialPatient || null);
            setAvailableTickets([]);
            setSelectedPlannedTicketIds([]);
            setTicketLoadError('');
        }
    }, [isOpen, appointment]);

    // Consolidated Patient Data
    const displayPatient = isCreateMode ? selectedPatient : appointment;
    const activePatientId = Number(
        isCreateMode
            ? (selectedPatient?.id ?? 0)
            : (appointment?.customerId ?? appointment?.patientId ?? appointment?.id ?? 0)
    );
    const hospitalOperatingHours = (settings.hospital?.operatingHours || {}) as Record<string, string>;
    const procedureCategoryById = React.useMemo(() => {
        const map = new Map<string, any>();
        (procedureCategories || []).forEach((category: any) => {
            map.set(String(category?.id ?? ''), category);
        });
        return map;
    }, [procedureCategories]);
    const selectedPlannedTickets = React.useMemo(() => {
        const selectedIds = new Set(selectedPlannedTicketIds);
        return availableTickets.filter((ticket) => selectedIds.has(ticket.ticketHistId));
    }, [availableTickets, selectedPlannedTicketIds]);
    const selectedPlannedTicketCycles = React.useMemo(() => {
        const map = new Map<number, TicketCycleState>();
        selectedPlannedTickets.forEach((ticket) => {
            map.set(ticket.ticketId, evaluateTicketCycleState(ticket, apptDate));
        });
        return map;
    }, [selectedPlannedTickets, apptDate]);
    const categoryOptions = React.useMemo(() => {
        if (selectedPlannedTickets.length === 0) return procedureCategories;

        const map = new Map<string, any>();
        selectedPlannedTickets.forEach((ticket) => {
            (ticket.categories || []).forEach((category) => {
                const key = String(category?.id ?? '');
                if (!key || map.has(key)) return;
                map.set(key, procedureCategoryById.get(key) || {
                    id: key,
                    name: category?.name || key,
                    interval: category?.interval || 30,
                });
            });
        });

        return Array.from(map.values());
    }, [selectedPlannedTickets, procedureCategories, procedureCategoryById]);
    const selectedCategory = React.useMemo(() => {
        if (!categoryId) return null;
        return categoryOptions.find((category: any) => String(category?.id) === String(categoryId))
            || procedureCategoryById.get(String(categoryId))
            || null;
    }, [categoryId, categoryOptions, procedureCategoryById]);
    const selectedTicketSupportsCurrentCategory =
        selectedPlannedTickets.length === 0 ||
        !categoryId ||
        selectedPlannedTickets.some((ticket) =>
            Array.isArray(ticket.categories) &&
            ticket.categories.some((cat) => String(cat.id) === String(categoryId))
        );
    const allowedTimes = React.useMemo(
        () => buildAllowedTimesForCategory(selectedCategory, apptDate, hospitalOperatingHours, selectedPlannedTickets),
        [selectedCategory, apptDate, hospitalOperatingHours, selectedPlannedTickets]
    );

    useEffect(() => {
        if (!isOpen) {
            setAvailableTickets([]);
            setSelectedPlannedTicketIds([]);
            setTicketLoadError('');
            return;
        }

        if (isSaving || activePatientId <= 0 || !settings.activeBranchId) {
            setTicketsLoading(false);
            return;
        }

        let cancelled = false;

        const loadTickets = async () => {
            setTicketsLoading(true);
            setTicketLoadError('');
            try {
                const response = await apiClient.get<{ tickets: CustomerTicketItem[]; totalBalance: number }>(`/customers/${activePatientId}/tickets`);
                const tickets: KioskTicket[] = (response.data?.tickets || []).map(mapCustomerTicketToKioskTicket);
                if (cancelled) return;

                setAvailableTickets(tickets);

                const storedTicketIdTokens = toStringArray(
                    isCreateMode
                        ? selectedPatient?.plannedTicketIds
                        : appointment?.plannedTicketIds
                ).map(normalizeToken);
                const storedTicketNameTokens = toStringArray(
                    isCreateMode
                        ? selectedPatient?.plannedTicketNames
                        : appointment?.plannedTicketNames
                ).map(normalizeToken);
                const plannedTokens = [...storedTicketIdTokens, ...storedTicketNameTokens].filter(Boolean);

                const matchedHistIds = plannedTokens.length > 0
                    ? tickets.filter((ticket) => matchesPlannedTicket(ticket, plannedTokens)).map((ticket) => ticket.ticketHistId)
                    : [];

                setSelectedPlannedTicketIds((prev) => {
                    const keepCurrent = prev.filter((id) => tickets.some((ticket) => ticket.ticketHistId === id));
                    if (matchedHistIds.length > 0) {
                        return Array.from(new Set(matchedHistIds));
                    }
                    if (keepCurrent.length > 0) {
                        return keepCurrent;
                    }
                    if (tickets.length === 1) {
                        return [tickets[0]!.ticketHistId];
                    }
                    return [];
                });
            } catch (error: any) {
                if (cancelled) return;
                setAvailableTickets([]);
                setSelectedPlannedTicketIds([]);
                setTicketLoadError(error?.response?.data?.message || '남은 시술권을 불러오지 못했습니다.');
            } finally {
                if (!cancelled) {
                    setTicketsLoading(false);
                }
            }
        };

        void loadTickets();

        return () => {
            cancelled = true;
        };
    }, [
        isOpen,
        activePatientId,
        settings.activeBranchId,
        isSaving,
    ]);

    useEffect(() => {
        if (selectedPlannedTickets.length === 0) return;

        const uniqueVisitPurposeIds = Array.from(new Set(
            selectedPlannedTickets
                .map((ticket) => String(ticket.visitPurposeId || '').trim())
                .filter(Boolean)
        ));

        if (uniqueVisitPurposeIds.length === 1 && uniqueVisitPurposeIds[0] !== visitPurposeId) {
            setVisitPurposeId(uniqueVisitPurposeIds[0] || '');
        }

        const nextCategoryId = String(categoryOptions[0]?.id || '');
        const categoryIds = new Set(categoryOptions.map((category: any) => String(category?.id ?? '')));
        if (nextCategoryId && (!categoryId || !categoryIds.has(String(categoryId)))) {
            setCategoryId(nextCategoryId);
        }
    }, [selectedPlannedTickets, categoryOptions, categoryId, visitPurposeId]);

    useEffect(() => {
        if (allowedTimes.length === 0) {
            if (apptTime !== '') {
                setApptTime('');
            }
            return;
        }

        const nextTime = pickNearestAllowedTime(apptTime, allowedTimes);
        if (nextTime && nextTime !== apptTime) {
            setApptTime(nextTime);
        }
    }, [allowedTimes, apptTime]);

    if (!isOpen) return null;

    const handleConfirmCancel = (reason: string, isNoShow: boolean) => {
        if (appointment) onCancel(appointment.id, reason, isNoShow);
        setIsCancelModalOpen(false);
        onClose();
    };

    const validatePartnerSchedule = (date: Date, time: string, catId: string) => {
        const category = procedureCategories.find(c => c.id === catId);

        if (!category || !category.isPartner) return null;

        const dayMap: string[] = ['일', '월', '화', '수', '목', '금', '토'];
        const dayIndex = date.getDay();
        const dayLabel = dayMap[dayIndex];

        if (!dayLabel) return null;

        if (category.days && !category.days.includes(dayLabel)) {
            return `해당 예약 항목은 ${dayLabel}요일에 예약할 수 없습니다.\n(가능 요일: ${category.days.join(', ')})`;
        }

        const toMinutes = (t: string) => {
            const [hStr, mStr] = t.split(':');
            const h = parseInt(hStr || '0', 10);
            const m = parseInt(mStr || '0', 10);
            return h * 60 + m;
        };

        const apptMinutes = toMinutes(time);

        if (category.operatingHours && category.operatingHours[dayLabel]) {
            const range = category.operatingHours[dayLabel];
            if (range) {
                const parts = range.split('~');
                const start = parts[0];
                const end = parts[1];
                const startMin = toMinutes(start || '');
                const endMin = toMinutes(end || '');

                // Check if appointment is OUTSIDE operating hours
                if (apptMinutes < startMin || apptMinutes > endMin) {
                    return `해당 예약 항목의 ${dayLabel}요일 예약 가능 시간은 ${range} 입니다.`;
                }
            }
        }

        if (category.breakHours && category.breakHours[dayLabel]) {
            const range = category.breakHours[dayLabel];
            if (range) {
                const parts = range.split('~');
                const start = parts[0];
                const end = parts[1];
                const startMin = toMinutes(start || '');
                const endMin = toMinutes(end || '');

                // Check if appointment is INSIDE break time
                if (apptMinutes >= startMin && apptMinutes < endMin) {
                    return `선택하신 시간(${time})은 휴게시간(${range}) 입니다.`;
                }
            }
        }

        return null;
    };

    const handleSave = async () => {
        if (isCreateMode && !selectedPatient) {
            showAlert({ message: '환자를 선택해주세요.', type: 'warning' });
            return;
        }

        if (!apptTime) {
            showAlert({ message: '예약 시간을 선택해주세요.', type: 'warning' });
            return;
        }

        if (!categoryId || isNaN(Number(categoryId)) || Number(categoryId) <= 0) {
            showAlert({ message: '예약 카테고리를 선택해주세요.', type: 'warning' });
            return;
        }

        if (categoryId) {
            const validationError = validatePartnerSchedule(apptDate, apptTime, categoryId);
            if (validationError) {
                showAlert({ message: validationError, type: 'warning' });
                return;
            }
        }

        setIsSaving(true);
        try {
            // Combine date and time
            const [hStr, mStr] = apptTime.split(':');
            const hours = Number(hStr || '0');
            const minutes = Number(mStr || '0');

            const scheduledAt = new Date(apptDate);
            scheduledAt.setHours(hours, minutes, 0, 0);

            const selectedTicketsForSave = selectedPlannedTickets;

            if (selectedTicketsForSave.length > 0) {
                for (const ticket of selectedTicketsForSave) {
                    const ticketCycleState = evaluateTicketCycleState(ticket, scheduledAt);
                    if (!ticketCycleState.canReserve) {
                        showAlert({ message: `[${ticket.ticketName}] ${ticketCycleState.message || '선택한 시술권 조건으로 예약할 수 없습니다.'}`, type: 'warning' });
                        return;
                    }
                }

                const allowedCategoryIds = new Set(
                    selectedTicketsForSave.flatMap((ticket) => (ticket.categories || []).map((cat) => String(cat.id)))
                );
                if (categoryId && allowedCategoryIds.size > 0 && !allowedCategoryIds.has(String(categoryId))) {
                    showAlert({ message: '선택한 시술권들에 연결된 예약 카테고리를 다시 선택해주세요.', type: 'warning' });
                    return;
                }
            }

            if (categoryId && allowedTimes.length > 0 && !allowedTimes.includes(apptTime)) {
                showAlert({ message: '선택한 카테고리의 예약 가능 시간만 선택할 수 있습니다.', type: 'warning' });
                return;
            }

            if (isCreateMode) {
                if (!selectedPatient) {
                    showAlert({ message: '환자 정보가 올바르지 않습니다.', type: 'error' });
                    setIsSaving(false);
                    return;
                }
                const customerName = selectedPatient.name || '';
                const customerPhone = selectedPatient.phone || selectedPatient.telNo || '';
                if (!customerName || !customerPhone) {
                    showAlert({ message: '환자 이름과 전화번호가 필요합니다.', type: 'warning' });
                    setIsSaving(false);
                    return;
                }
                const ticketInfos = selectedTicketsForSave.length > 0
                    ? selectedTicketsForSave.map(t => ({
                        id: Number(t.ticketId),
                        name: String(t.ticketName || ''),
                        qty: 1,
                    }))
                    : undefined;
                const visitPurposeNames = selectedTicketsForSave.length > 0
                    ? Array.from(new Set(
                        selectedTicketsForSave
                            .map(t => String((t as any).visitPurposeName || (t as any).visitPurposeLabel || '').trim())
                            .filter(Boolean)
                    ))
                    : undefined;
                await visitService.createReservation({
                    customerName,
                    customerPhoneNumber: customerPhone,
                    reservationDateTime: scheduledAt.toISOString(),
                    reservCategoryId: Number(categoryId),
                    branchId: Number(settings.activeBranchId),
                    memo: memo || undefined,
                    ticketInfos,
                    visitPurposeNames: visitPurposeNames && visitPurposeNames.length > 0 ? visitPurposeNames : undefined,
                });
            } else {
                await visitService.updateReservation(Number(appointment.id), {
                    reservationDateTime: scheduledAt.toISOString(),
                    reservCategoryId: categoryId ? Number(categoryId) : undefined,
                    memo: memo || undefined,
                });
            }

            onSave?.();
            onClose();
        } catch (error) {
            console.error('Failed to save reservation:', error);
            const message =
                (error as any)?.response?.data?.message ||
                (error as any)?.message ||
                '저장 중 오류가 발생했습니다.';
            showAlert({ message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="w-full md:w-[480px] h-full bg-white border-l border-gray-200 shadow-xl flex flex-col z-50">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-gray-900">예약</h2>
                        {!isCreateMode && (
                            appointment.status === 'cancelled' ? (
                                <span className="px-2 py-1 bg-gray-100 text-gray-500 text-sm font-bold rounded">취소</span>
                            ) : (
                                <span className="px-2 py-1 bg-green-50 text-green-600 text-sm font-bold rounded">확정</span>
                            )
                        )}
                    </div>
                    {!isCreateMode && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => navigate(`/app/chart-view/${appointment.customerId || appointment.no}`)}
                                className="h-10 px-4 flex items-center gap-2 border border-[#C5CAE9] rounded-lg hover:bg-[#E8EAF6] text-[#242424] font-bold text-sm"
                            >
                                <FileText className="w-4 h-4" />
                                차트 열기
                            </button>
                            <button
                                onClick={() => setIsHistoryModalOpen(true)}
                                className="h-10 px-4 flex items-center gap-2 border border-[#C5CAE9] rounded-lg hover:bg-[#E8EAF6] text-[#242424] font-bold text-sm"
                            >
                                <History className="w-4 h-4" />
                                수정이력
                            </button>
                            <button onClick={onClose} className="ml-2 p-2 hover:bg-gray-100 rounded-full text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                    {isCreateMode && (
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Patient Section: Search vs Info Card */}
                    {isCreateMode && !selectedPatient ? (
                        <div className="space-y-1.5">
                            <label className="block text-sm font-bold text-gray-500">환자명*</label>
                            <div
                                onClick={() => setIsPatientSearchOpen(true)}
                                className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer hover:border-[#3F51B5] hover:ring-1 hover:ring-[#E8EAF6] transition-all bg-white"
                            >
                                <User className="w-5 h-5 text-gray-400" />
                                <span className="text-gray-400 text-sm">환자 검색(Ctrl+Shift+f)</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50 rounded-lg p-5 space-y-3 relative group">
                            {isCreateMode && (
                                <button
                                    onClick={() => setSelectedPatient(null)}
                                    className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded-md text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <div className="grid grid-cols-[80px_1fr] gap-y-3 items-center text-sm">
                                <div className="text-slate-500 font-medium">no.</div>
                                <div className="font-bold text-gray-900">{isCreateMode ? (displayPatient?.id || '-') : (appointment?.customerId || appointment?.patientId || displayPatient?.id || '-')}</div>

                                <div className="text-slate-500 font-medium">환자명</div>
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-gray-900">{displayPatient?.name}</span>
                                    <User className="w-4 h-4 text-gray-400" />
                                </div>

                                <div className="text-slate-500 font-medium">대표연락처</div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-900 font-medium">{displayPatient?.phone || displayPatient?.telNo || '-'}</span>
                                    <MessageSquare className="w-4 h-4 text-gray-400" />
                                </div>

                                <div className="text-slate-500 font-medium">성별/나이</div>
                                <div className="text-gray-900">{displayPatient?.gender || '-'}, {displayPatient?.age || '-'}세</div>
                            </div>
                        </div>
                    )}

                    {/* Form Fields */}
                    <div className="space-y-5">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-bold text-gray-500">남은 시술권 / 다음 예약</label>
                                <div className="flex items-center gap-2">
                                    {selectedPlannedTicketIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedPlannedTicketIds([])}
                                            className="text-xs font-bold text-gray-400 hover:text-gray-600"
                                        >
                                            선택 해제
                                        </button>
                                    )}
                                    {ticketsLoading && <span className="text-xs text-gray-400">불러오는 중...</span>}
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-white">
                                {availableTickets.length > 0 ? (
                                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                                        {availableTickets.map((ticket) => {
                                            const histId = ticket.ticketHistId;
                                            const selected = selectedPlannedTicketIds.includes(histId);
                                            const cycleState = evaluateTicketCycleState(ticket, apptDate);
                                            const disabled = !cycleState.canReserve;
                                            return (
                                                <button
                                                    key={histId}
                                                    type="button"
                                                    disabled={disabled}
                                                    onClick={() => {
                                                        if (disabled) return;
                                                        setSelectedPlannedTicketIds((prev) => {
                                                            if (prev.includes(histId)) {
                                                                return prev.filter((id) => id !== histId);
                                                            }
                                                            const newTicketCategories = new Set((ticket.categories || []).map((c: any) => String(c.id)));
                                                            const currentTickets = availableTickets.filter((t) => prev.includes(t.ticketHistId));
                                                            const compatible = currentTickets.every((t) =>
                                                                (t.categories || []).some((c: any) => newTicketCategories.has(String(c.id)))
                                                            );
                                                            if (!compatible) {
                                                                return [histId];
                                                            }
                                                            return [...prev, histId];
                                                        });
                                                    }}
                                                    className={`w-full px-3 py-3 text-left transition ${
                                                        disabled
                                                            ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                                                            : selected ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                                            disabled
                                                                ? 'border-gray-300 bg-gray-200 text-transparent'
                                                                : selected
                                                                    ? 'border-blue-500 bg-[#3F51B5] text-white'
                                                                    : 'border-gray-300 bg-white text-transparent'
                                                        }`}>
                                                            <Check className="h-3 w-3" strokeWidth={3} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className={`truncate text-sm font-bold ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{ticket.ticketName}</div>
                                                            <div className="mt-1 text-[11px] text-gray-500">
                                                                잔여 {ticket.remainingCount}/{ticket.totalCount}
                                                                <span className="mx-1.5 text-gray-300">|</span>
                                                                만료 {formatDateOnly(ticket.expiryDate)}
                                                                {(ticket.minIntervalDays ?? 0) > 0 && (
                                                                    <>
                                                                        <span className="mx-1.5 text-gray-300">|</span>
                                                                        최소주기 {ticket.minIntervalDays}일
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className={`mt-1 text-[11px] font-bold ${
                                                                cycleState.canReserve ? 'text-emerald-600' : 'text-rose-500'
                                                            }`}>
                                                                {cycleState.message}
                                                                {cycleState.nextAvailableAt && !cycleState.canReserve && (
                                                                    <span className="ml-1 font-normal text-gray-400">
                                                                        (다음 가능일: {formatDateOnly(cycleState.nextAvailableAt)})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="px-3 py-3 text-sm text-gray-400">시술권 미선택</div>
                                )}
                            </div>

                            {!!ticketLoadError && (
                                <div className="text-xs text-red-500">{ticketLoadError}</div>
                            )}

                            {!ticketsLoading && !ticketLoadError && availableTickets.length === 0 && (
                                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                                    선택 가능한 잔여 시술권이 없습니다.
                                </div>
                            )}

                            {selectedPlannedTickets.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-xs font-bold text-gray-500">
                                        선택된 시술권 {selectedPlannedTickets.length}건
                                    </div>
                                    {selectedPlannedTickets.map((ticket) => {
                                        const cycleState = selectedPlannedTicketCycles.get(ticket.ticketId);
                                        return (
                                            <div
                                                key={`selected-${ticket.ticketId}`}
                                                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600 space-y-2"
                                            >
                                                <div className="font-bold text-gray-900">{ticket.ticketName}</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>잔여: <span className="font-bold text-gray-800">{ticket.remainingCount}/{ticket.totalCount}</span></div>
                                                    <div>만료: <span className="font-bold text-gray-800">{formatDateOnly(ticket.expiryDate)}</span></div>
                                                </div>
                                                <div className={cycleState?.canReserve ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>
                                                    {cycleState?.message}
                                                </div>
                                                {ticket.categories?.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {ticket.categories.map((cat) => {
                                                            const active = String(categoryId) === String(cat.id);
                                                            return (
                                                                <button
                                                                    key={`${ticket.ticketId}-${cat.id}`}
                                                                    type="button"
                                                                    onClick={() => setCategoryId(String(cat.id))}
                                                                    className={`rounded-full border px-2 py-1 text-[11px] font-bold transition ${
                                                                        active
                                                                            ? 'border-[#3F51B5] bg-[#E8EAF6] text-[#3F51B5]'
                                                                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                                                                    }`}
                                                                >
                                                                    {cat.name}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {!selectedTicketSupportsCurrentCategory && (
                                        <div className="text-[11px] font-bold text-amber-600">
                                            현재 선택 카테고리는 선택된 시술권 중 어느 항목과도 매칭되지 않습니다.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Category */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-bold text-gray-500">카테고리</label>
                            <div className="relative">
                                <select
                                    value={categoryId}
                                    onChange={(e) => setCategoryId(e.target.value)}
                                    className={`w-full h-10 px-3 border border-gray-200 rounded hover:border-[#3F51B5] focus:border-[#536DFE] outline-none appearance-none bg-white text-sm ${!categoryId ? 'text-gray-400' : 'text-gray-800'}`}
                                >
                                    <option value="">미지정</option>
                                    {categoryOptions.map((c: any) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                            {selectedPlannedTickets.length > 0 && (
                                <div className="text-[11px] text-gray-400">
                                    선택된 시술권과 연결된 예약 카테고리만 표시됩니다.
                                </div>
                            )}
                        </div>

                        {/* Date & Time */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-gray-500">날짜*</label>
                                <CustomDatePicker
                                    value={apptDate}
                                    onChange={setApptDate}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-gray-500">시간*</label>
                                <CustomTimePicker
                                    value={apptTime}
                                    onChange={setApptTime}
                                    align="right"
                                    allowedTimes={allowedTimes}
                                    disabled={allowedTimes.length === 0}
                                    placeholder={categoryId ? '가능 시간 선택' : '운영시간 내 선택'}
                                />
                                <div className="text-[11px] text-gray-400">
                                    {!categoryId
                                        ? '카테고리를 먼저 고르면 해당 카테고리의 예약 가능 시간만 표시됩니다.'
                                        : allowedTimes.length > 0
                                            ? `${allowedTimes[0]} ~ ${allowedTimes[allowedTimes.length - 1]} 중 선택 가능`
                                            : '선택한 카테고리의 예약 가능 시간이 없습니다.'}
                                </div>
                            </div>
                        </div>

                        {/* Memo */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <label className="block text-sm font-bold text-gray-500">예약메모</label>
                                <span className="text-xs text-gray-400">{memo.length}/600</span>
                            </div>
                            <div className="relative">
                                <textarea
                                    value={memo}
                                    onChange={(e) => setMemo(e.target.value.slice(0, 600))}
                                    className="w-full h-48 p-3 border border-gray-200 rounded hover:border-[#3F51B5] focus:border-[#536DFE] outline-none text-sm resize-none leading-relaxed font-medium text-gray-800"
                                    placeholder="예약 관련 메모를 입력하세요..."
                                />
                            </div>
                        </div>

                        {/* CRM Checkbox */}
                        <div className="flex items-center gap-2 pt-2">
                            <input
                                type="checkbox"
                                id="crm"
                                checked={skipCrmMessage}
                                onChange={(e) => setSkipCrmMessage(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-[#3F51B5] focus:ring-[#536DFE]"
                            />
                            <label htmlFor="crm" className="text-sm font-bold text-gray-700 select-none">CRM 메시지 보내지 않기</label>
                            <AlertCircle className="w-4 h-4 text-gray-400" />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-white shrink-0">
                    {/* Left Button */}
                    {!isCreateMode ? (
                        appointment?.status !== 'cancelled' ? (
                            <button
                                onClick={() => setIsCancelModalOpen(true)}
                                className="px-4 py-2 border border-red-200 text-red-500 font-bold rounded hover:bg-red-50 text-sm"
                            >
                                예약 취소
                            </button>
                        ) : <div></div>
                    ) : (
                        <div className="flex-1"></div>
                    )}

                    {/* Right Buttons */}
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 text-gray-700 font-bold rounded hover:bg-gray-50 text-sm"
                        >
                            {isCreateMode ? "취소" : "닫기"}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-2 bg-[#3F51B5] text-white font-bold rounded hover:bg-[#303F9F] text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isCreateMode ? "등록" : "수정"}
                        </button>
                    </div>
                </div>
            </div>

            <ReservationCancelModal
                isOpen={isCancelModalOpen}
                onClose={() => setIsCancelModalOpen(false)}
                onConfirm={handleConfirmCancel}
            />

            <PatientSearchModal
                isOpen={isPatientSearchOpen}
                onClose={() => setIsPatientSearchOpen(false)}
                onSelectPatient={(patient) => setSelectedPatient(patient)}
            />
            {!isCreateMode && appointment?.id && (
                <ReservationChangeHistoryModal
                    isOpen={isHistoryModalOpen}
                    onClose={() => setIsHistoryModalOpen(false)}
                    reservationId={appointment.id}
                />
            )}
        </>
    );
};

export default ReservationDetailPanel;

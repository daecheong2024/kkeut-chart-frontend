import apiClient from './apiClient';
import type { ProcedureCategory } from '../types/settings';

interface ReservCategoryScheduleResponse {
    id: number;
    branchId: number;
    reservCategoryId: number;
    dayOfWeek: string;
    reservationCount: number | null;
    operatingStartTime: string | null;
    operatingEndTime: string | null;
    breakStartTime: string | null;
    breakEndTime: string | null;
    name: string;
}

interface ReservCategoryResponse {
    id: number;
    branchId: number;
    name: string;
    type: string;
    reservationInterval: number;
    reservationCount: number | null;
    startDate: string | null;
    endDate: string | null;
    isPartner: boolean | null;
    visitPurposes: { name: string }[];
    schedules: ReservCategoryScheduleResponse[];
}

interface CreateReservCategoryScheduleRequest {
    dayOfWeek: string;
    reservationCount?: number | null;
    operatingStartTime?: string | null;
    operatingEndTime?: string | null;
    breakStartTime?: string | null;
    breakEndTime?: string | null;
    name: string;
}

interface CreateReservCategoryRequest {
    name: string;
    type: string;
    reservationInterval: number;
    reservationCount?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    visitPurposeNames?: string[];
    isPartner?: boolean | null;
    schedules?: CreateReservCategoryScheduleRequest[];
}

interface UpdateReservCategoryRequest {
    name?: string;
    type?: string;
    reservationInterval?: number;
    reservationCount?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    visitPurposeNames?: string[];
    isPartner?: boolean | null;
    schedules?: CreateReservCategoryScheduleRequest[];
}

function parseTimeOnly(isoOrNull: string | null | undefined): string {
    if (!isoOrNull) return '';
    const d = new Date(isoOrNull);
    if (isNaN(d.getTime())) {
        const match = isoOrNull.match(/(\d{2}:\d{2})/);
        return match?.[1] ?? '';
    }
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeToIso(time: string): string | null {
    if (!time) return null;
    return `1970-01-01T${time}:00`;
}

function responseToProcedureCategory(r: ReservCategoryResponse): ProcedureCategory {
    const days: string[] = [];
    const operatingHours: Record<string, string> = {};
    const breakHours: Record<string, string> = {};
    const dailyReservationCounts: Record<string, number> = {};

    for (const s of r.schedules || []) {
        if (!days.includes(s.dayOfWeek)) days.push(s.dayOfWeek);

        const opStart = parseTimeOnly(s.operatingStartTime);
        const opEnd = parseTimeOnly(s.operatingEndTime);
        if (opStart && opEnd) {
            operatingHours[s.dayOfWeek] = `${opStart}~${opEnd}`;
        }

        const brStart = parseTimeOnly(s.breakStartTime);
        const brEnd = parseTimeOnly(s.breakEndTime);
        if (brStart && brEnd) {
            breakHours[s.dayOfWeek] = `${brStart}~${brEnd}`;
        }

        if (s.reservationCount != null) {
            dailyReservationCounts[s.dayOfWeek] = s.reservationCount;
        }
    }

    return {
        id: String(r.id),
        name: r.name,
        type: r.type,
        reservationCount: r.reservationCount ?? 0,
        interval: r.reservationInterval,
        startDate: r.startDate ? r.startDate.substring(0, 10) : undefined,
        endDate: r.endDate ? r.endDate.substring(0, 10) : undefined,
        useEndDate: !!r.endDate,
        isPartner: r.isPartner ?? false,
        visitPurpose: r.visitPurposes.map(v => v.name),
        days: days.length > 0 ? days : undefined,
        operatingHours: Object.keys(operatingHours).length > 0 ? operatingHours : undefined,
        breakHours: Object.keys(breakHours).length > 0 ? breakHours : undefined,
        dailyReservationCounts: Object.keys(dailyReservationCounts).length > 0 ? dailyReservationCounts : undefined,
    };
}

function buildSchedules(cat: Partial<ProcedureCategory>): CreateReservCategoryScheduleRequest[] {
    const schedules: CreateReservCategoryScheduleRequest[] = [];
    const days = cat.days || [];

    for (const day of days) {
        const opRaw = cat.operatingHours?.[day] || '';
        const brRaw = cat.breakHours?.[day] || '';
        const [opStart = '', opEnd = ''] = opRaw.includes('~') ? opRaw.split('~') : [];
        const [brStart = '', brEnd = ''] = brRaw.includes('~') ? brRaw.split('~') : [];

        schedules.push({
            dayOfWeek: day,
            reservationCount: cat.dailyReservationCounts?.[day] ?? null,
            operatingStartTime: timeToIso(opStart),
            operatingEndTime: timeToIso(opEnd),
            breakStartTime: timeToIso(brStart),
            breakEndTime: timeToIso(brEnd),
            name: cat.name || '',
        });
    }

    return schedules;
}

const BASE = '/settings/common/reserv-categories';

export const reservCategoryService = {
    async getAll(): Promise<ProcedureCategory[]> {
        const { data } = await apiClient.get<ReservCategoryResponse[]>(BASE);
        return (data || []).map(responseToProcedureCategory);
    },

    async getById(id: number): Promise<ProcedureCategory> {
        const { data } = await apiClient.get<ReservCategoryResponse>(`${BASE}/${id}`);
        return responseToProcedureCategory(data);
    },

    async create(cat: ProcedureCategory): Promise<ProcedureCategory> {
        const request: CreateReservCategoryRequest = {
            name: cat.name,
            type: cat.type,
            reservationInterval: cat.interval,
            reservationCount: cat.reservationCount,
            startDate: cat.startDate || null,
            endDate: cat.useEndDate && cat.endDate ? cat.endDate : null,
            visitPurposeNames: cat.visitPurpose || [],
            isPartner: cat.isPartner ?? false,
            schedules: buildSchedules(cat),
        };
        const { data } = await apiClient.post<ReservCategoryResponse>(BASE, request);
        return responseToProcedureCategory(data);
    },

    async update(id: string, cat: Partial<ProcedureCategory>): Promise<ProcedureCategory> {
        const request: UpdateReservCategoryRequest = {};
        if (cat.name !== undefined) request.name = cat.name;
        if (cat.type !== undefined) request.type = cat.type;
        if (cat.interval !== undefined) request.reservationInterval = cat.interval;
        if (cat.reservationCount !== undefined) request.reservationCount = cat.reservationCount;
        if (cat.startDate !== undefined) request.startDate = cat.startDate || null;
        if (cat.endDate !== undefined || cat.useEndDate !== undefined) {
            request.endDate = cat.useEndDate && cat.endDate ? cat.endDate : null;
        }
        if (cat.visitPurpose !== undefined) request.visitPurposeNames = cat.visitPurpose;
        if (cat.isPartner !== undefined) request.isPartner = cat.isPartner;
        if (cat.days !== undefined) request.schedules = buildSchedules(cat as ProcedureCategory);

        const { data } = await apiClient.put<ReservCategoryResponse>(`${BASE}/${id}`, request);
        return responseToProcedureCategory(data);
    },

    async delete(id: string): Promise<void> {
        await apiClient.delete(`${BASE}/${id}`);
    },
};

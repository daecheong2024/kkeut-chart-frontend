import apiClient from './apiClient';

export interface WeekTicketDefResponse {
    id: number;
    branchId: number;
    name: string;
    availableDays: string;
    isActive: boolean;
    startTime: string | null;
    endTime: string | null;
    creator: string;
    createTime: string;
    modifier: string;
    modifyTime: string | null;
}

export interface CreateWeekTicketDefRequest {
    name: string;
    availableDays: string;
    isActive?: boolean;
    startTime?: string | null;
    endTime?: string | null;
}

export interface UpdateWeekTicketDefRequest {
    name?: string | null;
    availableDays?: string | null;
    isActive?: boolean | null;
    startTime?: string | null;
    endTime?: string | null;
}

export interface WeekTicketDefFilterParams {
    name?: string;
    isActive?: boolean;
}

const BASE = '/settings/week-tickets';

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function allowedDaysToApiString(days?: number[]): string {
    if (!days || days.length === 0) return DAY_LABELS.join(",");
    return days.map((i) => DAY_LABELS[i]).filter(Boolean).join(",");
}

export function apiStringToAllowedDays(s?: string | null): number[] {
    if (!s) return [];
    return s
        .split(",")
        .map((d) => d.trim())
        .map((d) => DAY_LABELS.indexOf(d))
        .filter((i) => i >= 0);
}

export function timeToApiDateTime(time?: string | null): string | null {
    if (!time) return null;
    return `1900-01-01T${time}:00`;
}

export function apiDateTimeToTime(dt?: string | null): string | undefined {
    if (!dt) return undefined;
    const m = dt.match(/(\d{2}:\d{2})/);
    return m ? m[1] : undefined;
}

export const weekTicketDefService = {
    async getAll(filters?: WeekTicketDefFilterParams): Promise<WeekTicketDefResponse[]> {
        const params: Record<string, string | boolean> = {};
        if (filters?.name) params.name = filters.name;
        if (filters?.isActive !== undefined) params.isActive = filters.isActive;
        const response = await apiClient.get<WeekTicketDefResponse[]>(`${BASE}`, { params });
        return response.data;
    },

    async getById(id: number): Promise<WeekTicketDefResponse> {
        const response = await apiClient.get<WeekTicketDefResponse>(`${BASE}/${id}`);
        return response.data;
    },

    async create(request: CreateWeekTicketDefRequest): Promise<WeekTicketDefResponse> {
        const response = await apiClient.post<WeekTicketDefResponse>(`${BASE}`, request);
        return response.data;
    },

    async update(id: number, request: UpdateWeekTicketDefRequest): Promise<WeekTicketDefResponse> {
        const response = await apiClient.put<WeekTicketDefResponse>(`${BASE}/${id}`, request);
        return response.data;
    },

    async remove(id: number): Promise<void> {
        await apiClient.delete(`${BASE}/${id}`);
    },
};

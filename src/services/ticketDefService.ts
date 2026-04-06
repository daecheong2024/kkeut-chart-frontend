import apiClient from './apiClient';

export interface PackageRoundResponse {
    id: number;
    ticketRound: number;
    minimumPeriod: number | null;
    procOpTime: string | null;
    treatments: string[];
}

export interface PackageRoundRequest {
    ticketRound: number;
    minimumPeriod?: number | null;
    procOpTime?: string | null;
    treatments: string[];
}

export interface TicketDefResponse {
    id: number;
    branchId: number;
    code: string;
    weekTicketId: number | null;
    categoryId: number;
    reservCategoryId: number;
    reservCategoryName: string | null;
    name: string;
    type: string;
    isAutoTodo: boolean;
    originalPrice: number;
    eventPrice: number | null;
    isActive: boolean;
    minimumPeriod: number | null;
    maximumUseCount: number | null;
    expireDate: string | null;
    saleStartDate: string;
    saleEndDate: string;
    procOpTime: string;
    creator: string;
    createTime: string;
    modifier: string;
    modifyTime: string | null;
    todoTemplate: string | null;
    autoTodoTasks: string[] | null;
    rounds: PackageRoundResponse[] | null;
}

export interface CreateTicketDefRequest {
    weekTicketId?: number | null;
    categoryId: number;
    reservCategoryId: number;
    name: string;
    type: string;
    isAutoTodo?: boolean;
    originalPrice?: number;
    eventPrice?: number | null;
    isActive?: boolean;
    minimumPeriod?: number | null;
    maximumUseCount?: number | null;
    expireDate?: string | null;
    saleStartDate: string;
    saleEndDate: string;
    procOpTime: string;
    todoTemplate?: string | null;
    autoTodoTasks?: string[];
    rounds?: PackageRoundRequest[];
}

export interface UpdateTicketDefRequest {
    weekTicketId?: number | null;
    categoryId?: number | null;
    reservCategoryId?: number | null;
    name?: string | null;
    type?: string | null;
    isAutoTodo?: boolean | null;
    originalPrice?: number | null;
    eventPrice?: number | null;
    isActive?: boolean | null;
    minimumPeriod?: number | null;
    maximumUseCount?: number | null;
    expireDate?: string | null;
    saleStartDate?: string | null;
    saleEndDate?: string | null;
    procOpTime?: string | null;
    todoTemplate?: string | null;
    autoTodoTasks?: string[];
    rounds?: PackageRoundRequest[];
}

export interface TicketDefFilterParams {
    name?: string;
    type?: string;
    isActive?: boolean;
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
}

const BASE = '/settings/common/tickets';

export function procOpTimeToMinutes(timeStr?: string | null): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0] || '0', 10);
    const minutes = parseInt(parts[1] || '0', 10);
    return hours * 60 + minutes;
}

export function minutesToProcOpTime(minutes?: number | null): string {
    if (!minutes || minutes <= 0) return '00:30:00';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
}

export function formatDateForApi(date?: string | null): string | null {
    if (!date) return null;
    if (date.includes('T')) return date;
    return `${date}T00:00:00`;
}

export function apiDateToDateString(date?: string | null): string {
    if (!date) return '';
    return date.substring(0, 10);
}

export const ticketDefService = {
    async getAll(filters?: TicketDefFilterParams, pageNumber = 1, pageSize = 200): Promise<PagedResult<TicketDefResponse>> {
        const params: Record<string, string | number | boolean> = { pageNumber, pageSize };
        if (filters?.name) params.name = filters.name;
        if (filters?.type) params.type = filters.type;
        if (filters?.isActive !== undefined) params.isActive = filters.isActive;
        const response = await apiClient.get<PagedResult<TicketDefResponse>>(`${BASE}`, { params });
        return response.data;
    },

    async getById(id: number): Promise<TicketDefResponse> {
        const response = await apiClient.get<TicketDefResponse>(`${BASE}/${id}`);
        return response.data;
    },

    async create(request: CreateTicketDefRequest): Promise<TicketDefResponse> {
        const response = await apiClient.post<TicketDefResponse>(`${BASE}`, request);
        return response.data;
    },

    async update(id: number, request: UpdateTicketDefRequest): Promise<TicketDefResponse> {
        const response = await apiClient.put<TicketDefResponse>(`${BASE}/${id}`, request);
        return response.data;
    },

    async remove(id: number): Promise<void> {
        await apiClient.delete(`${BASE}/${id}`);
    },
};

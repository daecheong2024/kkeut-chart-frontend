import apiClient from './apiClient';

export interface MacroHospitalResponse {
    id: number;
    branchId: number;
    macro: string;
    title: string | null;
    contents: string | null;
    isActive: boolean;
    creator: string;
    createTime: string;
    modifier: string;
    modifyTime: string | null;
}

export interface MacroPersonalResponse {
    id: number;
    branchId: number;
    userId: number;
    userName: string | null;
    macro: string;
    title: string | null;
    contents: string | null;
    isActive: boolean;
    creator: string;
    createTime: string;
    modifier: string;
    modifyTime: string | null;
}

export interface CreateMacroRequest {
    macro: string;
    title?: string | null;
    contents?: string | null;
    isActive?: boolean;
}

export interface UpdateMacroRequest {
    macro?: string | null;
    title?: string | null;
    contents?: string | null;
    isActive?: boolean | null;
}

export interface MacroFilterParams {
    macro?: string;
    title?: string;
    isActive?: boolean;
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
}

const BASE = '/settings/macros';

function buildParams(filters?: MacroFilterParams, pageNumber = 1, pageSize = 200): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = { pageNumber, pageSize };
    if (filters?.macro) params.macro = filters.macro;
    if (filters?.title) params.title = filters.title;
    if (filters?.isActive !== undefined) params.isActive = filters.isActive;
    return params;
}

export const macroHospitalService = {
    async getAll(filters?: MacroFilterParams, pageNumber = 1, pageSize = 200): Promise<PagedResult<MacroHospitalResponse>> {
        const params = buildParams(filters, pageNumber, pageSize);
        const response = await apiClient.get<PagedResult<MacroHospitalResponse>>(`${BASE}/hospital`, { params });
        return response.data;
    },

    async getById(id: number): Promise<MacroHospitalResponse> {
        const response = await apiClient.get<MacroHospitalResponse>(`${BASE}/hospital/${id}`);
        return response.data;
    },

    async create(request: CreateMacroRequest): Promise<MacroHospitalResponse> {
        const response = await apiClient.post<MacroHospitalResponse>(`${BASE}/hospital`, request);
        return response.data;
    },

    async update(id: number, request: UpdateMacroRequest): Promise<MacroHospitalResponse> {
        const response = await apiClient.put<MacroHospitalResponse>(`${BASE}/hospital/${id}`, request);
        return response.data;
    },

    async remove(id: number): Promise<void> {
        await apiClient.delete(`${BASE}/hospital/${id}`);
    },
};

export const macroPersonalService = {
    async getAll(filters?: MacroFilterParams, pageNumber = 1, pageSize = 200): Promise<PagedResult<MacroPersonalResponse>> {
        const params = buildParams(filters, pageNumber, pageSize);
        const response = await apiClient.get<PagedResult<MacroPersonalResponse>>(`${BASE}/personal`, { params });
        return response.data;
    },

    async getById(id: number): Promise<MacroPersonalResponse> {
        const response = await apiClient.get<MacroPersonalResponse>(`${BASE}/personal/${id}`);
        return response.data;
    },

    async create(request: CreateMacroRequest): Promise<MacroPersonalResponse> {
        const response = await apiClient.post<MacroPersonalResponse>(`${BASE}/personal`, request);
        return response.data;
    },

    async update(id: number, request: UpdateMacroRequest): Promise<MacroPersonalResponse> {
        const response = await apiClient.put<MacroPersonalResponse>(`${BASE}/personal/${id}`, request);
        return response.data;
    },

    async remove(id: number): Promise<void> {
        await apiClient.delete(`${BASE}/personal/${id}`);
    },
};

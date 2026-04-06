import apiClient from './apiClient';

export interface CategoryTicketDefResponse {
    id: number;
    branchId: number;
    name: string;
    keyword: string;
    creator: string;
    createTime: string;
    modifier: string;
    modifyTime: string;
}

export interface CreateCategoryTicketDefRequest {
    name: string;
    keyword: string;
}

export interface UpdateCategoryTicketDefRequest {
    name?: string | null;
    keyword?: string | null;
}

export interface CategoryTicketDefFilterParams {
    name?: string;
}

const BASE = '/settings/category-tickets';

export function keywordsToApiString(keywords?: string[]): string {
    if (!keywords || keywords.length === 0) return '';
    return keywords.join(',');
}

export function apiStringToKeywords(s?: string | null): string[] {
    if (!s) return [];
    return s
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
}

export const categoryTicketDefService = {
    async getAll(filters?: CategoryTicketDefFilterParams): Promise<CategoryTicketDefResponse[]> {
        const params: Record<string, string> = {};
        if (filters?.name) params.name = filters.name;
        const response = await apiClient.get<CategoryTicketDefResponse[]>(`${BASE}`, { params });
        return response.data;
    },

    async getById(id: number): Promise<CategoryTicketDefResponse> {
        const response = await apiClient.get<CategoryTicketDefResponse>(`${BASE}/${id}`);
        return response.data;
    },

    async create(request: CreateCategoryTicketDefRequest): Promise<CategoryTicketDefResponse> {
        const response = await apiClient.post<CategoryTicketDefResponse>(`${BASE}`, request);
        return response.data;
    },

    async update(id: number, request: UpdateCategoryTicketDefRequest): Promise<CategoryTicketDefResponse> {
        const response = await apiClient.put<CategoryTicketDefResponse>(`${BASE}/${id}`, request);
        return response.data;
    },

    async remove(id: number): Promise<void> {
        await apiClient.delete(`${BASE}/${id}`);
    },
};

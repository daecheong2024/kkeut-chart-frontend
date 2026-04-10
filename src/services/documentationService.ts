import apiClient from './apiClient';

export type DocumentationStructureType = "html" | "structured";

export interface DocumentationResponse {
    id: number;
    branchId: number;
    title: string;
    remarks: string | null;
    content: string | null;
    contentType: string;
    structureType: DocumentationStructureType;
    isSignature: boolean;
    isActive: boolean;
    creator: string;
    createTime: string;
    modifier: string;
    modifyTime: string | null;
}

export interface CreateDocumentationRequest {
    title: string;
    remarks?: string | null;
    content?: string | null;
    contentType?: string;
    structureType?: DocumentationStructureType;
    isSignature?: boolean;
    isActive?: boolean;
}

export interface UpdateDocumentationRequest {
    title?: string | null;
    remarks?: string | null;
    content?: string | null;
    contentType?: string | null;
    structureType?: DocumentationStructureType | null;
    isSignature?: boolean | null;
    isActive?: boolean | null;
}

export interface DocumentationFilterParams {
    title?: string;
    contentType?: string;
    isSignature?: boolean;
    isActive?: boolean;
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
}

const BASE = '/settings/common/documentations';

export const documentationService = {
    async getAll(
        filters?: DocumentationFilterParams,
        pageNumber = 1,
        pageSize = 100
    ): Promise<PagedResult<DocumentationResponse>> {
        const params: Record<string, string | number | boolean> = { pageNumber, pageSize };
        if (filters?.title) params.title = filters.title;
        if (filters?.contentType) params.contentType = filters.contentType;
        if (filters?.isSignature !== undefined) params.isSignature = filters.isSignature;
        if (filters?.isActive !== undefined) params.isActive = filters.isActive;

        const response = await apiClient.get<PagedResult<DocumentationResponse>>(BASE, { params });
        return response.data;
    },

    async getById(id: number): Promise<DocumentationResponse> {
        const response = await apiClient.get<DocumentationResponse>(`${BASE}/${id}`);
        return response.data;
    },

    async create(request: CreateDocumentationRequest): Promise<DocumentationResponse> {
        const response = await apiClient.post<DocumentationResponse>(BASE, request);
        return response.data;
    },

    async update(id: number, request: UpdateDocumentationRequest): Promise<DocumentationResponse> {
        const response = await apiClient.put<DocumentationResponse>(`${BASE}/${id}`, request);
        return response.data;
    },

    async remove(id: number): Promise<void> {
        await apiClient.delete(`${BASE}/${id}`);
    },
};

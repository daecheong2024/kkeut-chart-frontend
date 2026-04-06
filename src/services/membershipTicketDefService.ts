import apiClient from './apiClient';

export interface MembershipTicketDefResponse {
    id: number;
    branchId: number;
    name: string;
    originalPrice: number;
    eventPrice: number | null;
    bonusPoint: number;
    discount: number | null;
    isActive: boolean;
    creator: string;
    createTime: string;
    modifier: string;
    modifyTime: string;
}

export interface CreateMembershipTicketDefRequest {
    name: string;
    originalPrice: number;
    eventPrice?: number | null;
    bonusPoint?: number;
    discount?: number | null;
    isActive?: boolean;
}

export interface UpdateMembershipTicketDefRequest {
    name?: string | null;
    originalPrice?: number | null;
    eventPrice?: number | null;
    bonusPoint?: number | null;
    discount?: number | null;
    isActive?: boolean | null;
}

const BASE = '/settings/membership-tickets';

export const membershipTicketDefService = {
    async getAll(): Promise<MembershipTicketDefResponse[]> {
        const response = await apiClient.get<MembershipTicketDefResponse[]>(`${BASE}`);
        return response.data;
    },

    async getById(id: number): Promise<MembershipTicketDefResponse> {
        const response = await apiClient.get<MembershipTicketDefResponse>(`${BASE}/${id}`);
        return response.data;
    },

    async create(request: CreateMembershipTicketDefRequest): Promise<MembershipTicketDefResponse> {
        const response = await apiClient.post<MembershipTicketDefResponse>(`${BASE}`, request);
        return response.data;
    },

    async update(id: number, request: UpdateMembershipTicketDefRequest): Promise<MembershipTicketDefResponse> {
        const response = await apiClient.put<MembershipTicketDefResponse>(`${BASE}/${id}`, request);
        return response.data;
    },

    async remove(id: number): Promise<void> {
        await apiClient.delete(`${BASE}/${id}`);
    },
};

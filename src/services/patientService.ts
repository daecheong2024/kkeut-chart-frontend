import apiClient from "./apiClient";

export interface PatientSearchResult {
    id: number;
    name: string;
    phone: string;
    chartNumber?: string;
    branchId: string;
    // Extended fields for list view compatibility
    gender?: string;
    age?: number;
    tags?: string[];
    marketing?: string;
    birthDate?: string;
    lastVisit?: string;
    nextReservation?: string;
    passportNumber?: string;
    insuredType?: string;
}

export interface PatientDetail {
    id: number;
    branchId: string;
    name: string;
    phone: string;
    sex: string;
    birthDate?: string;
    zipcode?: string;
    address?: string;
    detailAddress?: string;
    email?: string;
    emergencyPhone?: string;
    residentNumber?: string;
    chartNumber?: string;
    firstVisitDate?: string;
    memo?: string;
    tags?: string[];
    createdAt: string;
}

export interface PatientFilter {
    gender?: string;
    minAge?: number;
    maxAge?: number;
    tag?: string;
    marketingAgreed?: boolean;
}

export const patientService = {
    /**
     * Search patients by name or phone
     */
    async search(branchId: string, query: string, filter?: PatientFilter, pageNumber = 1, pageSize = 50): Promise<{ items: PatientSearchResult[]; totalCount: number }> {
        try {
            const params = new URLSearchParams();
            params.append("branchId", branchId);
            params.append("pageNumber", String(pageNumber));
            params.append("pageSize", String(pageSize));
            if (query) params.append("query", query);

            if (filter) {
                if (filter.gender && filter.gender !== '전체') params.append("gender", filter.gender === '남' ? 'MALE' : filter.gender === '여' ? 'FEMALE' : filter.gender);
                if (filter.minAge !== undefined) params.append("minAge", filter.minAge.toString());
                if (filter.maxAge !== undefined) params.append("maxAge", filter.maxAge.toString());
                if (filter.tag && filter.tag !== '전체') params.append("tag", filter.tag);
                if (filter.marketingAgreed !== undefined) params.append("marketingAgreed", filter.marketingAgreed.toString());
            }

            const response = await apiClient.get(`/customers?${params.toString()}`);
            const data = response.data;
            if (Array.isArray(data)) return { items: data, totalCount: data.length };
            return { items: data?.items ?? [], totalCount: data?.totalCount ?? 0 };
        } catch (error) {
            console.error("Failed to search patients:", error);
            return { items: [], totalCount: 0 };
        }
    },

    async searchPatients(query: string, filter?: PatientFilter, pageNumber = 1, pageSize = 50): Promise<{ items: PatientSearchResult[]; totalCount: number }> {
        const branchId = "1";
        return this.search(branchId, query, filter, pageNumber, pageSize);
    },

    /**
     * Get patient details
     */
    async getById(id: number): Promise<PatientDetail | null> {
        try {
            const response = await apiClient.get(`/customers/${id}`);
            return response.data;
        } catch (error) {
            console.error("Failed to get patient:", error);
            return null;
        }
    },

    /**
     * Create new patient
     */
    async create(data: {
        branchId: string;
        name: string;
        phone: string;
        sex?: string;
        residentRegistNum?: string; // Added field
        birthDate?: string;
        memo?: string;
        zipcode?: string;
        address?: string;
        detailAddress?: string;
        email?: string;
        emergencyPhone?: string;
    }): Promise<PatientDetail> {
        const response = await apiClient.post("/customers", data);
        return response.data;
    },

    /**
     * Update patient
     */
    async update(id: number, data: Partial<PatientDetail>): Promise<PatientDetail> {
        const response = await apiClient.patch(`/customers/${id}`, data);
        return response.data;
    },

    async getTags(customerId: number): Promise<{ id: number; tagId: number; tagName: string }[]> {
        const response = await apiClient.get(`/customers/${customerId}/tags`);
        return response.data ?? [];
    },

    async addTag(customerId: number, tagId: number): Promise<void> {
        await apiClient.post(`/customers/${customerId}/tags`, { tagId });
    },

    async removeTag(customerId: number, tagId: number): Promise<void> {
        await apiClient.delete(`/customers/${customerId}/tags/${tagId}`);
    },
};

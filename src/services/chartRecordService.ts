import apiClient from "./apiClient";

export interface ChartRecordItem {
    id: number;
    patientId: number;
    branchId: string;
    type: 'note' | 'treatment' | 'prescription';
    content: string;
    pinned: boolean;
    createdBy?: number;
    createdAt: string;
    updatedAt?: string;
}

export const chartRecordService = {
    /**
     * Get chart records for a patient
     */
    async listByPatient(patientId: number): Promise<ChartRecordItem[]> {
        try {
            const response = await apiClient.get(`/chart-records?patientId=${patientId}`);
            return response.data;
        } catch (error) {
            console.error("Failed to fetch chart records:", error);
            return [];
        }
    },

    /**
     * Create new chart record
     */
    async create(data: {
        branchId: string;
        patientId: number;
        type: 'note' | 'treatment' | 'prescription';
        content: string;
    }): Promise<ChartRecordItem> {
        const response = await apiClient.post("/chart-records", data);
        return response.data;
    },

    /**
     * Update chart record
     */
    async update(id: number, data: {
        content?: string;
        pinned?: boolean;
    }): Promise<ChartRecordItem> {
        const response = await apiClient.patch(`/chart-records/${id}`, data);
        return response.data;
    },

    /**
     * Delete chart record
     */
    async delete(id: number): Promise<void> {
        await apiClient.delete(`/chart-records/${id}`);
    },

    /**
     * Toggle pin status
     */
    async togglePin(id: number): Promise<ChartRecordItem> {
        const response = await apiClient.patch(`/chart-records/${id}/pin`, {});
        return response.data;
    },
};

import apiClient from "./apiClient";

export interface CustomerProcedure {
    id: number;
    customerId: number;
    chartId: number;
    ticketId?: number;
    procId?: number;
    name: string;
    status: "todo" | "doing" | "done" | string;
    seq: number;
    managedByUserName?: string;
    startTime?: string;
    endTime?: string;
    registerTime: string;
    sourceType?: string;
    creator?: string;
    createdAt: string;
    isCompleted: boolean;
}

export interface CustomerProcedureCreateData {
    chartId: number;
    content: string;
    sourceType?: string;
    sourceTicketId?: number;
    procedureName?: string;
    procedureKey?: string;
}

export const procedureService = {
    async getByCustomer(customerId: number, chartId?: number): Promise<CustomerProcedure[]> {
        try {
            let url = `/customers/${customerId}/procedures`;
            if (chartId) url += `?chartId=${chartId}`;
            const response = await apiClient.get<CustomerProcedure[]>(url);
            return response.data || [];
        } catch (e) {
            console.error("Failed to fetch customer procedures:", e);
            return [];
        }
    },

    async create(customerId: number, data: CustomerProcedureCreateData): Promise<CustomerProcedure> {
        const response = await apiClient.post<CustomerProcedure>(`/customers/${customerId}/procedures`, data);
        return response.data;
    },

    async updateStatus(customerId: number, procedureId: number): Promise<void> {
        await apiClient.patch(`/customers/${customerId}/procedures/${procedureId}/toggle`);
    },

    async assignUser(customerId: number, procedureId: number, userId: number | null, userName: string | null): Promise<CustomerProcedure> {
        const response = await apiClient.patch<CustomerProcedure>(
            `/customers/${customerId}/procedures/${procedureId}/assign`,
            { userId, userName }
        );
        return response.data;
    },

    async delete(customerId: number, procedureId: number): Promise<void> {
        await apiClient.delete(`/customers/${customerId}/procedures/${procedureId}`);
    },
};

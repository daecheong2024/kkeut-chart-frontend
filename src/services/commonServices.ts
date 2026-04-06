import apiClient from "./apiClient";

export interface TreatmentItem {
    id: number;
    branchId: string;
    code?: string;
    name: string;
    category?: string;
    price?: number;
    durationMinutes?: number;
    enabled: boolean;
}

export interface TodoItem {
    id: number;
    patientId: number;
    patientName: string;
    branchId: string;
    content: string;
    completed: boolean;
    completedAt?: string;
    dueDate?: string;
    createdBy?: number;
    createdAt: string;
}

export const treatmentService = {
    async list(branchId?: string, category?: string): Promise<TreatmentItem[]> {
        try {
            let url = "/treatments";
            const params = new URLSearchParams();
            if (category) params.append("category", category);
            if (params.toString()) url += `?${params.toString()}`;

            const response = await apiClient.get(url);
            return response.data;
        } catch (error) {
            console.error("Failed to fetch treatments:", error);
            return [];
        }
    },

    async create(data: {
        branchId: string;
        name: string;
        code?: string;
        category?: string;
        price?: number;
        durationMinutes?: number;
    }): Promise<TreatmentItem> {
        const response = await apiClient.post("/treatments", data);
        return response.data;
    },
};

export const todoService = {
    async list(patientId?: number, branchId?: string): Promise<TodoItem[]> {
        try {
            const params = new URLSearchParams();
            if (patientId) params.append("patientId", patientId.toString());
            if (branchId) params.append("branchId", branchId);

            const response = await apiClient.get(`/todos?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error("Failed to fetch todos:", error);
            return [];
        }
    },

    async create(data: {
        branchId: string;
        patientId: number;
        content: string;
        dueDate?: string;
    }): Promise<TodoItem> {
        const response = await apiClient.post("/todos", data);
        return response.data;
    },

    async toggleComplete(id: number): Promise<TodoItem> {
        const response = await apiClient.patch(`/todos/${id}/complete`, {});
        return response.data;
    },

    async delete(id: number): Promise<void> {
        await apiClient.delete(`/todos/${id}`);
    },
};

import apiClient from "./apiClient";

export interface WorkLog {
    id: number;
    branchId: string;
    workDate: string; // YYYY-MM-DD
    content: string;
    subContent?: string;
    completed: boolean;
    authorName: string;
}

export interface WorkLogRequest {
    workDate?: string;
    content?: string;
    subContent?: string;
    completed?: boolean;
    authorName?: string;
}

export interface Notice {
    id: number;
    branchId: string;
    title: string;
    content?: string; // Content is optional in list view usually, but we get it full
    tag?: string;
    isImportant: boolean;
    createdAt: string; // ISO
}

export interface NoticeRequest {
    title: string;
    content: string;
    tag?: string;
    isImportant?: boolean;
}

export const dashboardService = {
    // Work Logs
    async getWorkLogs(date: string): Promise<WorkLog[]> {
        const response = await apiClient.get<WorkLog[]>(`/dashboard/work-logs`, { params: { date } });
        return response.data;
    },

    async createWorkLog(data: WorkLogRequest): Promise<WorkLog> {
        const response = await apiClient.post<WorkLog>(`/dashboard/work-logs`, data);
        return response.data;
    },

    async updateWorkLog(id: number, data: WorkLogRequest): Promise<WorkLog> {
        const response = await apiClient.put<WorkLog>(`/dashboard/work-logs/${id}`, data);
        return response.data;
    },

    async deleteWorkLog(id: number): Promise<void> {
        await apiClient.delete(`/dashboard/work-logs/${id}`);
    },

    // Notices
    async getNotices(): Promise<Notice[]> {
        const response = await apiClient.get<Notice[]>(`/dashboard/notices`);
        return response.data;
    },

    async createNotice(data: NoticeRequest): Promise<Notice> {
        const response = await apiClient.post<Notice>(`/dashboard/notices`, data);
        return response.data;
    },

    async updateNotice(id: number, data: NoticeRequest): Promise<Notice> {
        const response = await apiClient.put<Notice>(`/dashboard/notices/${id}`, data);
        return response.data;
    },

    async deleteNotice(id: number): Promise<void> {
        await apiClient.delete(`/dashboard/notices/${id}`);
    }
};

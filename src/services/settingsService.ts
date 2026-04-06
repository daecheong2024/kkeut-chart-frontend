import apiClient from "./apiClient";

export interface HospitalSettings {
    id?: number;
    branchId: string;
    hospitalNameKo?: string;
    hospitalNameEn?: string;
    businessNumber?: string;
    providerNumber?: string;
    medicalDepartments?: string;
    address?: string;
    phone?: string;
    fax?: string;
    directorName?: string;
    directorBirthDate?: string;
    logoUrl?: string;
    stampHospitalUrl?: string;
    stampDirectorUrl?: string;
}

export interface Department {
    id: number;
    branchId: string;
    name: string;
    displayOrder: number;
}

export interface JobTitle {
    id: number;
    branchId: string;
    name: string;
    displayOrder: number;
}

export interface MessageTemplate {
    id: number;
    branchId: string;
    name: string;
    channel: 'sms' | 'kakao';
    category?: string;
    content: string;
    variables?: string;
    enabled: boolean;
}

export const settingsService = {
    // Hospital Settings
    async getHospitalSettings(): Promise<HospitalSettings | null> {
        try {
            const response = await apiClient.get("/settings/hospital");
            return response.data;
        } catch (error) {
            console.error("Failed to fetch hospital settings:", error);
            return null;
        }
    },

    async updateHospitalSettings(data: HospitalSettings): Promise<HospitalSettings> {
        const response = await apiClient.put("/settings/hospital", data);
        return response.data;
    },

    // Departments
    async getDepartments(): Promise<Department[]> {
        try {
            const response = await apiClient.get("/settings/departments");
            return response.data;
        } catch (error) {
            console.error("Failed to fetch departments:", error);
            return [];
        }
    },

    async createDepartment(name: string, displayOrder?: number): Promise<Department> {
        const response = await apiClient.post("/settings/departments", { name, displayOrder });
        return response.data;
    },

    async deleteDepartment(id: number): Promise<void> {
        await apiClient.delete(`/settings/departments/${id}`);
    },

    // Job Titles
    async getJobTitles(): Promise<JobTitle[]> {
        try {
            const response = await apiClient.get("/settings/job-titles");
            return response.data;
        } catch (error) {
            console.error("Failed to fetch job titles:", error);
            return [];
        }
    },

    async createJobTitle(name: string, displayOrder?: number): Promise<JobTitle> {
        const response = await apiClient.post("/settings/job-titles", { name, displayOrder });
        return response.data;
    },

    async deleteJobTitle(id: number): Promise<void> {
        await apiClient.delete(`/settings/job-titles/${id}`);
    },

    // Message Templates
    async getMessageTemplates(channel?: 'sms' | 'kakao'): Promise<MessageTemplate[]> {
        try {
            const url = channel ? `/settings/message-templates?channel=${channel}` : "/settings/message-templates";
            const response = await apiClient.get(url);
            return response.data;
        } catch (error) {
            console.error("Failed to fetch message templates:", error);
            return [];
        }
    },

    async createMessageTemplate(data: {
        name: string;
        channel: 'sms' | 'kakao';
        category?: string;
        content: string;
        variables?: string;
    }): Promise<MessageTemplate> {
        const response = await apiClient.post("/settings/message-templates", data);
        return response.data;
    },

    async deleteMessageTemplate(id: number): Promise<void> {
        await apiClient.delete(`/settings/message-templates/${id}`);
    },
};

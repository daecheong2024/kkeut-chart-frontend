import apiClient from './apiClient';
import type { MembersSettings, PermissionProfile, MemberUser } from '../types/settings';

export interface Department {
    id: number;
    branchId: string;
    name: string;
    displayOrder: number;
}

export interface DepartmentRequest {
    name: string;
    displayOrder?: number;
}

export interface JobTitle {
    id: number;
    branchId: string;
    name: string;
    displayOrder: number;
}

export interface JobTitleRequest {
    name: string;
    displayOrder?: number;
}

interface PermissionProfileApiResponse {
    id: number;
    name: string;
    branchScope: number;
    permissions: Record<string, boolean>;
}

export interface MemberUserDto {
    id: number;
    email: string;
    name: string;
    branchId: string;
    role: string;
    departmentId?: number;
    jobTitleId?: number;
    permissionProfileId?: string;
    autoLogoutHours?: number;
    lastLoginAt?: string;
    lastLoginIp?: string;
    isApproved?: boolean;
}

export const memberConfigService = {
    /**
     * Get permission profiles config
     */
    async getMemberConfig(): Promise<PermissionProfile[]> {
        const response = await apiClient.get<PermissionProfileApiResponse[]>(`/settings/permission-profiles`);
        if (!response.data || !Array.isArray(response.data)) {
            return [];
        }
        return response.data.map(p => ({
            id: String(p.id),
            name: p.name,
            branchScope: p.branchScope === 1 ? "all" as const : "own" as const,
            permissions: p.permissions ?? {},
        }));
    },

    async updateMemberConfig(profiles: PermissionProfile[]): Promise<void> {
        const request = {
            profiles: profiles.map(p => ({
                id: isNaN(Number(p.id)) ? null : Number(p.id),
                name: p.name,
                branchScope: p.branchScope === "all" ? 1 : 0,
                permissions: p.permissions,
            })),
        };
        await apiClient.put(`/settings/permission-profiles`, request);
    },

    /**
     * Get all members for current branch
     */
    async getMembers(branchId: number): Promise<MemberUser[]> {
        const response = await apiClient.get<MemberUserDto[]>(`/settings/members?branchId=${branchId}`);
        return response.data.map(u => ({
            id: u.id.toString(), // Frontend uses string IDs usually
            name: u.name,
            email: u.email,
            branchId: u.branchId,
            role: u.role,
            departmentId: u.departmentId?.toString(),
            jobTitleId: u.jobTitleId?.toString(),
            permissionProfileId: u.permissionProfileId || "",
            autoLogoutHours: u.autoLogoutHours,
            lastLoginAt: u.lastLoginAt,
            lastLoginIp: u.lastLoginIp,
            isApproved: u.isApproved ?? true // default true for backward compatibility or if missing
        }));
    },

    /**
     * Update single member info
     */
    async updateMember(id: string, data: Partial<MemberUser>): Promise<MemberUser> {
        // Convert string IDs back to numbers if needed by backend (Backend DTO expects Long for dept/job)
        const request = {
            name: data.name,
            departmentId: data.departmentId ? Number(data.departmentId) : null,
            jobTitleId: data.jobTitleId ? Number(data.jobTitleId) : null,
            permissionProfileId: data.permissionProfileId,
            autoLogoutHours: data.autoLogoutHours
        };

        const response = await apiClient.put<MemberUserDto>(`/settings/members/${id}`, request);
        const u = response.data;

        return {
            id: u.id.toString(),
            name: u.name,
            email: u.email,
            branchId: u.branchId,
            role: u.role,
            departmentId: u.departmentId?.toString(),
            jobTitleId: u.jobTitleId?.toString(),
            permissionProfileId: u.permissionProfileId || "",
            autoLogoutHours: u.autoLogoutHours,
            lastLoginAt: u.lastLoginAt,
            lastLoginIp: u.lastLoginIp
        };
    },

    /**
     * Create new member (Manual Add by Admin)
     */
    async createMember(data: Partial<MemberUser>): Promise<MemberUser> {
        const request = {
            name: data.name,
            email: data.email,
            departmentId: data.departmentId ? Number(data.departmentId) : null,
            jobTitleId: data.jobTitleId ? Number(data.jobTitleId) : null,
            permissionProfileId: data.permissionProfileId,
            autoLogoutHours: data.autoLogoutHours
        };

        const response = await apiClient.post<MemberUserDto>(`/settings/members`, request);
        const u = response.data;

        return {
            id: u.id.toString(),
            name: u.name,
            email: u.email,
            branchId: u.branchId,
            role: u.role,
            departmentId: u.departmentId?.toString(),
            jobTitleId: u.jobTitleId?.toString(),
            permissionProfileId: u.permissionProfileId || "",
            autoLogoutHours: u.autoLogoutHours,
            lastLoginAt: u.lastLoginAt,
            lastLoginIp: u.lastLoginIp
        };
    },

    // Departments
    async getDepartments(branchId?: number): Promise<Department[]> {
        const query = branchId ? `?branchId=${branchId}` : "";
        const response = await apiClient.get<Department[]>(`/settings/departments${query}`);
        return response.data;
    },

    async createDepartment(data: DepartmentRequest): Promise<Department> {
        const response = await apiClient.post<Department>(`/settings/departments`, data);
        return response.data;
    },

    async updateDepartment(id: number, data: DepartmentRequest): Promise<Department> {
        const response = await apiClient.put<Department>(`/settings/departments/${id}`, data);
        return response.data;
    },

    async deleteDepartment(id: number): Promise<void> {
        await apiClient.delete(`/settings/departments/${id}`);
    },

    async approveMember(id: number): Promise<void> {
        await apiClient.put(`/settings/members/${id}/approve`);
    },

    async deactivateMember(id: number): Promise<void> {
        await apiClient.put(`/settings/members/${id}/deactivate`);
    },

    async changeMemberPassword(id: string, newPassword: string): Promise<void> {
        await apiClient.put(`/settings/members/${id}/password`, { newPassword });
    },

    async deleteMember(id: string): Promise<void> {
        await apiClient.delete(`/settings/members/${id}`);
    },

    // Job Titles
    async getJobTitles(): Promise<JobTitle[]> {
        const response = await apiClient.get<JobTitle[]>(`/settings/job-titles`);
        return response.data;
    },

    async createJobTitle(data: JobTitleRequest): Promise<JobTitle> {
        const response = await apiClient.post<JobTitle>(`/settings/job-titles`, data);
        return response.data;
    },

    async updateJobTitle(id: number, data: JobTitleRequest): Promise<JobTitle> {
        const response = await apiClient.put<JobTitle>(`/settings/job-titles/${id}`, data);
        return response.data;
    },

    async deleteJobTitle(id: number): Promise<void> {
        await apiClient.delete(`/settings/job-titles/${id}`);
    }
};

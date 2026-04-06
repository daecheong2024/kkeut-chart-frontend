import apiClient from './apiClient';

export interface HospitalSettings {
    id?: number;
    branchId: string;
    hospitalNameKo?: string;
    hospitalNameEn?: string;
    businessNumber?: string;
    providerNumber?: string;
    medicalDepartments?: string;
    effectiveDate?: string;
    address?: string;
    phone?: string;
    fax?: string;
    industrialAccidentNumber?: string;
    billingAgencyNumber?: string;
    directorName?: string;
    directorBirthDate?: string;
    logoDataUrl?: string;
    stampHospitalDataUrl?: string;
    stampDirectorDataUrl?: string;
    operatingHours?: Record<string, string>;
}

export const hospitalSettingsService = {
    /**
     * Get hospital settings
     */
    async get(branchId: string = ''): Promise<HospitalSettings> {
        const id = Number(branchId);
        if (!id) throw new Error('branchId is required');
        const response = await apiClient.get<HospitalSettings>(`/hospital/settings`, { params: { branchId: id } });
        return response.data;
    },

    async update(settings: HospitalSettings): Promise<HospitalSettings> {
        const payload = { ...settings, branchId: Number(settings.branchId) || 0 };
        const response = await apiClient.post<HospitalSettings>(`/hospital/settings`, payload);
        return response.data;
    },

    async uploadImage(branchId: string, imageType: string, file: File): Promise<{ url: string; imageType: string; fileName: string }> {
        const id = Number(branchId);
        if (!id) throw new Error('branchId is required');
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post(`/hospital/${id}/images/${imageType}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    async deleteImage(branchId: string, imageType: string): Promise<void> {
        const id = Number(branchId);
        if (!id) throw new Error('branchId is required');
        await apiClient.delete(`/hospital/${id}/images/${imageType}`);
    }
};

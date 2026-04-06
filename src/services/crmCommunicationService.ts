import apiClient from "./apiClient";

export interface CommunicationPreferenceRow {
    patientId: number;
    patientName: string;
    phone: string;
    optOutAll: boolean;
    optOutSms: boolean;
    optOutKakao: boolean;
    updatedAt: string;
}

export const crmCommunicationService = {
    async getCommunicationPreferences(query?: string): Promise<CommunicationPreferenceRow[]> {
        const keyword = query?.trim() ?? "";
        const queryString = keyword ? `?query=${encodeURIComponent(keyword)}` : "";
        const response = await apiClient.get(`/internal/v1/customers/communication-preferences${queryString}`);
        return Array.isArray(response.data) ? response.data : [];
    },

    async updateCommunicationPreference(
        patientId: number,
        patch: Partial<Pick<CommunicationPreferenceRow, "optOutAll" | "optOutSms" | "optOutKakao">>
    ): Promise<CommunicationPreferenceRow> {
        const response = await apiClient.patch(`/internal/v1/customers/${patientId}/communication-preferences`, patch);
        return response.data;
    },
};

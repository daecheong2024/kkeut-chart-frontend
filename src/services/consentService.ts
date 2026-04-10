import apiClient from './apiClient';

// 동의서 발송/서명 관련 API 서비스

export interface ConsentRequest {
    id: number;
    branchId?: number;
    patientId?: number;
    formTemplateId: string;
    formTitle: string;
    formBody?: string;
    token?: string;
    status: 'Pending' | 'Signed' | 'Expired' | 'Cancelled';
    patientName: string;
    patientPhone?: string;
    createdAt: string;
    signedAt?: string;
    expiresAt?: string;
    notificationSent: boolean;
    notificationResult?: string;
    hasSignature?: boolean;
    hasSiganture?: boolean;
    signatureDataUrl?: string;
}

export interface SendConsentResponse {
    id: number;
    token: string;
    status: string;
    notificationSent: boolean;
    notificationResult: string;
    signatureUrl: string;
}

export interface CancelConsentResponse {
    success: boolean;
    message: string;
}

export interface ConsentPublicData {
    status: string;
    formTitle: string;
    formBody?: string;
    patientName: string;
    requireSignature: boolean;
    signedAt?: string;
    message?: string;
}

export const consentService = {
    /**
     * 동의서를 환자에게 발송합니다 (알림톡 전송)
     */
    async send(branchId: string, patientId: number, formTemplateId: string): Promise<SendConsentResponse> {
        const parsedBranchId = Number(branchId);
        const safeBranchId = Number.isFinite(parsedBranchId) && parsedBranchId > 0 ? parsedBranchId : 1;
        const response = await apiClient.post<SendConsentResponse>('/consent/send', {
            branchId: safeBranchId,
            patientId,
            formTemplateId,
            baseUrl: window.location.origin,
        });
        return response.data;
    },

    /**
     * 환자별 동의서 이력을 조회합니다
     */
    async getPatientHistory(patientId: number): Promise<ConsentRequest[]> {
        const response = await apiClient.get<ConsentRequest[]>(`/consent/patient/${patientId}`);
        return response.data;
    },

    /**
     * 특정 동의서의 상세 정보를 조회합니다 (서명 이미지 포함)
     */
    async getDetail(id: number): Promise<ConsentRequest> {
        const response = await apiClient.get<ConsentRequest>(`/consent/detail/${id}`);
        return response.data;
    },

    /**
     * 모바일 서명 페이지용 — 토큰으로 동의서 데이터를 조회합니다 (비인증)
     */
    async getByToken(token: string): Promise<ConsentPublicData> {
        // 비인증 API이므로 별도의 baseURL 없이 직접 호출
        const response = await apiClient.get<ConsentPublicData>(`/consent/${token}`);
        return response.data;
    },

    /**
     * 모바일 서명 제출 (비인증)
     */
    async submitSignature(token: string, signatureDataUrl: string): Promise<{ success: boolean; message: string }> {
        const response = await apiClient.post(`/consent/${token}/sign`, {
            signatureDataUrl
        });
        return response.data;
    },

    async cancel(id: number, reason?: string): Promise<CancelConsentResponse> {
        const payload = { reason: reason || null };
        try {
            const response = await apiClient.post<CancelConsentResponse>(`/consent/${id}/cancel`, payload);
            return response.data;
        } catch (error: any) {
            // Backward compatibility: some deployments may still expose old route shape.
            if (error?.response?.status === 404) {
                const fallback = await apiClient.post<CancelConsentResponse>(`/consent/cancel/${id}`, payload);
                return fallback.data;
            }
            throw error;
        }
    }
};

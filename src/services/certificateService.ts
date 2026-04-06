import apiClient from './apiClient';

// 진료확인서 생성 및 발송 관련 API 서비스

export interface CertificateResponse {
    success: boolean;
    message: string;
    downloadUrl: string;
}

export const certificateService = {
    /**
     * 진료확인서 PDF 생성 (브라우저에서 다운로드)
     */
    async generate(branchId: string, patientId: number, visitIds?: number[]): Promise<void> {
        const response = await apiClient.post('/certificate/generate', {
            branchId: Number(branchId),
            patientId,
            visitIds
        }, {
            responseType: 'blob'
        });

        // Blob URL을 생성하여 다운로드
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `진료확인서_${patientId}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    },

    /**
     * 진료확인서 생성 후 카카오톡 발송
     */
    async send(branchId: string, patientId: number, visitIds?: number[]): Promise<CertificateResponse> {
        const response = await apiClient.post<CertificateResponse>('/certificate/send', {
            branchId: Number(branchId),
            patientId,
            visitIds
        });
        return response.data;
    }
};

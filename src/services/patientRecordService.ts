import apiClient from "./apiClient";

interface CustomerMemoResponse {
    id: number;
    customerId: number;
    memo?: string | null;
    isPinned: boolean;
    creator: string;
    createTime: string;
    modifier: string;
    modifyTime: string;
}

function mapToPatientRecord(item: CustomerMemoResponse): PatientRecordData {
    return {
        id: item.id,
        patientId: item.customerId,
        content: item.memo ?? "",
        isPinned: item.isPinned ?? false,
        createdByName: item.creator,
        createdAt: item.createTime,
        updatedAt: item.modifyTime,
    };
}

export interface PatientRecordData {
    id: number;
    patientId: number;
    recordType?: string;
    tag?: string;
    content: string;
    isPinned: boolean;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
}

export const patientRecordService = {
    async getByPatientId(patientId: number): Promise<PatientRecordData[]> {
        const response = await apiClient.get<CustomerMemoResponse[]>(`/customers/${patientId}/memos`);
        return (response.data || []).map(mapToPatientRecord);
    },

    async create(data: {
        patientId: number;
        recordType?: string;
        tag?: string;
        content: string;
        isPinned?: boolean;
    }): Promise<PatientRecordData> {
        const response = await apiClient.post<CustomerMemoResponse>(`/customers/${data.patientId}/memos`, {
            memo: data.content,
        });
        return mapToPatientRecord(response.data);
    },

    async update(id: number, data: {
        content?: string;
        tag?: string;
        isPinned?: boolean;
    }, patientId?: number): Promise<PatientRecordData> {
        if (!patientId) throw new Error("patientId is required for update");
        const response = await apiClient.put<CustomerMemoResponse>(`/customers/${patientId}/memos/${id}`, {
            memo: data.content,
            isPinned: data.isPinned,
        });
        return mapToPatientRecord(response.data);
    },

    async setPinned(id: number, isPinned: boolean, patientId?: number): Promise<PatientRecordData> {
        if (!patientId) throw new Error("patientId is required for setPinned");
        const response = await apiClient.put<CustomerMemoResponse>(`/customers/${patientId}/memos/${id}`, {
            isPinned,
        });
        return mapToPatientRecord(response.data);
    },

    async delete(id: number, patientId?: number): Promise<void> {
        if (patientId) {
            await apiClient.delete(`/customers/${patientId}/memos/${id}`);
        } else {
            await apiClient.delete(`/customers/0/memos/${id}`);
        }
    }
};

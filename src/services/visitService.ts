import apiClient from "./apiClient";
import { resolveActiveBranchId } from "../utils/branch";

export interface VisitUpdateData {
    status?: string;
    statusAlertMinutes?: number;
    checkInAt?: string;
    isWalkIn?: boolean;
    room?: string;
    consultation?: Record<string, string>;
    medicalRecord?: string;
    chart1?: string;
    chart2?: string;
    chart3?: string;
    stage?: string;
    scheduledAt?: string;
    visitPurposeId?: string;
    category?: string;
    memo?: string;
    skipCrmMessage?: boolean;
    durationMin?: number;
    cancelReason?: string;
    isNoShow?: boolean;
    plannedTicketIds?: string[];
    plannedTicketNames?: string[];
    plannedTreatments?: string[];
    counselorId?: number;
    doctorId?: number;
    doctorCounselorId?: number;
}

export interface ReservationChangeField {
    field: string;
    before?: string | null;
    after?: string | null;
}

export interface ReservationChangeHistoryItem {
    id: number;
    reservationId: number;
    customerId: number;
    branchId: number;
    actionType: "create" | "update" | "cancel" | "move" | string;
    changedBy: string;
    changedAt: string;
    cancelReason?: string | null;
    isNoShow?: boolean | null;
    changes: ReservationChangeField[];
}

export const visitService = {
    async validateReservation(params: {
        branchId: string;
        customerId: number;
        scheduledAt: string;
        reservCategoryId?: number;
        reservationId?: number;
        ticketIds?: number[];
    }): Promise<{ allowed: boolean; message?: string }> {
        const response = await apiClient.post('/reservations/validate', {
            branchId: Number(params.branchId),
            customerId: params.customerId,
            scheduledAt: params.scheduledAt,
            reservCategoryId: params.reservCategoryId,
            reservationId: params.reservationId,
            ticketIds: params.ticketIds,
        });
        return response.data;
    },

    async updateVisit(visitId: number, data: VisitUpdateData): Promise<any> {
        const response = await apiClient.put(`/receptions/${visitId}`, data);
        return response.data;
    },

    async getByPatientId(patientId: number): Promise<any[]> {
        const response = await apiClient.get(`/receptions`, {
            params: { CustomerId: patientId }
        });
        const data = response.data;
        return Array.isArray(data) ? data : data?.items ?? [];
    },

    async getVisitHistory(patientId: number): Promise<any[]> {
        const response = await apiClient.get(`/charts/patient/${patientId}/visit-history`);
        const data = response.data;
        const items: any[] = Array.isArray(data) ? data : [];
        return items.map((c: any) => ({
            id: c.id,
            scheduledAt: c.registerTime,
            medicalRecord: c.medicalRecord,
            chart1: c.chart1,
            chart2: c.chart2,
            chart3: c.chart3,
            consultation: { chart1: c.chart1 || "", chart2: c.chart2 || "", chart3: c.chart3 || "" },
            counselorId: c.counselorId ?? null,
            doctorId: c.doctorId ?? null,
            doctorCounselorId: c.doctorCounselorId ?? null,
            memo: c.memo || "",
            doctorName: c.doctorName || "",
            reservationId: c.reservationId,
            paymentId: c.paymentId,
            source: c.source,
            status: "checked_in",
        }));
    },

    async createVisit(data: any): Promise<any> {
        const branchId = String(data.branchId || resolveActiveBranchId("")).trim();
        if (!branchId) {
            throw new Error("지점 정보가 없습니다.");
        }

        const payload: Record<string, any> = {
            customerId: data.patientId ?? data.customerId,
            branchId: Number(branchId),
            registerTime: data.registerTime || new Date().toISOString(),
        };

        if (data.reservationId) payload.reservationId = data.reservationId;
        if (data.tickets) payload.tickets = data.tickets;
        if (data.memo) payload.memo = data.memo;
        if (data.doctorName) payload.doctorName = data.doctorName;
        if (data.room) payload.room = data.room;
        if (data.status) payload.status = data.status;
        if (data.visitPurposeIds) payload.visitPurposeIds = data.visitPurposeIds;

        const response = await apiClient.post(`/receptions`, payload);
        return response.data;
    },

    async createReservation(data: {
        customerName: string;
        customerPhoneNumber: string;
        reservationDateTime: string;
        reservCategoryId: number;
        branchId: number;
        memo?: string;
        ticketInfos?: { id: number; name: string; qty: number }[];
        visitPurposeNames?: string[];
    }): Promise<any> {
        const response = await apiClient.post(`/reservations`, data);
        return response.data;
    },

    async updateReservation(reservationId: number, data: {
        reservationDateTime?: string;
        reservCategoryId?: number;
        memo?: string;
    }): Promise<any> {
        const response = await apiClient.put(`/reservations/${reservationId}`, data);
        return response.data;
    },

    async cancelReservation(reservationId: number, cancelReason?: string, isNoShow?: boolean): Promise<any> {
        const response = await apiClient.post(`/reservations/${reservationId}/cancel`, {
            cancelReason: cancelReason || null,
            isNoShow: isNoShow ?? false,
        });
        return response.data;
    },

    async getReservationById(reservationId: number): Promise<any> {
        const response = await apiClient.get(`/reservations/${reservationId}`);
        return response.data;
    },

    async getReservationsByCustomer(customerId: number): Promise<any[]> {
        const today = new Date().toISOString().slice(0, 10);
        const response = await apiClient.get(`/reservations`, {
            params: { CustomerId: customerId, StartDate: today, PageSize: '50', PageNumber: '1' }
        });
        const data = response.data;
        return Array.isArray(data) ? data : data?.items ?? [];
    },

    async getAllReservationsByCustomer(customerId: number): Promise<any[]> {
        const response = await apiClient.get(`/reservations`, {
            params: { CustomerId: customerId, PageSize: '100', PageNumber: '1' }
        });
        const data = response.data;
        return Array.isArray(data) ? data : data?.items ?? [];
    },

    async getReservationsByDate(date: string, branchId?: string): Promise<any[]> {
        const params: Record<string, string> = { StartDate: date, EndDate: date, PageSize: '1000', PageNumber: '1', IncludeCancelled: 'true' };
        if (branchId) params.BranchId = branchId;
        const response = await apiClient.get(`/reservations`, { params });
        const data = response.data;
        return Array.isArray(data) ? data : data?.items ?? [];
    },

    async getReservationsByRange(startDate: string, endDate: string, branchId?: string): Promise<any[]> {
        const params: Record<string, string> = { StartDate: startDate, EndDate: endDate, PageSize: '1000', PageNumber: '1', IncludeCancelled: 'true' };
        if (branchId) params.BranchId = branchId;
        const response = await apiClient.get(`/reservations`, { params });
        const data = response.data;
        return Array.isArray(data) ? data : data?.items ?? [];
    },

    async getVisitsByDate(date: string, branchId?: string): Promise<any[]> {
        const params: Record<string, string> = { StartDate: date, EndDate: date };
        if (branchId) params.BranchId = branchId;
        const response = await apiClient.get(`/receptions`, { params });
        const data = response.data;
        return Array.isArray(data) ? data : data?.items ?? [];
    },

    async getVisitsByRange(startDate: string, endDate: string, branchId?: string): Promise<any[]> {
        const params: Record<string, string> = { StartDate: startDate, EndDate: endDate };
        if (branchId) params.BranchId = branchId;
        const response = await apiClient.get(`/receptions`, { params });
        const data = response.data;
        return Array.isArray(data) ? data : data?.items ?? [];
    },

    async deleteVisit(visitId: number): Promise<void> {
        await apiClient.delete(`/receptions/${visitId}`);
    },

    async deleteChart(chartId: number): Promise<void> {
        await apiClient.delete(`/charts/${chartId}`);
    },

    async rollbackReception(chartId: number): Promise<void> {
        await apiClient.post(`/receptions/${chartId}/rollback`);
    },

    async getAppointmentChanges(visitId: number): Promise<ReservationChangeHistoryItem[]> {
        try {
            const response = await apiClient.get(`/receptions/${visitId}/changes`);
            return Array.isArray(response.data) ? response.data : [];
        } catch {
            return [];
        }
    },

    async getChartLockStatus(customerId: number): Promise<any> {
        const response = await apiClient.get(`/charts/customer/${customerId}/chartlock`);
        return response.data;
    },

    async lockChartsByCustomer(customerId: number): Promise<any> {
        const response = await apiClient.post(`/charts/customer/${customerId}/chartlock`);
        return response.data;
    },

    async unlockChartsByCustomer(customerId: number): Promise<any> {
        const response = await apiClient.delete(`/charts/customer/${customerId}/chartlock`);
        return response.data;
    },

    async forceUnlockChartsByCustomer(customerId: number): Promise<any> {
        const response = await apiClient.delete(`/charts/customer/${customerId}/chartlock/force`);
        return response.data;
    },

    async getCustomerAppointmentChanges(patientId: number, reservationId?: number): Promise<ReservationChangeHistoryItem[]> {
        try {
            let url = `/customers/${patientId}/appointment-changes`;
            if (reservationId) url += `?reservationId=${reservationId}`;
            const response = await apiClient.get(url);
            return Array.isArray(response.data) ? response.data : [];
        } catch {
            return [];
        }
    },

    async getReservationChanges(reservationId: number): Promise<any[]> {
        try {
            const response = await apiClient.get(`/reservations/${reservationId}/changes`);
            return Array.isArray(response.data) ? response.data : [];
        } catch {
            return [];
        }
    }
};

import apiClient from "./apiClient";
import { kioskService, KioskPatient } from "./kioskService";

export interface TabletVisitPurpose {
    id: string;
    name: string;
}

export interface TabletReservation {
    id: number;
    reservDateTime: string;
    categoryName: string;
    memo?: string;
    plannedTicketNames?: string[];
}

export const tabletService = {
    async verifyPatient(branchId: string, phone: string): Promise<{ patients: KioskPatient[] }> {
        return kioskService.verifyPatient({ branchId, phone });
    },

    async getVisitPurposes(branchId: string): Promise<TabletVisitPurpose[]> {
        const response = await apiClient.get("/tablet/visit-purposes", { params: { branchId: Number(branchId) } });
        return Array.isArray(response.data) ? response.data : [];
    },

    async getTodayReservations(branchId: string, customerId: number): Promise<TabletReservation[]> {
        const response = await apiClient.get("/tablet/reservations", {
            params: { branchId: Number(branchId), customerId },
        });
        return Array.isArray(response.data) ? response.data : [];
    },

    async checkin(request: {
        branchId: number;
        customerId: number;
        reservationId?: number;
        visitPurposeIds?: string[];
        memo?: string;
    }): Promise<any> {
        const response = await apiClient.post("/tablet/checkin", request);
        return response.data;
    },
};

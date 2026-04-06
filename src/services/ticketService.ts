import apiClient from "./apiClient";
import { CartItem } from "./cartService";

export const ticketService = {
    /**
     * Get purchasing history (tickets) for a patient.
     * Reuses CartItem type as per backend implementation.
     */
    async getTickets(patientId: number): Promise<CartItem[]> {
        const response = await apiClient.get(`/customers/${patientId}/tickets`);
        const data = response.data;
        const raw: any[] = Array.isArray(data) ? data : data?.tickets ?? data?.items ?? [];
        return raw.map((t: any) => ({
            ...t,
            itemId: t.itemId ?? t.id,
            itemName: t.itemName ?? t.name ?? '',
            itemType: t.itemType ?? t.type ?? 'ticket',
            quantity: t.quantity ?? t.maximumUseCount ?? 0,
            unitPrice: t.unitPrice ?? t.totalAmount ?? 0,
            usageCount: t.usageCount ?? t.usedCount ?? 0,
            remainingCount: t.remainingCount ?? null,
        }));
    },

    /**
     * Refund/cancel a specific ticket by ID (legacy delete endpoint)
     */
    async deleteTicket(ticketId: number | string): Promise<void> {
        await apiClient.delete(`/tickets/${ticketId}`);
    },

    async refundTicket(ticketId: number | string, policy: TicketRefundPolicy): Promise<RefundResult> {
        const response = await apiClient.post(`/tickets/${ticketId}/refund`, policy);
        return response.data;
    },

    async getHistory(ticketId: number, customerId?: number): Promise<TicketHistory[]> {
        const params = customerId ? { customerId } : {};
        const response = await apiClient.get(`/tickets/${ticketId}/history`, { params });
        return response.data;
    },

    async cancelHistory(historyId: number): Promise<void> {
        await apiClient.post(`/tickets/history/${historyId}/cancel`, {});
    },

    /**
     * Use a ticket (decrement quantity)
     */
    async useTicket(ticketId: number | string, isPeriod: boolean = false, metadata?: TicketUseMetadata): Promise<void> {
        const params = new URLSearchParams();
        params.set("isPeriod", String(isPeriod));
        if (metadata?.allowCycleOverride) {
            params.set("allowCycleOverride", "true");
        }
        if (typeof metadata?.usedRound === "number" && Number.isFinite(metadata.usedRound) && metadata.usedRound > 0) {
            params.set("usedRound", String(Math.trunc(metadata.usedRound)));
        }
        if (Array.isArray(metadata?.usedTreatments) && metadata!.usedTreatments.length > 0) {
            params.set("usedTreatmentsJson", JSON.stringify(metadata!.usedTreatments));
        }
        if (typeof metadata?.visitId === "number" && Number.isFinite(metadata.visitId) && metadata.visitId > 0) {
            params.set("visitId", String(Math.trunc(metadata.visitId)));
        }
        await apiClient.post(`/tickets/${ticketId}/use?${params.toString()}`);
    }
};

export interface TicketHistory {
    id: number;
    ticketId: number;
    ticketName: string;
    historyType: string;
    quantityUsed: number;
    remainingBefore: number;
    remainingAfter: number;
    maxUseCount: number;
    usedAt: string;
    isCancelled: boolean;
    usedRound?: number | null;
    usedTreatmentsJson?: string | null;
}

export interface TicketUseMetadata {
    usedRound?: number;
    usedTreatments?: string[];
    allowCycleOverride?: boolean;
    visitId?: number;
}

export interface TicketRefundPolicy {
    requestedRefundAmount?: number;
    penaltyType?: "none" | "fixed" | "rate";
    penaltyValue?: number;
    reason?: string;
}

export interface RefundResult {
    sourceAmount: number;
    baseRefundAmount: number;
    bonusRefundAmount: number;
    penaltyAmount: number;
    finalRefundAmount: number;
    sourcePaymentRecordId: number;
    penaltyType: string;
    penaltyValue: number;
    bonusRefundPolicy: string;
    bonusRefundRate: number;
    reason?: string;
}

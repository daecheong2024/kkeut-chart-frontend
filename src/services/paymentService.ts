import apiClient from "./apiClient";

export interface PaymentItem {
    id: number;
    patientId: number;
    visitId?: number;
    branchId: string;
    amount: number;
    paidAt: string;
    status?: "paid" | "refunded" | "cancelled" | string;
}

export interface PaymentDetailBreakdown {
    id: number;
    paymentType: string;
    amount: number;
    cardCompany?: string;
    paymentSubMethodLabel?: string;
    memo?: string;
}

export interface PaymentItemDetail {
    itemName: string;
    itemType: string;  // ticket, membership, treatment
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    issuedEntityType?: string;
    issuedEntityId?: number;
    paymentDetailId?: number;
    originalPrice?: number;
    eventPrice?: number;
    discountedPrice?: number;
    discountPercent?: number;
    paymentDetails?: PaymentDetailBreakdown[];
}

export interface PaymentRecord {
    id: number;
    paymentMasterId?: number;
    patientId: number;
    visitId?: number;
    paidAt: string;
    items: PaymentItemDetail[];
    totalAmount: number;
    membershipDeduction: number;
    cashPaid: number;
    cardPaid?: number;
    transferPaid?: number;
    easyPayPaid?: number;
    method?: string;
    paymentCategory?: string;
    paymentSubMethod?: string;
    paymentSubMethodLabel?: string;
    cardCompany?: string;
    collectorName?: string;
    memo?: string;
    status?: "paid" | "refunded" | "cancelled" | "partial_refunded" | string;
}

export interface PaymentUsageSummaryItem {
    id: string;
    sourceType: "payment" | "ticket_usage" | "membership_deduction" | string;
    sourceLabel: string;
    itemName: string;
    itemType: string;
    quantity: number;
    amount: number;
    occurredAt: string;
    paymentRecordId?: number;
    ticketId?: number;
    membershipId?: number;
    originalPrice?: number;
    eventPrice?: number;
    bonusPoint?: number;
    ticketType?: string;
    totalCount?: number;
    usedRound?: number;
    usedTreatments?: string;
    expireDate?: string;
    usedCashAmount?: number;
    usedPointAmount?: number;
    remainingCashAmount?: number;
    remainingPointAmount?: number;
    paidAmount?: number;
}

export interface RefundCheckItemDetail {
    itemName: string;
    itemType: string;
    rootId?: number;
    paymentDetailId: number;
    originalPrice: number;
    eventPrice?: number;
    discountAmount: number;
    paidAmount: number;
    originalUnitPrice: number;
    usedCount: number;
    totalCount?: number;
    usedAmountAtOriginalPrice: number;
    penaltyRate: number;
    penaltyAmount: number;
    estimatedRefund: number;
    refundFormula: string;
}

export interface PaymentRefundCheck {
    canRefund: boolean;
    reason?: string;
    sourceAmount?: number;
    autoUsedAmount?: number;
    penaltyAmount?: number;
    estimatedRefund?: number;
    items?: RefundCheckItemDetail[];
}

export interface RefundPaymentRequest {
    reason?: string;
    responsibilityType?: "customer" | "hospital";
    manualUsedAmount?: number;
}

export interface RefundPaymentResult {
    sourceAmount: number;
    autoUsedAmount: number;
    usedAmount: number;
    penaltyAmount: number;
    finalRefundAmount: number;
    responsibilityType: "customer" | "hospital" | string;
}

export interface TicketRefundRequest {
    paymentMasterId: number;
    ticketRootId: number;
    refundAmount: number;
    responsibilityType: string;
    reason?: string;
}

export interface MembershipRefundRequest {
    paymentMasterId: number;
    membershipRootId: number;
    refundAmount: number;
    responsibilityType: string;
    reason?: string;
}

export interface TicketRefundResponse {
    success: boolean;
    message: string;
    totalRefunded: number;
    details: Array<{
        refundHistId: number;
        paymentDetailId: number;
        paymentType: string;
        refundAmount: number;
        membershipHistId?: number;
    }>;
}

export type RefundType = "customer_change" | "hospital_fault" | "manual";

export interface RefundCalculateRequest {
    paymentMasterId: number;
    paymentDetailId: number;
    refundType: RefundType;
    penaltyRate?: number;
    manualAmount?: number;
    reason?: string;
}

export interface RefundCalculateResult {
    canRefund: boolean;
    reason?: string;
    itemName: string;
    itemType: string;
    refundType: string;
    paidAmount: number;
    penaltyRate: number;
    penaltyAmount: number;
    usageDeduction: number;
    usedCount: number;
    totalCount: number;
    remainingCount: number;
    singleSessionPrice: number | null;
    estimatedRefund: number;
    formula: string;
}

export interface RefundExecuteRequest {
    paymentMasterId: number;
    paymentDetailId: number;
    refundType: RefundType;
    penaltyRate?: number;
    manualAmount?: number;
    reason?: string;
}

export interface RefundExecuteResult {
    success: boolean;
    message: string;
    refundType: string;
    paidAmount: number;
    penaltyAmount: number;
    usageDeduction: number;
    refundAmount: number;
    formula: string;
    details: Array<{
        refundHistId: number;
        paymentDetailId: number;
        paymentType: string;
        refundAmount: number;
        membershipHistId?: number;
    }>;
}

export const paymentService = {
    calcActualPaidAmount(record: Partial<PaymentRecord>): number {
        const methodPaid =
            (record.cashPaid || 0) +
            (record.cardPaid || 0) +
            (record.transferPaid || 0) +
            (record.easyPayPaid || 0);

        if (methodPaid > 0) return methodPaid;

        const total = record.totalAmount || 0;
        const membershipDeduction = record.membershipDeduction || 0;
        return Math.max(0, total - membershipDeduction);
    },

    /**
     * List payments by patient (legacy UI shape)
     */
    async listByPatient(patientId: number, date?: string, visitId?: number): Promise<PaymentItem[]> {
        try {
            const qs = new URLSearchParams({ patientId: String(patientId) });
            if (date) qs.set("date", date);
            if (visitId) qs.set("visitId", String(visitId));
            const response = await apiClient.get(`/payments?${qs.toString()}`);
            const records = (response.data || []) as any[];

            return records.map((r) => ({
                // Legacy paid amount prefers explicit method fields first.
                // If absent, fallback to (total - membership deduction).
                amount: (() => {
                    const methodPaid =
                        (r.cashPaid || 0) +
                        (r.cardPaid || 0) +
                        (r.transferPaid || 0) +
                        (r.easyPayPaid || 0);
                    if (methodPaid > 0) return methodPaid;
                    return Math.max(0, (r.totalAmount || 0) - (r.membershipDeduction || 0));
                })(),
                id: Number(r.id),
                patientId: Number(r.patientId ?? patientId),
                visitId: typeof r.visitId === "number" ? r.visitId : undefined,
                branchId: String(r.branchId ?? ""),
                paidAt: String(r.paidAt ?? r.createTime ?? new Date().toISOString()),
                status: String(r.status ?? "paid"),
            }));
        } catch (e) {
            console.error("Error fetching payments:", e);
            return []; // Fail gracefully
        }
    },

    /**
     * Get payment records (new - with item details)
     */
    async getPaymentRecords(patientId: number, date?: string, visitId?: number): Promise<PaymentRecord[]> {
        try {
            let url = `/payments?patientId=${patientId}`;
            if (date) {
                url += `&date=${encodeURIComponent(date)}`;
            }
            if (visitId) {
                url += `&visitId=${visitId}`;
            }
            const response = await apiClient.get<PaymentRecord[]>(url);
            return response.data;
        } catch (e) {
            console.error("Error fetching payment records:", e);
            return [];
        }
    },

    async getUsageSummary(patientId: number, date: string, visitId?: number): Promise<PaymentUsageSummaryItem[]> {
        try {
            const qs = new URLSearchParams({ patientId: String(patientId), date });
            if (typeof visitId === "number" && Number.isFinite(visitId) && visitId > 0) {
                qs.set("visitId", String(visitId));
            }
            const response = await apiClient.get<PaymentUsageSummaryItem[]>(`/payments/usage-summary?${qs.toString()}`);
            return Array.isArray(response.data) ? response.data : [];
        } catch (e) {
            console.error("Error fetching payment usage summary:", e);
            return [];
        }
    },

    async refundPaymentRecord(paymentRecordId: number, payload?: RefundPaymentRequest): Promise<RefundPaymentResult> {
        const response = await apiClient.post(`/payments/${paymentRecordId}/refund`, {
            reason: String(payload?.reason || "").trim() || undefined,
            responsibilityType: payload?.responsibilityType || "customer",
            manualUsedAmount: typeof payload?.manualUsedAmount === "number"
                ? Math.max(0, Math.round(payload.manualUsedAmount))
                : undefined,
        });

        return {
            sourceAmount: Number(response?.data?.sourceAmount || 0),
            autoUsedAmount: Number(response?.data?.autoUsedAmount || 0),
            usedAmount: Number(response?.data?.usedAmount || 0),
            penaltyAmount: Number(response?.data?.penaltyAmount || 0),
            finalRefundAmount: Number(response?.data?.finalRefundAmount || 0),
            responsibilityType: String(response?.data?.responsibilityType || "customer"),
        };
    },

    async getRefundCheck(paymentMasterId: number): Promise<PaymentRefundCheck> {
        const response = await apiClient.get(`/payments/${paymentMasterId}/refund-check`);
        const d = response?.data;
        return {
            canRefund: Boolean(d?.canRefund),
            reason: typeof d?.reason === "string" ? d.reason : undefined,
            sourceAmount: Number(d?.sourceAmount || 0),
            autoUsedAmount: Number(d?.autoUsedAmount || 0),
            penaltyAmount: Number(d?.penaltyAmount || 0),
            estimatedRefund: Number(d?.estimatedRefund || 0),
            items: Array.isArray(d?.items) ? d.items : [],
        };
    },

    async processTicketRefund(request: TicketRefundRequest): Promise<TicketRefundResponse> {
        const response = await apiClient.post('/payments/ticket-refund', request);
        return response.data;
    },

    async processMembershipRefund(request: MembershipRefundRequest): Promise<TicketRefundResponse> {
        const response = await apiClient.post('/payments/membership-refund', request);
        return response.data;
    },

    async calculateRefund(request: RefundCalculateRequest): Promise<RefundCalculateResult> {
        const response = await apiClient.post('/payments/refund/calculate', request);
        const d = response?.data ?? {};
        return {
            canRefund: Boolean(d.canRefund),
            reason: typeof d.reason === "string" ? d.reason : undefined,
            itemName: String(d.itemName || ""),
            itemType: String(d.itemType || ""),
            refundType: String(d.refundType || ""),
            paidAmount: Number(d.paidAmount || 0),
            penaltyRate: Number(d.penaltyRate || 0),
            penaltyAmount: Number(d.penaltyAmount || 0),
            usageDeduction: Number(d.usageDeduction || 0),
            usedCount: Number(d.usedCount || 0),
            totalCount: Number(d.totalCount || 0),
            remainingCount: Number(d.remainingCount || 0),
            singleSessionPrice: d.singleSessionPrice == null ? null : Number(d.singleSessionPrice),
            estimatedRefund: Number(d.estimatedRefund || 0),
            formula: String(d.formula || ""),
        };
    },

    async executeRefund(request: RefundExecuteRequest): Promise<RefundExecuteResult> {
        const response = await apiClient.post('/payments/refund/execute', request);
        const d = response?.data ?? {};
        return {
            success: Boolean(d.success),
            message: String(d.message || ""),
            refundType: String(d.refundType || ""),
            paidAmount: Number(d.paidAmount || 0),
            penaltyAmount: Number(d.penaltyAmount || 0),
            usageDeduction: Number(d.usageDeduction || 0),
            refundAmount: Number(d.refundAmount || 0),
            formula: String(d.formula || ""),
            details: Array.isArray(d.details) ? d.details : [],
        };
    },

    async create(patientId: number, amount: number): Promise<PaymentItem> {
        throw new Error("Manual payment creation endpoint is not implemented. Use cart checkout flow.");
    }
};

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

export interface RefundSummaryItem {
    type: string;
    name: string;
    amount: number;
    paymentType?: string;
    paidAmount?: number | null;
    usageDeduction?: number | null;
    usedCount?: number | null;
    totalCount?: number | null;
    singleSessionPrice?: number | null;
}

export interface RefundSummaryResult {
    refundDateTime: string;
    reason?: string;
    totalRefunded: number;
    penalty: number;
    refundMethod?: string;
    collectorName?: string;
    items: RefundSummaryItem[];
}

export interface PaymentDetailBreakdown {
    id: number;
    paymentType: string;
    amount: number;
    cardCompany?: string;
    paymentSubMethodLabel?: string;
    installment?: string;
    memo?: string;
    /** ISSUE-176: 단말기 환불용 원거래 정보 */
    terminalAuthNo?: string;
    terminalAuthDate?: string;
    terminalVanKey?: string;
    membershipId?: number;
    membershipName?: string;
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
        rePaymentDetailId?: number;
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

// 위약금 재결제 + 원거래 전체취소 2단계 패턴
export interface RePaymentFields {
    rePaymentAmount?: number;
    rePaymentTerminalAuthNo?: string;
    rePaymentTerminalAuthDate?: string;
    rePaymentVanKey?: string;
    rePaymentCardCompany?: string;
    rePaymentSubMethod?: string;
    rePaymentSubMethodLabel?: string;
    rePaymentInstallment?: string;
    rePaymentTerminalCardNo?: string;
    rePaymentTerminalTranNo?: string;
    rePaymentTerminalAccepterName?: string;
    rePaymentTerminalCatId?: string;
    rePaymentTerminalMerchantRegNo?: string;
}

export interface TerminalRefundFields {
    terminalRefundAuthNo?: string;
    terminalRefundDate?: string;
    terminalVanKey?: string;
    refundMethod?: string;
}

export interface RefundExecuteRequest extends RePaymentFields, TerminalRefundFields {
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
        rePaymentDetailId?: number;
    }>;
}

// ============================================================
// ISSUE-174: Bulk refund + Membership settlement
// ============================================================

export interface BulkRefundItem extends RePaymentFields, TerminalRefundFields {
    paymentMasterId: number;
    paymentDetailId: number;
    refundType: RefundType;
    penaltyRate?: number;
    manualAmount?: number;
    reason?: string;
}

export interface BulkRefundRequest {
    items: BulkRefundItem[];
    commonReason?: string;
}

export interface BulkRefundItemResult {
    paymentDetailId: number;
    itemName: string;
    itemType: string;
    success: boolean;
    errorMessage?: string;
    refundAmount: number;
    penaltyAmount: number;
    usageDeduction: number;
    formula: string;
}

export interface BulkRefundResponse {
    allSucceeded: boolean;
    successCount: number;
    failureCount: number;
    totalRefundAmount: number;
    results: BulkRefundItemResult[];
}

export interface MembershipSettlementLinkedTicket {
    paymentDetailId: number;
    paymentMasterId: number;
    ticketId: number | null;
    ticketName: string;
    paidViaMembership: number;
    paymentType: string;
    usedCount: number;
    totalCount: number;
    remainingCount: number;
    singleSessionPrice: number | null;
    estimatedRefund: number;
    alreadyRefunded: boolean;
}

export interface MembershipSettlementInfo {
    membershipRootId: number;
    membershipDefId: number;
    membershipName: string;
    paymentMasterId: number;
    originPurchasePrice: number;
    discountedPurchasePrice: number;
    snapshotBonusPoint: number;
    currentCashBalance: number;
    currentPointBalance: number;
    netCashUsed: number;
    netPointUsed: number;
    membershipAlreadyRefunded: boolean;
    linkedTickets: MembershipSettlementLinkedTicket[];
    defaultPenaltyRate: number;
    previewMembershipBalanceRefund: number;
    previewLinkedTicketsRefundTotal: number;
    previewMembershipPenalty: number;
    previewTotalRefund: number;
    previewFormula: string;
}

export interface MembershipSettlementExecuteRequest extends RePaymentFields {
    refundType: RefundType;
    includedPaymentDetailIds: number[];
    penaltyRate?: number;
    manualAmount?: number;
    reason?: string;
    // 회원권 본체(카드) 환불 2단계 패턴
    membershipCardRefundAmount?: number;
    membershipCardRefundAuthNo?: string;
    membershipCardRefundDate?: string;
    membershipCardRefundVanKey?: string;
    refundMethod?: string;
}

export interface MembershipSettlementExecuteResponse {
    success: boolean;
    message: string;
    membershipBalanceRefund: number;
    linkedTicketsRefundTotal: number;
    membershipPenaltyAmount: number;
    totalRefundAmount: number;
    ticketResults: BulkRefundItemResult[];
    formula: string;
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

    /**
     * 단말기 미연동 환경에서 영수증 보고 직원이 PaymentDetail의 단말기 정보를
     * 수기 입력 / 수정. 환불 2단계 패턴 사용 가능하게 만든다.
     */
    async updatePaymentDetailTerminalInfo(
        paymentDetailId: number,
        info: { authNo?: string; terminalAuthDate?: string; terminalVanKey?: string; cardCompany?: string; installment?: string }
    ): Promise<void> {
        await apiClient.patch(`/payments/details/${paymentDetailId}/terminal-info`, info);
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
    },

    async executeBulkRefund(request: BulkRefundRequest): Promise<BulkRefundResponse> {
        const response = await apiClient.post('/payments/refund/bulk', request);
        const d = response?.data ?? {};
        return {
            allSucceeded: Boolean(d.allSucceeded),
            successCount: Number(d.successCount || 0),
            failureCount: Number(d.failureCount || 0),
            totalRefundAmount: Number(d.totalRefundAmount || 0),
            results: Array.isArray(d.results) ? d.results : [],
        };
    },

    async getMembershipSettlementByPaymentDetail(paymentDetailId: number): Promise<MembershipSettlementInfo> {
        const response = await apiClient.get(`/payments/memberships/settlement/by-detail/${paymentDetailId}`);
        const d = response?.data ?? {};
        return {
            membershipRootId: Number(d.membershipRootId || 0),
            membershipDefId: Number(d.membershipDefId || 0),
            membershipName: String(d.membershipName || ""),
            paymentMasterId: Number(d.paymentMasterId || 0),
            originPurchasePrice: Number(d.originPurchasePrice || 0),
            discountedPurchasePrice: Number(d.discountedPurchasePrice || 0),
            snapshotBonusPoint: Number(d.snapshotBonusPoint || 0),
            currentCashBalance: Number(d.currentCashBalance || 0),
            currentPointBalance: Number(d.currentPointBalance || 0),
            netCashUsed: Number(d.netCashUsed || 0),
            netPointUsed: Number(d.netPointUsed || 0),
            membershipAlreadyRefunded: Boolean(d.membershipAlreadyRefunded),
            linkedTickets: Array.isArray(d.linkedTickets) ? d.linkedTickets : [],
            defaultPenaltyRate: Number(d.defaultPenaltyRate || 0),
            previewMembershipBalanceRefund: Number(d.previewMembershipBalanceRefund || 0),
            previewLinkedTicketsRefundTotal: Number(d.previewLinkedTicketsRefundTotal || 0),
            previewMembershipPenalty: Number(d.previewMembershipPenalty || 0),
            previewTotalRefund: Number(d.previewTotalRefund || 0),
            previewFormula: String(d.previewFormula || ""),
        };
    },

    async getMembershipSettlement(membershipRootId: number): Promise<MembershipSettlementInfo> {
        const response = await apiClient.get(`/payments/memberships/${membershipRootId}/settlement`);
        const d = response?.data ?? {};
        return {
            membershipRootId: Number(d.membershipRootId || 0),
            membershipDefId: Number(d.membershipDefId || 0),
            membershipName: String(d.membershipName || ""),
            paymentMasterId: Number(d.paymentMasterId || 0),
            originPurchasePrice: Number(d.originPurchasePrice || 0),
            discountedPurchasePrice: Number(d.discountedPurchasePrice || 0),
            snapshotBonusPoint: Number(d.snapshotBonusPoint || 0),
            currentCashBalance: Number(d.currentCashBalance || 0),
            currentPointBalance: Number(d.currentPointBalance || 0),
            netCashUsed: Number(d.netCashUsed || 0),
            netPointUsed: Number(d.netPointUsed || 0),
            membershipAlreadyRefunded: Boolean(d.membershipAlreadyRefunded),
            linkedTickets: Array.isArray(d.linkedTickets) ? d.linkedTickets : [],
            defaultPenaltyRate: Number(d.defaultPenaltyRate || 0),
            previewMembershipBalanceRefund: Number(d.previewMembershipBalanceRefund || 0),
            previewLinkedTicketsRefundTotal: Number(d.previewLinkedTicketsRefundTotal || 0),
            previewMembershipPenalty: Number(d.previewMembershipPenalty || 0),
            previewTotalRefund: Number(d.previewTotalRefund || 0),
            previewFormula: String(d.previewFormula || ""),
        };
    },

    async getRefundSummaryByMembershipHist(membershipHistId: number): Promise<RefundSummaryResult> {
        const response = await apiClient.get(`/payments/refund-summary/by-membership-hist/${membershipHistId}`);
        const d = response?.data ?? {};
        return {
            refundDateTime: String(d.refundDateTime || ""),
            reason: d.reason ? String(d.reason) : undefined,
            totalRefunded: Number(d.totalRefunded || 0),
            penalty: Number(d.penalty || 0),
            refundMethod: d.refundMethod ? String(d.refundMethod) : undefined,
            collectorName: d.collectorName ? String(d.collectorName) : undefined,
            items: Array.isArray(d.items) ? d.items.map((it: any) => ({
                type: String(it.type || ""),
                name: String(it.name || ""),
                amount: Number(it.amount || 0),
                paymentType: it.paymentType ? String(it.paymentType) : undefined,
                paidAmount: it.paidAmount == null ? null : Number(it.paidAmount),
                usageDeduction: it.usageDeduction == null ? null : Number(it.usageDeduction),
                usedCount: it.usedCount == null ? null : Number(it.usedCount),
                totalCount: it.totalCount == null ? null : Number(it.totalCount),
                singleSessionPrice: it.singleSessionPrice == null ? null : Number(it.singleSessionPrice),
            })) : [],
        };
    },

    async executeMembershipSettlement(membershipRootId: number, request: MembershipSettlementExecuteRequest): Promise<MembershipSettlementExecuteResponse> {
        const response = await apiClient.post(`/payments/memberships/${membershipRootId}/settlement/execute`, request);
        const d = response?.data ?? {};
        return {
            success: Boolean(d.success),
            message: String(d.message || ""),
            membershipBalanceRefund: Number(d.membershipBalanceRefund || 0),
            linkedTicketsRefundTotal: Number(d.linkedTicketsRefundTotal || 0),
            membershipPenaltyAmount: Number(d.membershipPenaltyAmount || 0),
            totalRefundAmount: Number(d.totalRefundAmount || 0),
            ticketResults: Array.isArray(d.ticketResults) ? d.ticketResults : [],
            formula: String(d.formula || ""),
        };
    }
};

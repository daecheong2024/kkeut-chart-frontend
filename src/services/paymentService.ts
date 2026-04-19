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

export interface PaymentOperationLeg {
    legKey: string;
    sequence: number;
    role: string;
    status: string;
    requestedAmount: number;
    completedAmount: number;
    paymentCategory?: string;
    paymentSubMethod?: string;
    paymentSubMethodLabel?: string;
    isTerminalRequired: boolean;
    allowManualClose: boolean;
    originPaymentDetailId?: number;
    resultPaymentDetailId?: number;
    resultRefundHistId?: number;
    resultCashReceiptId?: number;
    terminalRequestKey?: string;
    terminalTradeKey?: string;
    terminalAuthNo?: string;
    terminalAuthDate?: string;
    terminalVanKey?: string;
    terminalCatId?: string;
    errorMessage?: string;
    completedAt?: string;
}

export interface PaymentOperationSummary {
    id: number;
    operationKey: string;
    operationType: string;
    status: string;
    nextAction: string;
    customerId: number;
    paymentMasterId?: number;
    originPaymentDetailId?: number;
    rePaymentDetailId?: number;
    membershipRootId?: number;
    requestedAmount: number;
    completedAmount: number;
    remainingAmount: number;
    totalLegCount: number;
    succeededLegCount: number;
    pendingLegCount: number;
    unknownLegCount: number;
    manualActionLegCount: number;
    summaryMessage?: string;
    startedAt: string;
    lastSyncedAt: string;
    completedAt?: string;
    legs: PaymentOperationLeg[];
}

export interface PaymentWorkCenterAction {
    actionCode: string;
    label: string;
    isPrimary: boolean;
}

export interface PaymentWorkCenterTerminalGap {
    paymentDetailId: number;
    paymentType: string;
    amount: number;
    paymentSubMethodLabel?: string;
    cardCompany?: string;
    missingFieldSummary: string;
}

export interface PaymentWorkCenterItem {
    workItemKey: string;
    paymentMasterId: number;
    paidAt: string;
    lastUpdatedAt: string;
    workType: string;
    statusTone: string;
    statusLabel: string;
    headline: string;
    description: string;
    itemSummary: string;
    nextActionCode?: string;
    nextActionLabel?: string;
    canResumeCollection: boolean;
    canRetry: boolean;
    canManualClose: boolean;
    canEditTerminalInfo: boolean;
    totalAmount: number;
    completedAmount: number;
    outstandingAmount: number;
    totalLegCount: number;
    succeededLegCount: number;
    pendingLegCount: number;
    unknownLegCount: number;
    manualActionLegCount: number;
    missingTerminalDetailCount: number;
    focusedPaymentDetailId?: number;
    originPaymentDetailId?: number;
    rePaymentDetailId?: number;
    originPaymentType?: string;
    originAmount?: number;
    availableActions: PaymentWorkCenterAction[];
    missingTerminalDetails: PaymentWorkCenterTerminalGap[];
    operation?: PaymentOperationSummary | null;
}

export interface PaymentWorkCenterSummary {
    customerId: number;
    totalWorkItemCount: number;
    needsAttentionCount: number;
    outstandingCollectionCount: number;
    refundFollowUpCount: number;
    terminalInfoRequiredCount: number;
    items: PaymentWorkCenterItem[];
}

export interface SyncPaymentOperationLegRequest {
    legKey: string;
    sequence: number;
    role: "payment" | "refund" | "repayment" | "cash_receipt_issue" | "cash_receipt_cancel";
    status: "pending" | "in_progress" | "succeeded" | "failed" | "unknown" | "needs_manual_action" | "skipped";
    requestedAmount: number;
    completedAmount?: number;
    paymentCategory?: string;
    paymentSubMethod?: string;
    paymentSubMethodLabel?: string;
    isTerminalRequired?: boolean;
    allowManualClose?: boolean;
    originPaymentDetailId?: number;
    resultPaymentDetailId?: number;
    resultRefundHistId?: number;
    resultCashReceiptId?: number;
    terminalRequestKey?: string;
    terminalTradeKey?: string;
    terminalAuthNo?: string;
    terminalAuthDate?: string;
    terminalVanKey?: string;
    terminalCatId?: string;
    errorMessage?: string;
}

export interface SyncPaymentOperationRequest {
    operationKey: string;
    operationType: "checkout" | "add_payment_detail" | "refund_workflow" | "membership_settlement";
    status: "pending" | "in_progress" | "succeeded" | "failed" | "unknown" | "needs_manual_action" | "completed";
    nextAction?: "none" | "resume_checkout" | "resume_refund" | "finalize_refund" | "verify_terminal" | "retry_leg" | "manual_close";
    customerId?: number;
    paymentMasterId?: number;
    originPaymentDetailId?: number;
    rePaymentDetailId?: number;
    membershipRootId?: number;
    requestedAmount?: number;
    completedAmount?: number;
    remainingAmount?: number;
    summaryMessage?: string;
    legs: SyncPaymentOperationLegRequest[];
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
    terminalCatId?: string;
    terminalMerchantRegNo?: string;
    membershipId?: number;
    membershipName?: string;
    isRefunded?: boolean;
    refundedAmount?: number;
    refundedAt?: string;
    rePaymentDetailId?: number;
    rePaymentAmount?: number;
    rePaymentMethod?: string;
    refundReason?: string;
    cashReceiptId?: number;
    cashReceiptTransactionType?: string;
    cashReceiptStatus?: string;
    cashReceiptStatusLabel?: string;
    cashReceiptNeedsAction?: boolean;
    cashReceiptPurpose?: string;
    cashReceiptIdentifierMasked?: string;
    cashReceiptApprovalNo?: string;
    cashReceiptApprovalDate?: string;
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
    currentAmount?: number;
    outstandingAmount?: number;
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
    status?: "paid" | "refunded" | "cancelled" | "partial_refunded" | "in_progress" | string;
    activeOperation?: PaymentOperationSummary | null;
}

export interface AddPaymentDetailLine {
    method?: string;
    paymentCategory?: string;
    paymentSubMethod?: string;
    paymentSubMethodLabel?: string;
    clientLegKey?: string;
    amount: number;
    taxFreeAmount?: number;
    memo?: string;
    assignee?: string;
    cardCompany?: string;
    installment?: string;
    approvalNumber?: string;
    terminalAuthDate?: string;
    terminalCardNo?: string;
    terminalAccepterName?: string;
    terminalTranNo?: string;
    terminalVanKey?: string;
    terminalCatId?: string;
    terminalMerchantRegNo?: string;
    cashReceipt?: CheckoutCashReceiptRequest;
}

export interface AddPaymentDetailResult {
    paymentMasterId: number;
    totalAmount: number;
    currentAmount: number;
    outstandingAmount: number;
    status: string;
    operation?: PaymentOperationSummary | null;
    cashReceiptTasks?: CashReceiptTaskResponse[];
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
    ticketDefId: number | null;
}

// 위약금 재결제 + 원거래 전체취소 2단계 패턴
export interface RePaymentFields {
    rePaymentAmount?: number;
    /** 위약금 결제수단 ("CARD" / "PAY" / "CASH" / "BANKING"). 기본 CARD. */
    rePaymentMethod?: string;
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
    operationKey?: string;
    idempotencyKey?: string;
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
    operation?: PaymentOperationSummary | null;
    cashReceiptTasks?: CashReceiptTaskResponse[];
}

export type CashReceiptPurpose = "consumer" | "business" | "voluntary";
export type CashReceiptIdentifierType = "phone" | "business_no" | "self_issued";

export interface CheckoutCashReceiptRequest {
    enabled: boolean;
    purpose?: CashReceiptPurpose;
    type?: CashReceiptPurpose;
    identifierType?: CashReceiptIdentifierType;
    identifierValue?: string;
    identity?: string;
}

export interface CashReceiptTaskResponse {
    cashReceiptId: number;
    paymentMasterId: number;
    paymentDetailId: number;
    refundHistId?: number;
    transactionType: string;
    status: string;
    purpose: string;
    identifierType: string;
    identifierMasked?: string;
    amount: number;
    supplyAmount: number;
    vatAmount: number;
    nonTaxAmount: number;
    approvalNo?: string;
    approvalDate?: string;
    providerTradeType?: string;
    providerAddInfo?: string;
    providerTradeKey?: string;
    providerCatId?: string;
    operationKey?: string;
    idempotencyKey?: string;
    cancelReasonCode?: string;
    lastErrorMessage?: string;
    originalApprovalNo?: string;
    originalApprovalDate?: string;
    requestedAt: string;
    completedAt?: string;
}

export interface UpdateCashReceiptResultRequest {
    status: "issued" | "cancelled" | "unknown" | "needs_manual_action" | "failed" | "cancel_failed" | "manual_confirmed";
    operationKey?: string;
    idempotencyKey?: string;
    approvalNo?: string;
    approvalDate?: string;
    providerTradeType?: string;
    providerAddInfo?: string;
    providerTradeKey?: string;
    providerCatId?: string;
    providerRawResponse?: string;
    errorMessage?: string;
}

export interface CashReceiptResultResponse {
    cashReceipt: CashReceiptTaskResponse;
    operation?: PaymentOperationSummary | null;
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
    operationKey?: string;
    idempotencyKey?: string;
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
    cashReceiptTasks?: CashReceiptTaskResponse[];
}

export interface BulkRefundResponse {
    allSucceeded: boolean;
    successCount: number;
    failureCount: number;
    totalRefundAmount: number;
    results: BulkRefundItemResult[];
    operations?: PaymentOperationSummary[];
    cashReceiptTasks?: CashReceiptTaskResponse[];
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
    operationKey?: string;
    idempotencyKey?: string;
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
    operation?: PaymentOperationSummary | null;
    cashReceiptTasks?: CashReceiptTaskResponse[];
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

    /**
     * 환불 부분상태 디커플링 — 위약금 단말기 결제 OK 시점에 즉시 호출.
     * BE 가 위약금 PaymentDetail 저장 + Master.Status = DEDUCTION_PAID 마킹.
     */
    async deductionPay(req: {
        paymentMasterId: number;
        originPaymentDetailId: number;
        amount: number;
        method?: string;
        terminalAuthNo?: string;
        terminalAuthDate?: string;
        vanKey?: string;
        cardCompany?: string;
        subMethod?: string;
        subMethodLabel?: string;
        installment?: string;
        terminalCardNo?: string;
        terminalTranNo?: string;
        terminalAccepterName?: string;
        terminalCatId?: string;
        terminalMerchantRegNo?: string;
        operationKey?: string;
        idempotencyKey?: string;
    }): Promise<{ success: boolean; rePaymentDetailId: number; paymentMasterId: number; status: string; message: string; operation?: PaymentOperationSummary | null; cashReceiptTasks?: CashReceiptTaskResponse[] }> {
        const response = await apiClient.post('/payments/refunds/deduction-pay', req);
        return response.data;
    },

    /**
     * deduction-pay 후 원거래 전체취소 단말기 응답을 받아 RefundHist 생성 + 상태 REFUNDED 전환.
     */
    async finalizeRefund(paymentMasterId: number, req: {
        originPaymentDetailId: number;
        rePaymentDetailId?: number;
        refundType: RefundType;
        penaltyRate?: number;
        manualAmount?: number;
        reason?: string;
        terminalRefundAuthNo?: string;
        terminalRefundDate?: string;
        terminalVanKey?: string;
        refundMethod?: string;
        operationKey?: string;
        idempotencyKey?: string;
    }): Promise<RefundExecuteResult> {
        const response = await apiClient.post(`/payments/refunds/${paymentMasterId}/finalize`, req);
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
            ticketDefId: d.ticketDefId == null ? null : Number(d.ticketDefId),
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
            operation: d.operation ?? null,
            cashReceiptTasks: Array.isArray(d.cashReceiptTasks) ? d.cashReceiptTasks : [],
        };
    },

    async create(patientId: number, amount: number): Promise<PaymentItem> {
        throw new Error("Manual payment creation endpoint is not implemented. Use cart checkout flow.");
    },

    async addPaymentDetail(
        paymentMasterId: number,
        lines: AddPaymentDetailLine[],
        options?: { operationKey?: string; idempotencyKey?: string }
    ): Promise<AddPaymentDetailResult> {
        const response = await apiClient.post(`/payments/${paymentMasterId}/add-detail`, {
            paymentLines: lines,
            operationKey: options?.operationKey,
            idempotencyKey: options?.idempotencyKey,
        });
        const d = response?.data ?? {};
        return {
            paymentMasterId: Number(d.paymentMasterId || paymentMasterId),
            totalAmount: Number(d.totalAmount || 0),
            currentAmount: Number(d.currentAmount || 0),
            outstandingAmount: Number(d.outstandingAmount || 0),
            status: String(d.status || ""),
            operation: d.operation ?? null,
            cashReceiptTasks: Array.isArray(d.cashReceiptTasks) ? d.cashReceiptTasks : [],
        };
    },

    async executeBulkRefund(request: BulkRefundRequest): Promise<BulkRefundResponse> {
        const response = await apiClient.post('/payments/refund/bulk', request);
        const d = response?.data ?? {};
        return {
            allSucceeded: Boolean(d.allSucceeded),
            successCount: Number(d.successCount || 0),
            failureCount: Number(d.failureCount || 0),
            totalRefundAmount: Number(d.totalRefundAmount || 0),
            results: Array.isArray(d.results) ? d.results.map((item: any) => ({
                ...item,
                cashReceiptTasks: Array.isArray(item?.cashReceiptTasks) ? item.cashReceiptTasks : [],
            })) : [],
            operations: Array.isArray(d.operations) ? d.operations : [],
            cashReceiptTasks: Array.isArray(d.cashReceiptTasks) ? d.cashReceiptTasks : [],
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
            ticketResults: Array.isArray(d.ticketResults) ? d.ticketResults.map((item: any) => ({
                ...item,
                cashReceiptTasks: Array.isArray(item?.cashReceiptTasks) ? item.cashReceiptTasks : [],
            })) : [],
            formula: String(d.formula || ""),
            operation: d.operation ?? null,
            cashReceiptTasks: Array.isArray(d.cashReceiptTasks) ? d.cashReceiptTasks : [],
        };
    },

    async syncOperation(request: SyncPaymentOperationRequest): Promise<PaymentOperationSummary> {
        const response = await apiClient.post('/payments/operations/sync', request);
        return response.data;
    },

    async getOperationByKey(operationKey: string): Promise<PaymentOperationSummary | null> {
        const response = await apiClient.get(`/payments/operations/by-key?operationKey=${encodeURIComponent(operationKey)}`);
        return response?.data ?? null;
    },

    async getWorkCenter(patientId: number): Promise<PaymentWorkCenterSummary> {
        const response = await apiClient.get(`/payments/operations/work-center?patientId=${encodeURIComponent(String(patientId))}`);
        const d = response?.data ?? {};
        return {
            customerId: Number(d.customerId || patientId || 0),
            totalWorkItemCount: Number(d.totalWorkItemCount || 0),
            needsAttentionCount: Number(d.needsAttentionCount || 0),
            outstandingCollectionCount: Number(d.outstandingCollectionCount || 0),
            refundFollowUpCount: Number(d.refundFollowUpCount || 0),
            terminalInfoRequiredCount: Number(d.terminalInfoRequiredCount || 0),
            items: Array.isArray(d.items) ? d.items.map((item: any) => ({
                workItemKey: String(item.workItemKey || ""),
                paymentMasterId: Number(item.paymentMasterId || 0),
                paidAt: String(item.paidAt || ""),
                lastUpdatedAt: String(item.lastUpdatedAt || item.paidAt || ""),
                workType: String(item.workType || ""),
                statusTone: String(item.statusTone || "neutral"),
                statusLabel: String(item.statusLabel || ""),
                headline: String(item.headline || ""),
                description: String(item.description || ""),
                itemSummary: String(item.itemSummary || ""),
                nextActionCode: item.nextActionCode ? String(item.nextActionCode) : undefined,
                nextActionLabel: item.nextActionLabel ? String(item.nextActionLabel) : undefined,
                canResumeCollection: Boolean(item.canResumeCollection),
                canRetry: Boolean(item.canRetry),
                canManualClose: Boolean(item.canManualClose),
                canEditTerminalInfo: Boolean(item.canEditTerminalInfo),
                totalAmount: Number(item.totalAmount || 0),
                completedAmount: Number(item.completedAmount || 0),
                outstandingAmount: Number(item.outstandingAmount || 0),
                totalLegCount: Number(item.totalLegCount || 0),
                succeededLegCount: Number(item.succeededLegCount || 0),
                pendingLegCount: Number(item.pendingLegCount || 0),
                unknownLegCount: Number(item.unknownLegCount || 0),
                manualActionLegCount: Number(item.manualActionLegCount || 0),
                missingTerminalDetailCount: Number(item.missingTerminalDetailCount || 0),
                focusedPaymentDetailId: item.focusedPaymentDetailId == null ? undefined : Number(item.focusedPaymentDetailId),
                originPaymentDetailId: item.originPaymentDetailId == null ? undefined : Number(item.originPaymentDetailId),
                rePaymentDetailId: item.rePaymentDetailId == null ? undefined : Number(item.rePaymentDetailId),
                originPaymentType: item.originPaymentType ? String(item.originPaymentType) : undefined,
                originAmount: item.originAmount == null ? undefined : Number(item.originAmount),
                availableActions: Array.isArray(item.availableActions) ? item.availableActions.map((action: any) => ({
                    actionCode: String(action.actionCode || ""),
                    label: String(action.label || ""),
                    isPrimary: Boolean(action.isPrimary),
                })) : [],
                missingTerminalDetails: Array.isArray(item.missingTerminalDetails) ? item.missingTerminalDetails.map((gap: any) => ({
                    paymentDetailId: Number(gap.paymentDetailId || 0),
                    paymentType: String(gap.paymentType || ""),
                    amount: Number(gap.amount || 0),
                    paymentSubMethodLabel: gap.paymentSubMethodLabel ? String(gap.paymentSubMethodLabel) : undefined,
                    cardCompany: gap.cardCompany ? String(gap.cardCompany) : undefined,
                    missingFieldSummary: String(gap.missingFieldSummary || ""),
                })) : [],
                operation: item.operation ?? null,
            })) : [],
        };
    },

    async updateCashReceiptResult(
        cashReceiptId: number,
        request: UpdateCashReceiptResultRequest
    ): Promise<CashReceiptResultResponse> {
        const response = await apiClient.patch(`/payments/cash-receipts/${cashReceiptId}/result`, request);
        const d = response?.data ?? {};
        return {
            cashReceipt: d.cashReceipt,
            operation: d.operation ?? null,
        };
    },

    async manualConfirmCashReceipt(
        cashReceiptId: number,
        note?: string
    ): Promise<CashReceiptResultResponse> {
        const response = await apiClient.patch(`/payments/cash-receipts/${cashReceiptId}/manual-confirm`, {
            note: note?.trim() || undefined,
        });
        const d = response?.data ?? {};
        return {
            cashReceipt: d.cashReceipt,
            operation: d.operation ?? null,
        };
    }
};

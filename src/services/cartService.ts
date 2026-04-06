import apiClient from "./apiClient";

export type MembershipPriorityMode = "existing_first" | "new_first";

export interface CartItem {
    id: number;
    patientId: number;
    branchId: string;
    itemType: 'treatment' | 'product' | 'ticket' | 'membership';
    itemId: number | string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    originalPrice: number;
    eventPrice?: number | null;
    discountPercent: number;
    totalPrice: number;
    usageCount?: number;
    lastUsedAt?: string;
    minIntervalDays?: number;
    expiryDate?: string;
    isActive?: boolean;
}

export interface CheckoutResult {
    id: number;
    patientId: number;
    branchId: string;
    amount: number;
    paidAt: string;
}

export const cartService = {
    /**
     * Get cart items for a patient
     */
    async getCart(patientId: number): Promise<CartItem[]> {
        try {
            const response = await apiClient.get(`/cart?patientId=${patientId}`);
            return response.data;
        } catch (error) {
            console.error("Failed to fetch cart:", error);
            return [];
        }
    },

    /**
     * Add item to cart
     */
    async addItem(data: {
        patientId: number;
        visitId?: number;
        ticketId?: number;
        membershipTicketId?: number;
        quantity?: number;
    }): Promise<CartItem> {
        const response = await apiClient.post("/cart", data);
        return response.data;
    },

    /**
     * Update cart item
     */
    async updateItem(patientId: number, id: number, quantity?: number, discountPercent?: number): Promise<CartItem> {
        const params = new URLSearchParams();
        params.append("patientId", patientId.toString());
        if (quantity !== undefined) params.append("quantity", quantity.toString());
        if (discountPercent !== undefined) params.append("discountPercent", discountPercent.toString());

        const response = await apiClient.patch(`/cart/${id}?${params.toString()}`, {});
        return response.data;
    },

    /**
     * Remove item from cart
     */
    async removeItem(patientId: number, id: number): Promise<void> {
        await apiClient.delete(`/cart/${id}?patientId=${patientId}`);
    },

    /**
     * Clear entire cart
     */
    async clearCart(patientId: number): Promise<void> {
        await apiClient.delete(`/cart/clear?patientId=${patientId}`);
    },

    /**
     * Checkout cart (process payment)
     */
    async checkout(
        patientId: number,
        paymentDetails?: {
            useMembership?: boolean;
            selectedMembershipId?: number;
            selectedMembershipIds?: number[];
            selectedCouponId?: string;
            membershipPriorityMode?: MembershipPriorityMode;
            membershipDiscountTargetAmount?: number;
            membershipDeductionTargetAmount?: number;
            method?: string;
            paymentCategory?: string;
            paymentSubMethod?: string;
            paymentSubMethodLabel?: string;
            paymentLines?: Array<{
                method?: string;
                paymentCategory?: string;
                paymentSubMethod?: string;
                paymentSubMethodLabel?: string;
                amount: number;
                taxFreeAmount?: number;
                memo?: string;
                assignee?: string;
                cardCompany?: string;
                installment?: string;
                approvalNumber?: string;
                terminalAuthNo?: string;
                terminalAuthDate?: string;
                terminalCardNo?: string;
                terminalIssuerName?: string;
                terminalAccepterName?: string;
                terminalTranNo?: string;
                terminalVanKey?: string;
                terminalCatId?: string;
                terminalMerchantRegNo?: string;
            }>;
            taxFreeAmount?: number;
            paidAmount?: number;
            memo?: string;
            assignee?: string;
            visitId?: number;
        }
    ): Promise<CheckoutResult> {
        const response = await apiClient.post("/cart/checkout", {
            patientId,
            visitId: paymentDetails?.visitId,
            useMembership: paymentDetails?.useMembership,
            selectedMembershipId: paymentDetails?.selectedMembershipId,
            selectedMembershipIds: paymentDetails?.selectedMembershipIds,
            selectedCouponId: paymentDetails?.selectedCouponId,
            membershipPriorityMode: paymentDetails?.membershipPriorityMode,
            membershipDiscountTargetAmount: paymentDetails?.membershipDiscountTargetAmount,
            membershipDeductionTargetAmount: paymentDetails?.membershipDeductionTargetAmount,
            method: paymentDetails?.method,
            paymentCategory: paymentDetails?.paymentCategory,
            paymentSubMethod: paymentDetails?.paymentSubMethod,
            paymentSubMethodLabel: paymentDetails?.paymentSubMethodLabel,
            paymentLines: paymentDetails?.paymentLines,
            taxFreeAmount: paymentDetails?.taxFreeAmount,
            paidAmount: paymentDetails?.paidAmount,
            memo: paymentDetails?.memo,
            assignee: paymentDetails?.assignee
        });
        return response.data;
    },

    /**
     * Get purchased tickets
     */
    async getTickets(patientId: number): Promise<any[]> {
        const response = await apiClient.get(`/tickets?patientId=${patientId}`);
        return response.data;
    },

    /**
     * Preview cart total with membership balance deductions
     */
    async preview(
        patientId: number,
        options?: {
            useMembership?: boolean;
            selectedMembershipId?: number;
            selectedMembershipIds?: number[];
            selectedCouponId?: string;
            membershipPriorityMode?: MembershipPriorityMode;
            membershipDiscountTargetAmount?: number;
            membershipDeductionTargetAmount?: number;
        }
    ): Promise<CartPreview> {
        const response = await apiClient.post("/cart/preview", {
            patientId,
            useMembership: options?.useMembership,
            selectedMembershipId: options?.selectedMembershipId,
            selectedMembershipIds: options?.selectedMembershipIds,
            selectedCouponId: options?.selectedCouponId,
            membershipPriorityMode: options?.membershipPriorityMode,
            membershipDiscountTargetAmount: options?.membershipDiscountTargetAmount,
            membershipDeductionTargetAmount: options?.membershipDeductionTargetAmount
        });
        return response.data;
    }
};

export interface CartPreview {
    membershipItems: { name: string; price: number; quantity: number }[];
    treatmentItems: { name: string; originalPrice: number; eventPrice: number; discountedPrice: number; quantity: number }[];
    currentMembershipBalance: number;
    newMembershipBalance: number;
    availableMembershipBalance?: number;
    selectedMembershipId?: number;
    selectedMembershipName?: string;
    selectedCouponId?: string;
    selectedCouponLabel?: string;
    couponDiscountPercent?: number;
    couponDiscountAmount?: number;
    membershipDiscountPercent?: number;
    membershipDiscountAmount?: number;
    totalDiscountAmount?: number;
    discountPercent: number;
    membershipPayment: number;
    treatmentTotal: number;
    discountBaseAmount?: number;
    discountAmount: number;
    discountedServiceTotal?: number;
    deductionBaseAmount?: number;
    balanceDeduction: number;
    cashForTreatments: number;
    cashRequired?: number;
    isBlendedDiscount?: boolean;
    membershipAllocations?: Array<{
        membershipId?: number | null;
        name: string;
        discountPercent: number;
        discountBaseAmount: number;
        discountAmount: number;
        deductedAmount: number;
        isNewPurchase: boolean;
    }>;
    totalCashRequired: number;
}

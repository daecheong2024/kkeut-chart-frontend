import apiClient from "./apiClient";

interface CustomerTicketItem {
    id: number;
    name: string;
    type: string;
    totalAmount: number;
    totalUsed: number;
    balance: number;
    cashBalance: number;
    pointBalance: number;
    maximumUseCount?: number | null;
    usedCount: number;
    remainingCount: number;
    discountPercent: number;
    expiryDate?: string | null;
    purchaseDate?: string | null;
}

interface CustomerTicketResponse {
    tickets: CustomerTicketItem[];
    totalBalance: number;
}

function mapToPatientMembership(item: CustomerTicketItem, customerId: number): PatientMembership {
    return {
        id: item.id,
        customerId,
        membershipId: String(item.id),
        membershipName: item.name,
        purchaseDate: item.purchaseDate ?? "",
        expiryDate: item.expiryDate ?? "",
        status: ((item.cashBalance ?? item.balance) + (item.pointBalance ?? 0)) > 0 ? "active" : "expired",
        amount: item.totalAmount,
        bonusPoints: 0,
        remainingBalance: item.balance,
        cashBalance: item.cashBalance ?? item.balance,
        pointBalance: item.pointBalance ?? 0,
        discountPercent: item.discountPercent,
        usedCount: item.usedCount,
    };
}

function mapToMembershipBalance(item: CustomerTicketItem): MembershipBalance {
    return {
        id: item.id,
        name: item.name,
        balance: item.balance,
        cashBalance: item.cashBalance ?? item.balance,
        pointBalance: item.pointBalance ?? 0,
        discountPercent: item.discountPercent,
        expiryDate: item.expiryDate ?? "",
        totalAmount: item.totalAmount,
        totalUsed: item.totalUsed,
    };
}

export const membershipService = {
    async getMemberships(customerId: number): Promise<PatientMembership[]> {
        try {
            const response = await apiClient.get<CustomerTicketResponse>(`/customers/${customerId}/tickets`, {
                params: { type: "membership" }
            });
            return (response.data?.tickets || []).map(t => mapToPatientMembership(t, customerId));
        } catch (error) {
            console.error("Failed to fetch memberships:", error);
            return [];
        }
    },

    async getActiveMembership(customerId: number): Promise<PatientMembership | null> {
        try {
            const memberships = await this.getMemberships(customerId);
            return memberships.find(m => m.status === "active") ?? null;
        } catch (error) {
            return null;
        }
    },

    async purchaseMembership(data: {
        customerId: number;
        membershipId: string;
        membershipName: string;
        amount: number;
        bonusPoints: number;
        discountPercent: number;
    }): Promise<PatientMembership> {
        const response = await apiClient.post("/memberships/purchase", data);
        return response.data;
    },

    async upgradeMembership(data: {
        customerId: number;
        newMembershipId: string;
        newMembershipName: string;
        newAmount: number;
        newBonusPoints: number;
        newDiscountPercent: number;
    }): Promise<{ membership: PatientMembership; upgradePrice: number }> {
        const response = await apiClient.post("/memberships/upgrade", data);
        return response.data;
    },

    async getRemainingValue(membershipId: number): Promise<number> {
        const response = await apiClient.get(`/memberships/${membershipId}/remaining-value`);
        return response.data.remainingValue;
    },

    async getMembershipBalances(customerId: number): Promise<{
        memberships: MembershipBalance[];
        totalBalance: number;
    }> {
        try {
            const response = await apiClient.get<CustomerTicketResponse>(`/customers/${customerId}/tickets`, {
                params: { type: "membership" }
            });
            const data = response.data;
            return {
                memberships: (data?.tickets || []).map(mapToMembershipBalance),
                totalBalance: data?.totalBalance ?? 0,
            };
        } catch (error) {
            console.error("Failed to fetch membership balances:", error);
            return { memberships: [], totalBalance: 0 };
        }
    },

    async getHistory(membershipId: number, customerId?: number): Promise<MembershipHistory[]> {
        const params = customerId ? { customerId } : {};
        const response = await apiClient.get(`/memberships/${membershipId}/history`, { params });
        return response.data;
    },

    async deleteMembership(membershipId: number): Promise<void> {
        await apiClient.delete(`/memberships/${membershipId}`);
    },

    async refundMembership(membershipId: number, policy: MembershipRefundPolicy): Promise<MembershipRefundResult> {
        const response = await apiClient.post(`/memberships/${membershipId}/refund`, policy);
        return response.data;
    },

    async cancelHistory(historyId: number): Promise<void> {
        await apiClient.post(`/memberships/history/${historyId}/cancel`, {});
    }
};

export interface PatientMembership {
    id: number;
    customerId: number;
    membershipId: string;
    membershipName: string;
    purchaseDate: string;
    expiryDate: string;
    status: 'active' | 'expired' | 'upgraded' | 'suspended' | 'refunded' | 'cancelled';
    amount: number;
    bonusPoints: number;
    remainingBalance: number;
    cashBalance: number;
    pointBalance: number;
    discountPercent: number;
    usedCount: number;
    upgradedFrom?: number;
}

export interface UpgradePreview {
    currentMembership: PatientMembership;
    newMembershipName: string;
    newAmount: number;
    remainingValue: number;
    upgradePrice: number;
    newBonusPoints: number;
    newDiscountPercent: number;
}

export interface MembershipBalance {
    id: number;
    name: string;
    balance: number;
    cashBalance: number;
    pointBalance: number;
    discountPercent: number;
    expiryDate: string;
    totalAmount: number;
    totalUsed: number;
}

export interface MembershipHistory {
    id: number;
    membershipId: number;
    usedAmount: number;
    usedCashAmount: number;
    usedPointAmount: number;
    remainingBalance: number;
    remainingCashBalance: number;
    remainingPointBalance: number;
    description: string;
    historyType: string;
    ticketName?: string;
    usedAt: string;
    isCancelled: boolean;
}

export interface MembershipRefundPolicy {
    requestedRefundAmount?: number;
    bonusRefundPolicy?: "exclude" | "include" | "proportional";
    bonusRefundRate?: number;
    penaltyType?: "none" | "fixed" | "rate";
    penaltyValue?: number;
    reason?: string;
}

export interface MembershipRefundResult {
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

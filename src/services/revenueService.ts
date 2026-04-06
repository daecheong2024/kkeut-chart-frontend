import apiClient from "./apiClient";
import type { RevenueDashboard, RevenueQuery } from "../types/revenue";

export interface ReceivablesResponse {
  receivable: { patientCount: number; itemCount: number; totalAmount: number };
  refundCompleted: { patientCount: number; itemCount: number; totalAmount: number };
  receivablePatients: ReceivablePatientItem[];
  refundCompletedPatients: RefundPatientItem[];
}

export interface ReceivableTicketDetail {
  ticketId: number;
  ticketName: string;
  unitPrice: number;
  quantity: number;
  subTotal: number;
}

export interface ReceivablePatientItem {
  customerId: number;
  customerName: string;
  telNo: string;
  addedDate: string;
  receivableAmount: number;
  tickets: ReceivableTicketDetail[];
}

export interface RefundDetailItem {
  paymentType: string;
  authNo: string;
  refundAmount: number;
  refundSupplyAmount: number;
  refundVatAmount: number;
  refundNonTaxAmount: number;
  refundDate: string;
}

export interface RefundPatientItem {
  customerId: number;
  customerName: string;
  telNo: string;
  refundDate: string;
  refundAmount: number;
  details: RefundDetailItem[];
}

export const revenueService = {
  async getDashboard(q: RevenueQuery): Promise<RevenueDashboard> {
    const { period, anchorDateISO } = q;
    const response = await apiClient.get<RevenueDashboard>("/revenue/dashboard", {
      params: { period, anchorDate: anchorDateISO },
    });
    return response.data;
  },

  async getReceivables(q: RevenueQuery): Promise<ReceivablesResponse> {
    const { period, anchorDateISO } = q;
    const response = await apiClient.get<ReceivablesResponse>("/revenue/receivables", {
      params: { period, anchorDate: anchorDateISO },
    });
    return response.data;
  },
};

import apiClient from "./apiClient";

const formatLocalDateTime = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
};

export interface KioskPatient {
  id: number;
  name: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
  age?: number | null;
  lastVisitDate?: string;
}

export interface KioskCategory {
  id: string;
  name: string;
  interval: number;
  days?: string[];
  operatingHours?: Record<string, string>;
  breakHours?: Record<string, string>;
  startDate?: string;
  endDate?: string;
  useEndDate?: boolean;
}

export interface KioskTicket {
  ticketHistId: number;
  ticketId: number;
  ticketName: string;
  itemCode?: string;
  remainingCount: number;
  totalCount: number;
  usageCount: number;
  expiryDate?: string;
  minIntervalDays?: number;
  lastUsedDate?: string;
  nextAvailableDate?: string;
  visitPurposeId?: string;
  visitPurposeLabel?: string;
  allowedDays?: number[];
  allowedTimeRange?: {
    start?: string;
    end?: string;
  };
  categories: KioskCategory[];
}

export interface KioskTicketsResponse {
  patient: KioskPatient;
  tickets: KioskTicket[];
  hospitalOperatingHours?: Record<string, string>;
}

export const kioskService = {
  async verifyPatient(payload: {
    branchId: string;
    name?: string;
    phone?: string;
    birthDate?: string;
  }): Promise<{ patients: KioskPatient[] }> {
    const response = await apiClient.post("/kiosk/patients/verify", payload);
    return response.data;
  },

  async getPatientTickets(customerId: number, branchId: string): Promise<KioskTicketsResponse> {
    const response = await apiClient.get(`/kiosk/patients/${customerId}/tickets`, {
      params: { branchId },
    });
    return response.data;
  },

  async getAvailableSlots(payload: {
    branchId: string;
    customerId: number;
    ticketId?: number;
    ticketIds?: number[];
    categoryId: string;
    date: string;
  }): Promise<{
    date: string;
    category: { id: string; name: string };
    visitPurposeId?: string;
    visitPurposeLabel?: string;
    availableTimes: string[];
  }> {
    const response = await apiClient.post("/kiosk/slots", payload);
    return response.data;
  },

  async createReservation(payload: {
    branchId: string;
    customerId: number;
    ticketId?: number;
    ticketIds?: number[];
    categoryId: string;
    scheduledAt: string | Date;
    memo?: string;
  }) {
    const response = await apiClient.post("/kiosk/reservations", {
      ...payload,
      scheduledAt: formatLocalDateTime(payload.scheduledAt),
    });
    return response.data;
  },
};

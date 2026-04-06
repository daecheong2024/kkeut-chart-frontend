import apiClient from "./apiClient";
import type { AppointmentItem } from "../types/appointments";

export const scheduleService = {
  async listByDate(dateISO: string): Promise<AppointmentItem[]> {
    try {
      const response = await apiClient.get(`/receptions`, {
        params: { StartDate: dateISO, EndDate: dateISO }
      });

      const items = Array.isArray(response.data) ? response.data : response.data?.items ?? [];

      return items.map(
        (apt: any): AppointmentItem => ({
          id: String(apt.id ?? apt.chartId),
          patient: {
            id: String(apt.customerId ?? apt.patientId ?? ""),
            name: apt.customerName ?? apt.name ?? apt.patientName ?? "Unknown",
            sex: apt.gender === "F" ? "F" : "M",
            age: apt.age,
            phoneMasked: apt.phone ?? apt.telNo,
          },
          status: (apt.statusName ?? apt.status ?? "wait") as AppointmentItem["status"],
          branchId: String(apt.branchId ?? ""),
          startAt: apt.scheduledAt ?? apt.startAt ?? apt.createTime ?? new Date().toISOString(),
          createdAt: apt.createTime ?? apt.createdAt ?? new Date().toISOString(),
          labels: apt.labels || [],
          note: apt.memo,
          checkedInAt: apt.checkInAt ?? apt.checkedInAt,
          completedAt: apt.completedAt,
        })
      );
    } catch (error) {
      console.error("Failed to fetch appointments:", error);
      return [];
    }
  },

  async updateStatus(id: string, status: string): Promise<void> {
    try {
      await apiClient.put(`/receptions/${id}`, { statusName: status });
    } catch (error) {
      console.error("Failed to update appointment status:", error);
      throw new Error("Failed to update appointment status.");
    }
  },
};

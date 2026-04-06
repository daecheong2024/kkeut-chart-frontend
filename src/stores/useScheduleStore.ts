import { create } from "zustand";
import type { AppointmentItem } from "../types/appointments";
import { scheduleService } from "../services/scheduleService";

type ScheduleState = {
  loading: boolean;
  error?: string;

  dateISO: string; // yyyy-mm-dd
  items: AppointmentItem[];

  setDateISO: (iso: string) => void;
  refresh: () => Promise<void>;
  moveStatus: (id: string, status: AppointmentItem["status"]) => void;
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  loading: false,
  dateISO: todayISO(),
  items: [],

  setDateISO: (iso) => set({ dateISO: iso }),

  refresh: async () => {
    set({ loading: true, error: undefined });
    try {
      const data = await scheduleService.listByDate(get().dateISO);
      set({ items: data, loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "불러오기에 실패했습니다.";
      set({ error: msg, loading: false });
    }
  },

  moveStatus: async (id, status) => {
    // Optimistically update UI
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, status } : it))
    }));

    // Call backend API
    try {
      await scheduleService.updateStatus(id, status);
    } catch (error) {
      // Revert on error
      await get().refresh();
      throw error;
    }
  }
}));

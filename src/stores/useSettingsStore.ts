import { create } from "zustand";
import type { ChartSettings } from "../types/settings";
import { DEFAULT_SETTINGS } from "../config/defaultSettings";
import { normalizeBranchName } from "../utils/branchName";
import { getSettingsRaw, setSettingsRaw } from "../lib/storage";

type SettingsState = {
  settings: ChartSettings;
  setActiveBranch: (branchId: string) => void;
  updateSettings: (patch: Partial<ChartSettings>) => void;
  resetSettings: () => void;
  setBranches: (branches: { id: string; name: string }[]) => void;
};

function mergeWithDefaults(v: Partial<ChartSettings> | null): ChartSettings {
  if (!v) return DEFAULT_SETTINGS;

  const normalizedBranches = (Array.isArray((v as any).branches) ? (v as any).branches : (DEFAULT_SETTINGS.branches || [])).map((branch: any) => {
    const id = String(branch?.id ?? "").trim();
    return {
      id,
      name: normalizeBranchName(branch?.name, id),
    };
  });

  return {
    ...DEFAULT_SETTINGS,
    ...v,
    branches: normalizedBranches,

    // nested objects (ensure new keys always exist)
    hospital: { ...DEFAULT_SETTINGS.hospital, ...(v as any).hospital },
    chartConfig: { ...DEFAULT_SETTINGS.chartConfig, ...(v as any).chartConfig },
    members: { ...DEFAULT_SETTINGS.members, ...(v as any).members },
    tickets: { ...DEFAULT_SETTINGS.tickets, ...(v as any).tickets },
    phrases: { ...DEFAULT_SETTINGS.phrases, ...(v as any).phrases },
    forms: { ...DEFAULT_SETTINGS.forms, ...(v as any).forms },
    integrationsConfig: { ...DEFAULT_SETTINGS.integrationsConfig, ...(v as any).integrationsConfig },
  };
}

function load(): ChartSettings | null {
  const data = getSettingsRaw<ChartSettings>();
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return data;
}

function save(v: ChartSettings) {
  try {
    setSettingsRaw(v);
  } catch {
    // localStorage 용량 초과 시에도 인메모리 상태는 유지
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = typeof window !== "undefined" ? (load() as Partial<ChartSettings> | null) : null;

  return {
    settings: mergeWithDefaults(initial),

    setActiveBranch: (branchId) => {
      const next = { ...get().settings, activeBranchId: branchId };
      save(next);
      set({ settings: next });
    },

    updateSettings: (patch) => {
      const next = mergeWithDefaults({ ...get().settings, ...patch });
      save(next);
      set({ settings: next });
    },

    resetSettings: () => {
      save(DEFAULT_SETTINGS);
      set({ settings: DEFAULT_SETTINGS });
    },

    setBranches: (branches: { id: string; name: string }[]) => {
      const normalizedBranches = (Array.isArray(branches) ? branches : []).map((branch) => {
        const id = String(branch?.id ?? "").trim();
        return {
          id,
          name: normalizeBranchName(branch?.name, id),
        };
      });
      const next = { ...get().settings, branches: normalizedBranches };
      save(next);
      set({ settings: next });
    }
  };
});

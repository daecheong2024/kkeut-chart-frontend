import { useAuthStore } from "../stores/useAuthStore";
import { useSettingsStore } from "../stores/useSettingsStore";

export function resolveActiveBranchId(fallback = ""): string {
  const settings = useSettingsStore.getState().settings;
  const fromSettings = String(settings.activeBranchId || "").trim();
  if (fromSettings) return fromSettings;

  const fromAuth = String(useAuthStore.getState().branchId || "").trim();
  if (fromAuth) return fromAuth;

  const firstBranch = settings.branches?.[0]?.id;
  if (firstBranch) return String(firstBranch).trim();

  return fallback;
}


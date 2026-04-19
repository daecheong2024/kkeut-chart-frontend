import { create } from "zustand";
import { memberConfigService } from "../services/memberConfigService";
import { ALL_PERMISSION_KEYS } from "../config/permissionConfig";

type PermissionState = {
  permissions: Record<string, boolean>;
  loaded: boolean;
  loading: boolean;
  loadPermissions: (branchId: string, userEmail: string) => Promise<void>;
  hasPermission: (key: string) => boolean;
  clearPermissions: () => void;
};

const ADMIN_EMAIL = "admin@admin.com";

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: {},
  loaded: false,
  loading: false,

  loadPermissions: async (branchId: string, userEmail: string) => {
    if (!branchId || !userEmail) return;
    if (get().loading) return;

    const email = userEmail.trim().toLowerCase();
    if (email === ADMIN_EMAIL) {
      const allPermissions: Record<string, boolean> = {};
      ALL_PERMISSION_KEYS.forEach((k: string) => { allPermissions[k] = true; });
      set({ permissions: allPermissions, loaded: true, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const [members, profiles] = await Promise.all([
        memberConfigService.getMembers(Number(branchId)),
        memberConfigService.getMemberConfig(),
      ]);

      const user = members.find((u) => (u.email || "").trim().toLowerCase() === email);
      if (!user) {
        set({ permissions: {}, loaded: true, loading: false });
        return;
      }

      const profile = profiles.find((p) => p.id === user.permissionProfileId);
      set({
        permissions: profile?.permissions ?? {},
        loaded: true,
        loading: false,
      });
    } catch {
      set({ permissions: {}, loaded: true, loading: false });
    }
  },

  hasPermission: (key: string) => {
    const { permissions, loaded } = get();
    if (!loaded) return false;
    return !!permissions[key];
  },

  clearPermissions: () => {
    set({ permissions: {}, loaded: false, loading: false });
  },
}));

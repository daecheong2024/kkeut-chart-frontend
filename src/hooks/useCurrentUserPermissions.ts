import { useEffect } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { usePermissionStore } from "../stores/usePermissionStore";

export function useCurrentUserPermissions(branchId: string) {
  const userEmail = useAuthStore((s) => s.userEmail);
  const permissions = usePermissionStore((s) => s.permissions);
  const loaded = usePermissionStore((s) => s.loaded);
  const loadPermissions = usePermissionStore((s) => s.loadPermissions);

  useEffect(() => {
    if (!branchId || !userEmail) return;
    if (!loaded) {
      loadPermissions(branchId, userEmail);
    }
  }, [branchId, userEmail, loaded, loadPermissions]);

  return { permissions, loaded };
}

import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Lock, Loader2 } from "lucide-react";
import { useAuthStore } from "../stores/useAuthStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useCurrentUserPermissions } from "../hooks/useCurrentUserPermissions";

interface RequirePermissionProps {
    permission: string | string[];
    mode?: "all" | "any";
    children: React.ReactNode;
}

export function RequirePermission({ permission, mode = "any", children }: RequirePermissionProps) {
    const location = useLocation();
    const isAuthed = useAuthStore((s) => s.isAuthed);
    const { settings } = useSettingsStore();
    const { permissions, loaded } = useCurrentUserPermissions(settings.activeBranchId);

    if (!isAuthed) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    if (!loaded) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="flex items-center gap-2 text-[#8B5A66] text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>권한 정보를 확인하는 중...</span>
                </div>
            </div>
        );
    }

    const keys = Array.isArray(permission) ? permission : [permission];
    const granted = mode === "all"
        ? keys.every((k) => !!permissions[k])
        : keys.some((k) => !!permissions[k]);

    if (!granted) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="text-center max-w-md px-6 py-10 rounded-2xl border border-[#F8DCE2] bg-white shadow-sm">
                    <Lock className="w-10 h-10 mx-auto mb-3 text-[#D27A8C]" />
                    <div className="text-[15px] font-extrabold text-[#5C2A35] mb-1">접근 권한이 없습니다</div>
                    <div className="text-[12px] text-[#8B5A66] leading-relaxed">
                        이 페이지에 접근하려면 관리자에게 권한을 요청해 주세요.
                    </div>
                    <div className="mt-3 text-[11px] text-[#C9A0A8] font-mono">
                        필요 권한: {keys.join(mode === "all" ? " & " : " | ")}
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}

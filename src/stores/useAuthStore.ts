import { create } from "zustand";
import apiClient from "../services/apiClient";
import { getAuthData, setAuthData, clearAuthData } from "../lib/storage";

type AuthState = {
  isAuthed: boolean;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  branchId?: string;
  token?: string;
  refreshToken?: string;
  login: (email: string, password: string, branchId: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: { userEmail?: string; userName?: string; branchId?: string }) => void;
};

export const useAuthStore = create<AuthState>((set, get) => {
  const initial = typeof window !== "undefined" ? getAuthData() : null;

  return {
    isAuthed: !!initial,
    userEmail: initial?.userEmail,
    userName: initial?.userName,
    userRole: initial?.userRole,
    branchId: initial?.branchId,
    token: initial?.token,
    refreshToken: initial?.refreshToken,

    login: async (email: string, password: string, branchId: string) => {
      try {
        const response = await apiClient.post("/auth/login", {
          email,
          password,
          branchId: Number(branchId)
        });

        const { accessToken, refreshToken, role, branchId: userBranchId, name } = response.data;

        const { setActiveBranch } = (await import("./useSettingsStore")).useSettingsStore.getState();
        setActiveBranch(branchId || String(userBranchId));

        const authData = {
          userEmail: email,
          userName: name || email,
          userRole: role,
          branchId: branchId || String(userBranchId),
          token: accessToken,
          refreshToken: refreshToken,
        };

        setAuthData(authData);
        set({
          isAuthed: true,
          userEmail: email,
          userName: name || email,
          userRole: role,
          branchId: branchId || String(userBranchId),
          token: accessToken,
          refreshToken: refreshToken,
        });
      } catch (error: any) {
        console.error("Login failed:", error);
        const errorCode = Number(error?.response?.data?.errorCode || 0);
        const statusCode = Number(error?.response?.status || 0);

        let message = String(error?.response?.data?.message || "").trim();
        if (errorCode === 2001) {
          message = "등록되지 않은 아이디(이메일)입니다.";
        } else if (errorCode === 2002) {
          message = "비밀번호가 올바르지 않습니다.";
        } else if (statusCode === 403) {
          message = message || "관리자 승인 대기 중입니다. 승인 후 로그인해 주세요.";
        } else if (statusCode === 401) {
          message = message || "아이디 또는 비밀번호가 올바르지 않습니다.";
        } else if (!message) {
          message = "로그인에 실패했습니다.";
        }

        const loginError = new Error(message) as Error & { errorCode?: number; statusCode?: number };
        loginError.errorCode = Number.isFinite(errorCode) && errorCode > 0 ? errorCode : undefined;
        loginError.statusCode = Number.isFinite(statusCode) && statusCode > 0 ? statusCode : undefined;
        throw loginError;
      }
    },

    logout: async () => {
      const { refreshToken } = get();
      try {
        if (refreshToken) {
          await apiClient.post("/auth/logout", { refreshToken });
        }
      } catch (e) {
        console.error("Logout API failed:", e);
      } finally {
        clearAuthData();
        set({
          isAuthed: false,
          userEmail: undefined,
          userName: undefined,
          userRole: undefined,
          branchId: undefined,
          token: undefined,
          refreshToken: undefined,
        });
      }
    },

    updateProfile: (patch) => {
      set((state) => {
        const next = {
          ...state,
          userEmail: patch.userEmail ?? state.userEmail,
          userName: patch.userName ?? state.userName,
          branchId: patch.branchId ?? state.branchId,
        };

        if (next.isAuthed && next.token) {
          setAuthData({
            userEmail: next.userEmail || "",
            userName: next.userName || next.userEmail || "",
            userRole: next.userRole || "",
            branchId: next.branchId || "",
            token: next.token,
            refreshToken: next.refreshToken || "",
          });
        }

        return next;
      });
    }
  };
});

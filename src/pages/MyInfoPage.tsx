import React, { useEffect, useMemo, useState } from "react";
import { TopBar } from "../components/layout/TopBar";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuthStore } from "../stores/useAuthStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { userProfileService } from "../services/userProfileService";

type ProfileState = {
  id: string;
  name: string;
  email: string;
  branchId: string;
};

function fromAuth(userName?: string, userEmail?: string, branchId?: string): ProfileState {
  return {
    id: "",
    name: userName || "",
    email: userEmail || "",
    branchId: branchId || ""
  };
}

function isEmailLike(value?: string): boolean {
  const normalized = (value || "").trim();
  return normalized.includes("@");
}

export default function MyInfoPage() {
  const userName = useAuthStore((s) => s.userName);
  const userEmail = useAuthStore((s) => s.userEmail);
  const branchId = useAuthStore((s) => s.branchId);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const settings = useSettingsStore((s) => s.settings);

  const resolveDisplayName = (rawName?: string, rawEmail?: string) => {
    const normalizedName = (rawName || "").trim();
    const normalizedEmail = (rawEmail || "").trim().toLowerCase();
    if (normalizedName && !isEmailLike(normalizedName)) return normalizedName;
    const matchedMember = (settings.members?.users || []).find(
      (member) => String(member?.email || "").trim().toLowerCase() === normalizedEmail
    );
    if (matchedMember?.name) return String(matchedMember.name).trim();
    return normalizedName || (rawEmail || "").trim() || "";
  };

  const [loading, setLoading] = useState(true);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [profile, setProfile] = useState<ProfileState>(() => fromAuth(userName, userEmail, branchId));
  const [nameDraft, setNameDraft] = useState(() => resolveDisplayName(userName, userEmail));

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBasicEditorOpen, setIsBasicEditorOpen] = useState(false);
  const [isPasswordEditorOpen, setIsPasswordEditorOpen] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasNameChanges = useMemo(
    () => nameDraft.trim() !== (profile.name || "").trim(),
    [nameDraft, profile.name]
  );

  const branchLabel = useMemo(() => {
    const normalizedBranchId = String(profile.branchId || "").trim();
    if (!normalizedBranchId) return "-";
    const matched = (settings.branches || []).find((branch) => String(branch.id) === normalizedBranchId);
    return matched?.name || normalizedBranchId;
  }, [profile.branchId, settings.branches]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const me = await userProfileService.getMyProfile();
        if (cancelled) return;
        const normalizedName = resolveDisplayName(me.name, me.email);
        setProfile({ ...me, name: normalizedName });
        setNameDraft(normalizedName);
        updateProfile({
          userName: normalizedName,
          userEmail: me.email,
          branchId: me.branchId
        });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.response?.data?.message || "내 정보 조회에 실패했습니다. 현재 로그인 정보로 표시합니다.");
        const fallback = fromAuth(userName, userEmail, branchId);
        const normalizedName = resolveDisplayName(fallback.name, fallback.email);
        setProfile({ ...fallback, name: normalizedName });
        setNameDraft(normalizedName);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [branchId, updateProfile, userEmail, userName]);

  const handleSaveBasic = async () => {
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setError("이름을 입력해 주세요.");
      return false;
    }
    if (trimmedName.length > 20) {
      setError("이름은 20자 이내로 입력해 주세요.");
      return false;
    }

    try {
      setError(null);
      setMessage(null);
      setSavingBasic(true);
      const updated = await userProfileService.updateMyProfile({ name: trimmedName });
      const normalizedName = resolveDisplayName(updated.name, updated.email);
      setProfile({ ...updated, name: normalizedName });
      setNameDraft(normalizedName);
      updateProfile({
        userName: normalizedName,
        userEmail: updated.email,
        branchId: updated.branchId
      });
      setMessage("내 정보가 저장되었습니다.");
      return true;
    } catch (e: any) {
      setError(e?.response?.data?.message || "내 정보 저장 중 오류가 발생했습니다.");
      return false;
    } finally {
      setSavingBasic(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      setError("현재 비밀번호를 입력해 주세요.");
      return false;
    }
    if (!newPassword) {
      setError("새 비밀번호를 입력해 주세요.");
      return false;
    }
    if (newPassword.length < 8) {
      setError("새 비밀번호는 8자 이상이어야 합니다.");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return false;
    }

    try {
      setError(null);
      setMessage(null);
      setSavingPassword(true);
      await userProfileService.changeMyPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("비밀번호가 변경되었습니다.");
      return true;
    } catch (e: any) {
      setError(e?.response?.data?.message || "비밀번호 변경 중 오류가 발생했습니다.");
      return false;
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="내정보 관리" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <section className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-sm">
            <div className="text-lg font-extrabold">기본 정보</div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
                <div className="text-xs font-bold text-slate-500">이름</div>
                <div className="mt-1 text-base font-bold text-slate-900">{profile.name || "-"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold text-slate-500">이메일</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{profile.email || "-"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold text-slate-500">지점</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{branchLabel}</div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  setNameDraft(profile.name || "");
                  setIsBasicEditorOpen(true);
                }}
                disabled={loading}
              >
                기본정보 수정
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-sm">
            <div className="text-lg font-extrabold">비밀번호 변경</div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              보안을 위해 비밀번호는 화면에 표시되지 않습니다.
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setIsPasswordEditorOpen(true);
                }}
              >
                비밀번호 변경
              </Button>
            </div>
          </section>
        </div>
      </div>

      {isBasicEditorOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-xl font-extrabold text-slate-900">기본정보 수정</div>
              <div className="mt-1 text-sm text-slate-500">이름 변경 후 저장하면 상단 사용자명에도 즉시 반영됩니다.</div>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">이름</label>
                <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="이름" disabled={loading} />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-bold text-slate-500">이메일</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{profile.email || "-"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-bold text-slate-500">지점</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{branchLabel}</div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
              <Button variant="outline" onClick={() => setIsBasicEditorOpen(false)} disabled={savingBasic}>
                취소
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const ok = await handleSaveBasic();
                  if (ok) setIsBasicEditorOpen(false);
                }}
                disabled={loading || savingBasic || !hasNameChanges}
              >
                {savingBasic ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isPasswordEditorOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-xl font-extrabold text-slate-900">비밀번호 변경</div>
              <div className="mt-1 text-sm text-slate-500">현재 비밀번호 확인 후 새 비밀번호로 변경됩니다.</div>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">현재 비밀번호</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">새 비밀번호</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">새 비밀번호 확인</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
              <Button variant="outline" onClick={() => setIsPasswordEditorOpen(false)} disabled={savingPassword}>
                취소
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const ok = await handleChangePassword();
                  if (ok) setIsPasswordEditorOpen(false);
                }}
                disabled={savingPassword}
              >
                {savingPassword ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

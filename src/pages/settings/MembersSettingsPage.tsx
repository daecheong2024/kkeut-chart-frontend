import React, { useMemo, useState, useEffect } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { memberConfigService, Department as DeptDto, JobTitle as JobDto } from "../../services/memberConfigService";
import type { MemberUser, MembersSettings, PermissionProfile, Department, JobTitle } from "../../types/settings";
import { ArrowDown, ArrowUp, Download, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { PERMISSION_CONFIG } from "../../config/permissionConfig";
import { resolveActiveBranchId } from "../../utils/branch";
import { useAuthStore } from "../../stores/useAuthStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";

type TabKey = "accounts" | "org" | "permissions";
type OrgEditorKind = "department" | "jobTitle";
type OrgEditorState = {
  kind: OrgEditorKind;
  mode: "create" | "edit";
  id?: string;
  name: string;
};
type MemberEditorState = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  email: string;
  departmentId: string;
  jobTitleId: string;
  permissionProfileId: string;
  autoLogoutHours: number;
};
type PermissionEditorState = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  branchScope: PermissionProfile["branchScope"];
};

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const toCsvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
type MemberSelectOption = { value: string; label: string };

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-4 py-2 text-sm font-bold " +
        (active ? "bg-[rgba(var(--kkeut-primary),.10)] text-[rgb(var(--kkeut-primary))]" : "text-gray-500 hover:bg-gray-50")
      }
    >
      {children}
    </button>
  );
}

function Section({ title, desc, children, className }: { title: string; desc?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-sm", className)}>
      <div className="text-lg font-extrabold">{title}</div>
      {desc && <div className="mt-2 text-sm text-gray-600">{desc}</div>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function sortByOrder<T extends { order: number }>(arr: T[]): T[] {
  return arr.slice().sort((a, b) => a.order - b.order);
}

function moveOrderItem<T extends { id: string; order: number }>(items: T[], id: string, dir: "up" | "down"): T[] {
  const sorted = sortByOrder(items);
  const idx = sorted.findIndex((item) => item.id === id);
  if (idx < 0) return items;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return items;
  const next = sorted.map((item) => ({ ...item }));
  const current = next[idx];
  const swap = next[swapIdx];
  if (!current || !swap) return items;
  const currentOrder = current.order;
  current.order = swap.order;
  swap.order = currentOrder;
  return next;
}

function emptyPermissionProfile(): PermissionProfile {
  return {
    id: uid("perm"),
    name: "새 권한",
    branchScope: "own",
    permissions: {},
  };
}

const defaultSettings: MembersSettings = {
  users: [],
  invitedAccounts: [],
  departments: [],
  jobTitles: [],
  permissionProfiles: [],
  tempAssignees: [],
};

// Types bridging
// Frontend Page uses "Department" from types/settings which has {id:string, name:string, order:number}
// Backend Service returns "Department" with {id:number, name:string, displayOrder:number}
// We need to map them.

export default function MembersSettingsPage() {
  const resolvedBranchId = resolveActiveBranchId("");
  const { settings } = useSettingsStore();
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);
  if (permLoaded && !permissions["settings.members"]) return <NoPermissionOverlay />;
  const userEmail = useAuthStore((s) => s.userEmail);
  const [draft, setDraft] = useState<MembersSettings>(defaultSettings);
  const [original, setOriginal] = useState<MembersSettings>(defaultSettings);
  const [tab, setTab] = useState<TabKey>("accounts");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessChangingId, setAccessChangingId] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<MemberUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [orgEditor, setOrgEditor] = useState<OrgEditorState | null>(null);
  const [orgEditorError, setOrgEditorError] = useState("");
  const [memberEditor, setMemberEditor] = useState<MemberEditorState | null>(null);
  const [memberEditorError, setMemberEditorError] = useState("");
  const [permissionEditor, setPermissionEditor] = useState<PermissionEditorState | null>(null);
  const [permissionEditorError, setPermissionEditorError] = useState("");

  // Load data
  useEffect(() => {
    const loadAll = async () => {
      try {
        setLoading(true);
        const branchId = Number(resolvedBranchId);
        if (!Number.isFinite(branchId) || branchId <= 0) {
          setDraft(defaultSettings);
          setOriginal(defaultSettings);
          return;
        }
        const [members, perms, depts, jobs] = await Promise.all([
          memberConfigService.getMembers(branchId),
          memberConfigService.getMemberConfig(),
          memberConfigService.getDepartments(),
          memberConfigService.getJobTitles(),
        ]);

        const loaded: MembersSettings = {
          users: members,
          invitedAccounts: [],
          // Map backend entities to frontend types
          departments: depts.map(d => ({ id: String(d.id), name: d.name, order: d.displayOrder })),
          jobTitles: jobs.map(j => ({ id: String(j.id), name: j.name, order: j.displayOrder })),
          permissionProfiles: perms,
          tempAssignees: [],
        };

        setDraft(loaded);
        setOriginal(loaded);
      } catch (e) {
        console.error("Failed to load member settings", e);
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [resolvedBranchId]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(original), [draft, original]);
  const canManageMemberPasswords = (userEmail || "").trim().toLowerCase() === "jihongryu1991@gmail.com";

  const save = async () => {
    try {
      setSaving(true);

      // 1. Save Permission Profiles (All at once)
      if (JSON.stringify(draft.permissionProfiles) !== JSON.stringify(original.permissionProfiles)) {
        await memberConfigService.updateMemberConfig(draft.permissionProfiles);
      }

      // 2. Save Departments (Create/Update/Delete)
      // Comparison based on IDs
      const orgDeptIds = new Set(original.departments.map(d => d.id));
      const draftDeptIds = new Set(draft.departments.map(d => d.id));

      // 2-1. Delete removed departments
      const deletedDepts = original.departments.filter(d => !draftDeptIds.has(d.id));
      await Promise.all(deletedDepts.map(d => memberConfigService.deleteDepartment(Number(d.id))));

      // 2-2. Create or Update departments
      // Note: We use the array index as the displayOrder
      await Promise.all(sortByOrder(draft.departments).map(async (d, index) => {
        const isNew = !orgDeptIds.has(d.id) || isNaN(Number(d.id));

        if (isNew) {
          await memberConfigService.createDepartment({ name: d.name, displayOrder: index });
        } else {
          // Check if changed
          const org = original.departments.find(od => od.id === d.id);
          if (!org || org.name !== d.name || org.order !== index) {
            await memberConfigService.updateDepartment(Number(d.id), { name: d.name, displayOrder: index });
          }
        }
      }));

      // 3. Save Job Titles (Create/Update/Delete)
      const orgJobIds = new Set(original.jobTitles.map(j => j.id));
      const draftJobIds = new Set(draft.jobTitles.map(j => j.id));

      // 3-1. Delete removed job titles
      const deletedJobs = original.jobTitles.filter(j => !draftJobIds.has(j.id));
      await Promise.all(deletedJobs.map(j => memberConfigService.deleteJobTitle(Number(j.id))));

      // 3-2. Create or Update job titles
      await Promise.all(sortByOrder(draft.jobTitles).map(async (j, index) => {
        const isNew = !orgJobIds.has(j.id) || isNaN(Number(j.id));

        if (isNew) {
          await memberConfigService.createJobTitle({ name: j.name, displayOrder: index });
        } else {
          const org = original.jobTitles.find(oj => oj.id === j.id);
          if (!org || org.name !== j.name || org.order !== index) {
            await memberConfigService.updateJobTitle(Number(j.id), { name: j.name, displayOrder: index });
          }
        }
      }));

      // 4. Save Users (Create/Update)
      // Separation: New users have 'u_' prefix (from uid generator)
      const newUsers = draft.users.filter(u => u.id.startsWith("u_"));
      const existingUsers = draft.users.filter(u => !u.id.startsWith("u_"));

      // 4-1. Create New Users
      await Promise.all(newUsers.map(u => memberConfigService.createMember(u)));

      // 4-2. Update Existing Users
      const changedUsers = existingUsers.filter(u => {
        const org = original.users.find(x => x.id === u.id);
        return org && JSON.stringify(u) !== JSON.stringify(org);
      });
      await Promise.all(changedUsers.map(u => memberConfigService.updateMember(u.id, u)));

      alert("저장되었습니다.");

      // Reload to accept changes
      const branchId = Number(resolvedBranchId);
      if (!Number.isFinite(branchId) || branchId <= 0) {
        throw new Error("유효한 지점 정보가 없습니다.");
      }
      const [members, perms, depts, jobs] = await Promise.all([
        memberConfigService.getMembers(branchId),
        memberConfigService.getMemberConfig(),
        memberConfigService.getDepartments(),
        memberConfigService.getJobTitles(),
      ]);
      const reloaded: MembersSettings = {
        users: members,
        invitedAccounts: [],
        departments: depts.map(d => ({ id: String(d.id), name: d.name, order: d.displayOrder })),
        jobTitles: jobs.map(j => ({ id: String(j.id), name: j.name, order: j.displayOrder })),
        permissionProfiles: perms,
        tempAssignees: [],
      };
      setDraft(reloaded);
      setOriginal(reloaded);

    } catch (e) {
      console.error("Save failed", e);
      const message =
        (e as any)?.response?.data?.message ||
        (e as any)?.message ||
        "저장 중 오류가 발생했습니다.";
      alert(message);
      return;
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<MembersSettings>) => setDraft((p) => ({ ...p, ...patch }));

  const openOrgEditor = (
    kind: OrgEditorKind,
    item?: {
      id: string;
      name: string;
    }
  ) => {
    setOrgEditor({
      kind,
      mode: item ? "edit" : "create",
      id: item?.id,
      name: item?.name || "",
    });
    setOrgEditorError("");
  };

  const closeOrgEditor = () => {
    setOrgEditor(null);
    setOrgEditorError("");
  };

  const saveOrgEditor = () => {
    if (!orgEditor) return;
    const name = orgEditor.name.trim();
    if (!name) {
      setOrgEditorError("이름을 입력해 주세요.");
      return;
    }

    if (orgEditor.kind === "department") {
      if (orgEditor.mode === "create") {
        const next: Department = {
          id: uid("dept"),
          name,
          order: (draft.departments.reduce((m, x) => Math.max(m, x.order), 0) || 0) + 1,
        };
        update({ departments: [...draft.departments, next] });
      } else {
        update({
          departments: draft.departments.map((item) =>
            item.id === orgEditor.id ? { ...item, name } : item
          ),
        });
      }
      closeOrgEditor();
      return;
    }

    if (orgEditor.mode === "create") {
      const next: JobTitle = {
        id: uid("jt"),
        name,
        order: (draft.jobTitles.reduce((m, x) => Math.max(m, x.order), 0) || 0) + 1,
      };
      update({ jobTitles: [...draft.jobTitles, next] });
    } else {
      update({
        jobTitles: draft.jobTitles.map((item) =>
          item.id === orgEditor.id ? { ...item, name } : item
        ),
      });
    }
    closeOrgEditor();
  };

  const openMemberEditor = (target?: MemberUser) => {
    setMemberEditor({
      mode: target ? "edit" : "create",
      id: target?.id,
      name: target?.name || "",
      email: target?.email || "",
      departmentId: target?.departmentId || draft.departments?.[0]?.id || "",
      jobTitleId: target?.jobTitleId || draft.jobTitles?.[0]?.id || "",
      permissionProfileId: target?.permissionProfileId || draft.permissionProfiles?.[0]?.id || "",
      autoLogoutHours: target?.autoLogoutHours ?? 3,
    });
    setMemberEditorError("");
  };

  const closeMemberEditor = () => {
    setMemberEditor(null);
    setMemberEditorError("");
  };

  const saveMemberEditor = () => {
    if (!memberEditor) return;
    const name = memberEditor.name.trim();
    const email = memberEditor.email.trim();
    if (!name) {
      setMemberEditorError("이름을 입력해 주세요.");
      return;
    }
    if (!memberEditor.permissionProfileId) {
      setMemberEditorError("권한을 선택해 주세요.");
      return;
    }
    const normalizedAutoLogoutHours = Math.max(0, Number(memberEditor.autoLogoutHours) || 0);
    if (memberEditor.mode === "create") {
      if (!email) {
        setMemberEditorError("이메일(아이디)을 입력해 주세요.");
        return;
      }
      if (!email.includes("@")) {
        setMemberEditorError("이메일 형식이 올바르지 않습니다.");
        return;
      }
      const next: MemberUser = {
        id: uid("u"),
        name,
        email,
        departmentId: memberEditor.departmentId || undefined,
        jobTitleId: memberEditor.jobTitleId || undefined,
        branchId: resolvedBranchId || undefined,
        permissionProfileId: memberEditor.permissionProfileId,
        autoLogoutHours: normalizedAutoLogoutHours,
        isApproved: true,
      };
      update({ users: [next, ...(draft.users || [])] });
      closeMemberEditor();
      return;
    }

    update({
      users: (draft.users || []).map((user) =>
        user.id === memberEditor.id
          ? {
              ...user,
              name,
              departmentId: memberEditor.departmentId || undefined,
              jobTitleId: memberEditor.jobTitleId || undefined,
              permissionProfileId: memberEditor.permissionProfileId,
              autoLogoutHours: normalizedAutoLogoutHours,
            }
          : user
      ),
    });
    closeMemberEditor();
  };

  const openPermissionEditor = (target?: PermissionProfile) => {
    setPermissionEditor({
      mode: target ? "edit" : "create",
      id: target?.id,
      name: target?.name || "",
      branchScope: target?.branchScope || "own",
    });
    setPermissionEditorError("");
  };

  const closePermissionEditor = () => {
    setPermissionEditor(null);
    setPermissionEditorError("");
  };

  const savePermissionEditor = () => {
    if (!permissionEditor) return;
    const name = permissionEditor.name.trim();
    if (!name) {
      setPermissionEditorError("권한 이름을 입력해 주세요.");
      return;
    }

    if (permissionEditor.mode === "create") {
      const next = emptyPermissionProfile();
      next.name = name;
      next.branchScope = permissionEditor.branchScope;
      update({ permissionProfiles: [...draft.permissionProfiles, next] });
      closePermissionEditor();
      return;
    }

    update({
      permissionProfiles: draft.permissionProfiles.map((profile) =>
        profile.id === permissionEditor.id
          ? { ...profile, name, branchScope: permissionEditor.branchScope }
          : profile
      ),
    });
    closePermissionEditor();
  };

  const deptMap = useMemo(() => Object.fromEntries((draft.departments || []).map((d) => [d.id, d])), [draft.departments]);
  const titleMap = useMemo(() => Object.fromEntries((draft.jobTitles || []).map((t) => [t.id, t])), [draft.jobTitles]);
  const permMap = useMemo(() => Object.fromEntries((draft.permissionProfiles || []).map((p) => [p.id, p])), [draft.permissionProfiles]);

  const blockedUsers = useMemo(() => (draft.users || []).filter((u) => u.isApproved === false), [draft.users]);
  const activeUsersCount = useMemo(() => (draft.users || []).filter((u) => u.isApproved !== false).length, [draft.users]);
  const departmentOptions = useMemo(
    () =>
      (draft.departments || [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((d) => ({ value: d.id, label: d.name })),
    [draft.departments]
  );
  const jobTitleOptions = useMemo(
    () =>
      (draft.jobTitles || [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ value: t.id, label: t.name })),
    [draft.jobTitles]
  );
  const permissionOptions = useMemo(
    () => (draft.permissionProfiles || []).map((p) => ({ value: p.id, label: p.name })),
    [draft.permissionProfiles]
  );

  const syncUserApproval = (userId: string, isApproved: boolean) => {
    setDraft((prev) => ({
      ...prev,
      users: (prev.users || []).map((u) => (u.id === userId ? { ...u, isApproved } : u)),
    }));
    setOriginal((prev) => ({
      ...prev,
      users: (prev.users || []).map((u) => (u.id === userId ? { ...u, isApproved } : u)),
    }));
  };

  const handleAccessBlock = async (u: MemberUser) => {
    if (!confirm(`${u.name} 계정의 접근을 차단하시겠습니까?`)) return;
    try {
      setAccessChangingId(u.id);
      await memberConfigService.deactivateMember(Number(u.id));
      syncUserApproval(u.id, false);
      alert("접근이 차단되었습니다.");
    } catch (e) {
      console.error(e);
      alert("접근 차단 처리에 실패했습니다.");
    } finally {
      setAccessChangingId(null);
    }
  };

  const handleAccessAllow = async (u: MemberUser) => {
    if (!confirm(`${u.name} 계정의 접근을 다시 허용하시겠습니까?`)) return;
    try {
      setAccessChangingId(u.id);
      await memberConfigService.approveMember(Number(u.id));
      syncUserApproval(u.id, true);
      alert("접근이 허용되었습니다.");
    } catch (e) {
      console.error(e);
      alert("접근 허용 처리에 실패했습니다.");
    } finally {
      setAccessChangingId(null);
    }
  };

  const openPasswordDialog = (u: MemberUser) => {
    setPasswordTarget(u);
    setNewPassword("");
    setConfirmPassword("");
  };

  const closePasswordDialog = () => {
    setPasswordTarget(null);
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangeMemberPassword = async () => {
    if (!passwordTarget) return;
    const next = newPassword.trim();
    if (!next) {
      alert("새 비밀번호를 입력해 주세요.");
      return;
    }
    if (next.length < 8) {
      alert("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (next !== confirmPassword) {
      alert("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    try {
      setPasswordSaving(true);
      await memberConfigService.changeMemberPassword(passwordTarget.id, next);
      alert(`${passwordTarget.name} 비밀번호가 변경되었습니다.`);
      closePasswordDialog();
    } catch (e) {
      console.error(e);
      alert("비밀번호 변경에 실패했습니다.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const exportUsersAsCsv = () => {
    const headers = [
      "사용자ID",
      "이름",
      "이메일",
      "상태",
      "부서",
      "직군",
      "권한",
      "지점범위",
      "소속지점",
      "자동로그아웃(시간)",
      "최근로그인",
      "최근로그인IP",
    ];

    const rows = (draft.users || []).map((u) => {
      const profile = permMap[u.permissionProfileId];
      return [
        u.id,
        u.name,
        u.email ?? "",
        u.isApproved === false ? "접근 차단" : "접근 가능",
        deptMap[u.departmentId ?? ""]?.name ?? "",
        titleMap[u.jobTitleId ?? ""]?.name ?? "",
        profile?.name ?? "",
        profile?.branchScope === "all" ? "전체 지점" : "본인 지점",
        u.branchId ?? "",
        u.autoLogoutHours ?? 0,
        u.lastLoginAt ?? "",
        u.lastLoginIp ?? "",
      ].map(toCsvCell).join(",");
    });

    const csv = [headers.map(toCsvCell).join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `members_${resolvedBranchId || "branch"}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="설정 > 멤버" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold">멤버 설정</div>
            <div className="mt-1 text-sm text-gray-600">직원/임시담당자/초대 계정, 부서/직군, 권한을 설정합니다.</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>
              저장
            </Button>
            <Button variant="outline" onClick={() => setDraft(original)} disabled={saving}>
              되돌리기
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")}>
            계정정보
          </TabButton>
          <TabButton active={tab === "org"} onClick={() => setTab("org")}>
            부서/직군
          </TabButton>
          <TabButton active={tab === "permissions"} onClick={() => setTab("permissions")}>
            권한
          </TabButton>
        </div>

        {tab === "accounts" && (
          <div className="mt-4 space-y-4">
            <Section title={`사용자 ${(draft.users || []).length}`} desc="회원가입한 직원 계정을 조회/수정합니다.">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">내보내기는 삭제가 아니라 접근 차단입니다. 각 사용자 행의 우측 `접근 관리` 버튼을 사용하세요.</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={exportUsersAsCsv}>
                    <Download className="h-4 w-4" /> CSV 다운로드
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openMemberEditor()}
                  >
                    <Plus className="h-4 w-4" /> 사용자 추가
                  </Button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  전체 {(draft.users || []).length}명
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  접근 가능 {activeUsersCount}명
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  접근 차단 {blockedUsers.length}명
                </span>
              </div>

              {canManageMemberPasswords && (
                <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">
                  최고관리자는 사용자 비밀번호를 직접 변경할 수 있습니다.
                </div>
              )}

              <div className="overflow-auto rounded-2xl border border-[rgb(var(--kkeut-border))] shadow-sm">
                <table className={cn("w-full text-sm", canManageMemberPasswords ? "min-w-[1040px]" : "min-w-[900px]")}>
                  <thead className="bg-slate-50 text-slate-700">
                    <tr className="text-left">
                      <th className="p-3 text-center font-extrabold">사용자정보</th>
                      <th className="p-3 text-center font-extrabold">상태</th>
                      <th className="p-3 text-center font-extrabold">부서</th>
                      <th className="p-3 text-center font-extrabold">직군</th>
                      <th className="p-3 text-center font-extrabold">권한</th>
                      <th className="p-3 text-center font-extrabold">자동 로그아웃</th>
                      <th className="p-3 text-center font-extrabold">최근 로그인</th>
                      {canManageMemberPasswords && <th className="w-[140px] p-3 text-center font-extrabold">비밀번호</th>}
                      <th className="w-[140px] p-3 text-center font-extrabold">접근 관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(draft.users || []).map((u) => (
                      <tr key={u.id} className="border-t border-[rgb(var(--kkeut-border))] hover:bg-slate-50/60 transition-colors">
                        <td className="p-3 text-center">
                          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                            <button
                              type="button"
                              className="w-full rounded-xl border border-transparent px-2 py-1 text-left transition hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                              onClick={() => openMemberEditor(u)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="truncate text-sm font-bold text-slate-900">{u.name || "-"}</div>
                                <span className="text-[11px] font-semibold text-slate-500">수정</span>
                              </div>
                              <div className="mt-1 truncate text-xs font-medium text-slate-600">{u.email || "-"}</div>
                            </button>
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-600">소속지점: {u.branchId ?? "-"}</div>
                        </td>
                        <td className="p-3 text-center">
                          {u.isApproved === false ? (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-600/25">
                              접근 차단
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-800 ring-1 ring-inset ring-green-600/25">
                              접근 가능
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                            {deptMap[u.departmentId ?? ""]?.name ?? "-"}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                            {titleMap[u.jobTitleId ?? ""]?.name ?? "-"}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                            {permMap[u.permissionProfileId]?.name ?? "-"}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-600">{permMap[u.permissionProfileId]?.branchScope === "all" ? "전체 지점" : "본인 지점"}</div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                            {u.autoLogoutHours ?? 0}시간
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="text-[13px] font-semibold text-slate-600">PW 변경: {u.lastPasswordChangedAt ?? "-"}</div>
                          <div className="text-[13px] font-semibold text-slate-600">로그인: {u.lastLoginAt ?? "-"}</div>
                          <div className="text-[13px] font-semibold text-slate-600">IP: {u.lastLoginIp ?? "-"}</div>
                        </td>
                        {canManageMemberPasswords && (
                          <td className="w-[140px] p-3 text-center">
                            <Button variant="outline" size="sm" className="w-full" onClick={() => openPasswordDialog(u)}>
                              변경
                            </Button>
                          </td>
                        )}
                        <td className="w-[140px] p-3 text-center">
                          <div className="flex justify-center">
                            {u.isApproved === false ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                disabled={accessChangingId === u.id}
                                onClick={() => void handleAccessAllow(u)}
                              >
                                {accessChangingId === u.id ? "처리중..." : "복구"}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-amber-200 text-amber-700 hover:bg-amber-50"
                                disabled={accessChangingId === u.id}
                                onClick={() => void handleAccessBlock(u)}
                              >
                                {accessChangingId === u.id ? "처리중..." : "내보내기"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>


            <Section title={`내보낸 계정 ${blockedUsers.length}`} desc="삭제 대신 접근만 차단된 계정 목록입니다.">
              {blockedUsers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-600">
                  차단된 계정이 없습니다.
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {blockedUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-amber-800">{u.name}</div>
                        <div className="truncate text-xs text-amber-700">{u.email ?? "-"}</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={accessChangingId === u.id}
                        onClick={() => void handleAccessAllow(u)}
                      >
                        {accessChangingId === u.id ? "처리중..." : "복구"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}

        {tab === "org" && (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Section title={`부서 ${draft.departments.length}`} desc="부서명/순서를 관리합니다.">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => openOrgEditor("department")}>
                  <Plus className="h-4 w-4" /> 부서 등록
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {sortByOrder(draft.departments).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                      onClick={() => openOrgEditor("department", { id: d.id, name: d.name })}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-800">{d.name || "이름 없음"}</span>
                        <span className="text-[11px] font-semibold text-slate-500">수정</span>
                      </div>
                    </button>
                    <div className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">순서 {d.order}</div>
                    <Button variant="outline" size="sm" onClick={() => update({ departments: moveOrderItem(draft.departments, d.id, "up") })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ departments: moveOrderItem(draft.departments, d.id, "down") })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ departments: draft.departments.filter((x) => x.id !== d.id) })}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={`직군 ${draft.jobTitles.length}`} desc="직군명/순서를 관리합니다.">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => openOrgEditor("jobTitle")}>
                  <Plus className="h-4 w-4" /> 직군 등록
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {sortByOrder(draft.jobTitles).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                      onClick={() => openOrgEditor("jobTitle", { id: t.id, name: t.name })}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-800">{t.name || "이름 없음"}</span>
                        <span className="text-[11px] font-semibold text-slate-500">수정</span>
                      </div>
                    </button>
                    <div className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">순서 {t.order}</div>
                    <Button variant="outline" size="sm" onClick={() => update({ jobTitles: moveOrderItem(draft.jobTitles, t.id, "up") })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ jobTitles: moveOrderItem(draft.jobTitles, t.id, "down") })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ jobTitles: draft.jobTitles.filter((x) => x.id !== t.id) })}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="직군별 사용자" desc="(예시) 직군별 사용자 리스트를 확인합니다.">
              <div className="space-y-2">
                {draft.jobTitles
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((t) => (
                    <div key={t.id} className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                      <div className="text-sm font-extrabold">{t.name}</div>
                      <div className="mt-2 space-y-1 text-sm text-gray-700">
                        {draft.users.filter((u) => u.jobTitleId === t.id).length ? (
                          draft.users
                            .filter((u) => u.jobTitleId === t.id)
                            .map((u) => (
                              <div key={u.id} className="flex items-center justify-between">
                                <div>{u.name}</div>
                                <div className="text-xs text-gray-500">{deptMap[u.departmentId ?? ""]?.name ?? "-"}</div>
                              </div>
                            ))
                        ) : (
                          <div className="text-xs text-gray-400">(해당 없음)</div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </Section>
          </div>
        )}

        {tab === "permissions" && (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Section title={`권한 ${draft.permissionProfiles.length}`} desc="권한(프로필) 단위로 메뉴별 보기/편집 권한 및 지점 범위를 설정합니다.">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => openPermissionEditor()}>
                  <Plus className="h-4 w-4" /> 권한 등록
                </Button>
              </div>

              <div className="mt-3 space-y-3">
                {draft.permissionProfiles.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-[260px] max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                        onClick={() => openPermissionEditor(p)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-slate-900">{p.name || "이름 없음"}</span>
                          <span className="text-[11px] font-semibold text-slate-500">수정</span>
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-600">
                          {p.branchScope === "all" ? "전체 지점 차트" : "본인 지점만"}
                        </div>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          update({
                            permissionProfiles: draft.permissionProfiles.filter((x) => x.id !== p.id),
                            users: draft.users.map((u) => (u.permissionProfileId === p.id ? { ...u, permissionProfileId: draft.permissionProfiles[0]?.id ?? u.permissionProfileId } : u)),
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-4 overflow-auto rounded-2xl border border-[rgb(var(--kkeut-border))] p-4 bg-white">

                      <div className="space-y-6">
                        {PERMISSION_CONFIG.map((group) => (
                          <div key={group.key}>
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-bold text-gray-800">{group.label}</h4>
                              <div className="h-px flex-1 bg-gray-100"></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {group.children?.map((child) => (
                                <label key={child.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg transition-colors">
                                  <Switch
                                    checked={!!p.permissions[child.key]}
                                    onCheckedChange={(checked) => {
                                      update({
                                        permissionProfiles: draft.permissionProfiles.map((x) =>
                                          x.id === p.id
                                            ? { ...x, permissions: { ...x.permissions, [child.key]: checked } }
                                            : x
                                        ),
                                      });
                                    }}
                                  />
                                  <span>{child.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="권한 미리보기" desc="사용자에 연결된 권한을 빠르게 확인합니다.">
              <div className="space-y-2">
                {draft.users.map((u) => {
                  const p = permMap[u.permissionProfileId];
                  return (
                    <div key={u.id} className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-extrabold">{u.name}</div>
                        <div className="text-xs text-gray-500">{p?.name ?? "-"}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {PERMISSION_CONFIG.map((group) => (
                          <div key={group.key} className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 py-2 text-xs">
                            <div className="mb-1 font-bold text-gray-800">{group.label}</div>
                            <div className="flex flex-wrap gap-1">
                              {group.children?.filter(c => p?.permissions[c.key]).map(c => (
                                <span key={c.key} className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                  {c.label}
                                </span>
                              ))}
                              {(!group.children?.some(c => p?.permissions[c.key])) && (
                                <span className="text-gray-400">-</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        )}

        {orgEditor && (
          <div
            className="fixed inset-0 z-[108] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
            onMouseDown={closeOrgEditor}
          >
            <div
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-200 px-6 py-4">
                <div className="text-xl font-extrabold text-slate-900">
                  {orgEditor.kind === "department"
                    ? orgEditor.mode === "create"
                      ? "부서 등록"
                      : "부서 수정"
                    : orgEditor.mode === "create"
                      ? "직군 등록"
                      : "직군 수정"}
                </div>
                <div className="mt-1 text-sm text-slate-500">목록에서는 읽기만 하고, 등록/수정은 모달에서 입력합니다.</div>
              </div>

              <div className="space-y-4 px-6 py-5">
                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">이름</div>
                  <Input
                    autoFocus
                    value={orgEditor.name}
                    placeholder={orgEditor.kind === "department" ? "예: 상담팀" : "예: 원장"}
                    onChange={(event) => {
                      setOrgEditor((prev) => (prev ? { ...prev, name: event.target.value } : prev));
                      if (orgEditorError) setOrgEditorError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      saveOrgEditor();
                    }}
                  />
                </div>

                {orgEditorError && <div className="text-xs font-semibold text-rose-600">{orgEditorError}</div>}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
                <Button variant="outline" onClick={closeOrgEditor}>
                  취소
                </Button>
                <Button variant="primary" onClick={saveOrgEditor}>
                  저장
                </Button>
              </div>
            </div>
          </div>
        )}

        {memberEditor && (
          <div
            className="fixed inset-0 z-[108] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
            onMouseDown={closeMemberEditor}
          >
            <div
              className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-200 px-6 py-4">
                <div className="text-xl font-extrabold text-slate-900">{memberEditor.mode === "create" ? "사용자 등록" : "사용자 수정"}</div>
                <div className="mt-1 text-sm text-slate-500">목록에서는 읽기만 하고, 등록/수정은 모달에서 입력합니다.</div>
              </div>

              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs font-bold text-slate-500">이름</div>
                  <Input
                    autoFocus
                    value={memberEditor.name}
                    placeholder="이름"
                    onChange={(event) => {
                      setMemberEditor((prev) => (prev ? { ...prev, name: event.target.value } : prev));
                      if (memberEditorError) setMemberEditorError("");
                    }}
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs font-bold text-slate-500">이메일</div>
                  <Input
                    value={memberEditor.email}
                    placeholder="email@example.com"
                    readOnly={memberEditor.mode === "edit"}
                    disabled={memberEditor.mode === "edit"}
                    onChange={(event) => {
                      if (memberEditor.mode === "edit") return;
                      setMemberEditor((prev) => (prev ? { ...prev, email: event.target.value } : prev));
                      if (memberEditorError) setMemberEditorError("");
                    }}
                  />
                  {memberEditor.mode === "edit" && (
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      이메일(아이디)은 수정할 수 없습니다.
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">부서</div>
                  <Select
                    value={memberEditor.departmentId}
                    onChange={(event) => setMemberEditor((prev) => (prev ? { ...prev, departmentId: event.target.value } : prev))}
                  >
                    <option value="">선택 안 함</option>
                    {departmentOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">직군</div>
                  <Select
                    value={memberEditor.jobTitleId}
                    onChange={(event) => setMemberEditor((prev) => (prev ? { ...prev, jobTitleId: event.target.value } : prev))}
                  >
                    <option value="">선택 안 함</option>
                    {jobTitleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">권한</div>
                  <Select
                    value={memberEditor.permissionProfileId}
                    onChange={(event) => setMemberEditor((prev) => (prev ? { ...prev, permissionProfileId: event.target.value } : prev))}
                  >
                    {permissionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">자동 로그아웃(시간)</div>
                  <Input
                    type="number"
                    min={0}
                    value={memberEditor.autoLogoutHours}
                    onChange={(event) => {
                      const next = Number(event.target.value || 0);
                      setMemberEditor((prev) => (prev ? { ...prev, autoLogoutHours: Number.isFinite(next) ? next : 0 } : prev));
                    }}
                  />
                </div>

                {memberEditorError && <div className="md:col-span-2 text-xs font-semibold text-rose-600">{memberEditorError}</div>}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
                <Button variant="outline" onClick={closeMemberEditor}>
                  취소
                </Button>
                <Button variant="primary" onClick={saveMemberEditor}>
                  저장
                </Button>
              </div>
            </div>
          </div>
        )}

        {permissionEditor && (
          <div
            className="fixed inset-0 z-[108] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
            onMouseDown={closePermissionEditor}
          >
            <div
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-200 px-6 py-4">
                <div className="text-xl font-extrabold text-slate-900">{permissionEditor.mode === "create" ? "권한 등록" : "권한 수정"}</div>
                <div className="mt-1 text-sm text-slate-500">목록에서는 읽기만 하고, 등록/수정은 모달에서 입력합니다.</div>
              </div>

              <div className="space-y-4 px-6 py-5">
                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">권한 이름</div>
                  <Input
                    autoFocus
                    value={permissionEditor.name}
                    placeholder="예: 상담팀"
                    onChange={(event) => {
                      setPermissionEditor((prev) => (prev ? { ...prev, name: event.target.value } : prev));
                      if (permissionEditorError) setPermissionEditorError("");
                    }}
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">지점 범위</div>
                  <Select
                    value={permissionEditor.branchScope}
                    onChange={(event) =>
                      setPermissionEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              branchScope: (event.target.value as PermissionProfile["branchScope"]) || "own",
                            }
                          : prev
                      )
                    }
                  >
                    <option value="all">전체 지점 차트</option>
                    <option value="own">본인 지점만</option>
                  </Select>
                </div>

                {permissionEditorError && <div className="text-xs font-semibold text-rose-600">{permissionEditorError}</div>}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
                <Button variant="outline" onClick={closePermissionEditor}>
                  취소
                </Button>
                <Button variant="primary" onClick={savePermissionEditor}>
                  저장
                </Button>
              </div>
            </div>
          </div>
        )}

        {passwordTarget && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-2xl">
              <div className="text-lg font-extrabold">비밀번호 변경</div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-bold text-slate-800">{passwordTarget.name}</span> 계정의 비밀번호를 변경합니다.
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">새 비밀번호</label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">새 비밀번호 확인</label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="text-xs font-semibold text-slate-500">비밀번호는 8자 이상으로 입력해 주세요.</div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={closePasswordDialog} disabled={passwordSaving}>
                  취소
                </Button>
                <Button variant="primary" onClick={handleChangeMemberPassword} disabled={passwordSaving}>
                  {passwordSaving ? "변경 중..." : "변경"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

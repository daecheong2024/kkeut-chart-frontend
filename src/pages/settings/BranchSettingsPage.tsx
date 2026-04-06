import React, { useEffect, useMemo, useState } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import apiClient from "../../services/apiClient";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { normalizeBranchName } from "../../utils/branchName";

interface BranchDto {
  id: number;
  name: string;
  remarks?: string;
}

export default function BranchSettingsPage() {
  const activeBranchId = useSettingsStore((s) => s.settings.activeBranchId);
  const setActiveBranch = useSettingsStore((s) => s.setActiveBranch);
  const setStoreBranches = useSettingsStore((s) => s.setBranches);
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(activeBranchId);

  const [rows, setRows] = useState<BranchDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRemarks, setEditRemarks] = useState("");

  const hasPermission = permLoaded ? !!permissions["settings.branches"] : false;

  const syncBranchStore = (items: BranchDto[]) => {
    const mapped = items.map((b) => ({ id: String(b.id), name: normalizeBranchName(b.name, b.id) }));
    setStoreBranches(mapped);

    if (mapped.length === 0) return;
    const existsActive = mapped.some((b) => b.id === String(activeBranchId || ""));
    if (!existsActive) {
      const firstBranch = mapped[0];
      if (firstBranch) {
        setActiveBranch(firstBranch.id);
      }
    }
  };

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<BranchDto[]>("/branches");
      const list = (Array.isArray(res.data) ? res.data : []).map((branch) => ({
        ...branch,
        name: normalizeBranchName(branch.name, branch.id),
      }));
      setRows(list);
      syncBranchStore(list);
    } catch (err) {
      console.error("Failed to fetch branches", err);
      alert("지점 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission) return;
    void fetchBranches();
  }, [hasPermission]);

  const openCreate = () => {
    setEditingId(null);
    setEditName("");
    setEditRemarks("");
    setIsModalOpen(true);
  };

  const openEdit = (branch: BranchDto) => {
    setEditingId(branch.id);
    setEditName(branch.name);
    setEditRemarks(branch.remarks || "");
    setIsModalOpen(true);
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setEditName("");
    setEditRemarks("");
  };

  const handleSave = async () => {
    const name = editName.trim();
    if (!name) {
      alert("지점명을 입력해 주세요.");
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        await apiClient.put(`/branches/${editingId}`, { name, remarks: editRemarks.trim() || null });
      } else {
        await apiClient.post("/branches/register", { seq: 0, name, remarks: editRemarks.trim() || null });
      }

      resetModal();
      await fetchBranches();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.title ||
        err?.message ||
        "지점 저장에 실패했습니다.";
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (branch: BranchDto) => {
    if (!window.confirm(`'${branch.name}' 지점을 삭제하시겠습니까?`)) return;
    try {
      setDeletingId(branch.id);
      await apiClient.delete(`/branches/${branch.id}`);
      await fetchBranches();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.title ||
        err?.message ||
        "지점 삭제에 실패했습니다.";
      alert(message);
    } finally {
      setDeletingId(null);
    }
  };

  if (!hasPermission) {
    return (
      <div className="p-8 text-center text-gray-500">
        <h2 className="text-xl font-bold text-red-500">접근 권한이 없습니다.</h2>
        <p className="mt-2">지점 관리는 지정된 관리자 계정만 사용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="지점 관리" />
      <div className="p-6">
        <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-lg font-bold">지점 목록</div>
            <Button variant="primary" onClick={openCreate}>
              지점 등록
            </Button>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">불러오는 중...</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">지점명</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">비고</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {rows.map((branch) => (
                    <tr key={branch.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{branch.id}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{branch.name}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{branch.remarks || "-"}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => openEdit(branch)}
                          className="mr-4 text-indigo-600 hover:text-indigo-900"
                          disabled={deletingId === branch.id}
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(branch)}
                          className="text-red-600 hover:text-red-900 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={deletingId === branch.id}
                        >
                          {deletingId === branch.id ? "삭제 중..." : "삭제"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-6 text-center text-sm text-gray-400">
                        등록된 지점이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[420px] rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-bold">{editingId ? "지점 수정" : "지점 등록"}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">지점명</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="예: 구로" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">비고</label>
                <Input value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} placeholder="선택 사항" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={resetModal} disabled={saving}>
                취소
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

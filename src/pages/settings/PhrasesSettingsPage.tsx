import React, { useState, useCallback } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Switch } from "../../components/ui/Switch";
import SmartTextarea from "../../components/SmartTextarea";
import { useSettingsStore } from "../../stores/useSettingsStore";
import {
  macroHospitalService,
  macroPersonalService,
  type MacroHospitalResponse,
  type MacroPersonalResponse,
  type CreateMacroRequest,
} from "../../services/macroService";
import { Plus, Trash2, Search, X, Loader2 } from "lucide-react";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";

type MacroItem = MacroHospitalResponse | MacroPersonalResponse;
type TabType = "my" | "clinic";

export default function PhrasesSettingsPage() {
  const { settings } = useSettingsStore();
  const activeBranchId = settings.activeBranchId;
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(activeBranchId);
  if (permLoaded && !permissions["settings.phrases"]) return <NoPermissionOverlay />;

  const [myList, setMyList] = useState<MacroPersonalResponse[]>([]);
  const [clinicList, setClinicList] = useState<MacroHospitalResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [editingItem, setEditingItem] = useState<{ type: TabType; item: MacroItem } | null>(null);

  const loadData = useCallback(async () => {
    if (!activeBranchId) return;
    try {
      setLoading(true);
      const [personalResult, hospitalResult] = await Promise.all([
        macroPersonalService.getAll(),
        macroHospitalService.getAll(),
      ]);
      setMyList(personalResult.items);
      setClinicList(hospitalResult.items);
    } catch (e) {
      console.error("Failed to load macro settings", e);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const getService = (type: TabType) =>
    type === "my" ? macroPersonalService : macroHospitalService;

  const getList = (type: TabType): MacroItem[] =>
    type === "my" ? myList : clinicList;

  const handleCreate = async (type: TabType) => {
    try {
      const request: CreateMacroRequest = {
        macro: "/",
        title: "",
        contents: "",
        isActive: true,
      };
      const created = await getService(type).create(request);
      if (type === "my") {
        setMyList(prev => [...prev, created as MacroPersonalResponse]);
      } else {
        setClinicList(prev => [...prev, created as MacroHospitalResponse]);
      }
      setEditingItem({ type, item: created });
    } catch (e) {
      console.error(e);
      alert("추가 실패");
    }
  };

  const handleDelete = async (type: TabType, id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      await getService(type).remove(id);
      if (type === "my") {
        setMyList(prev => prev.filter(x => x.id !== id));
      } else {
        setClinicList(prev => prev.filter(x => x.id !== id));
      }
      if (editingItem?.item.id === id) setEditingItem(null);
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  };

  const handleToggleActive = async (type: TabType, item: MacroItem) => {
    try {
      const updated = await getService(type).update(item.id, { isActive: !item.isActive });
      if (type === "my") {
        setMyList(prev => prev.map(x => x.id === updated.id ? updated as MacroPersonalResponse : x));
      } else {
        setClinicList(prev => prev.map(x => x.id === updated.id ? updated as MacroHospitalResponse : x));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!editingItem) return;
    const { type, item } = editingItem;
    try {
      const updated = await getService(type).update(item.id, {
        macro: item.macro,
        title: item.title,
        contents: item.contents,
        isActive: item.isActive,
      });
      if (type === "my") {
        setMyList(prev => prev.map(x => x.id === updated.id ? updated as MacroPersonalResponse : x));
      } else {
        setClinicList(prev => prev.map(x => x.id === updated.id ? updated as MacroHospitalResponse : x));
      }
      setEditingItem(null);
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    }
  };

  const handleEditUpdate = (patch: Partial<MacroItem>) => {
    if (!editingItem) return;
    setEditingItem({ ...editingItem, item: { ...editingItem.item, ...patch } });
  };

  const filterList = (list: MacroItem[]) => {
    const sorted = [...list].sort((a, b) => (a.macro ?? "").localeCompare(b.macro ?? ""));
    if (!search) return sorted;
    const s = search.toLowerCase();
    return sorted.filter(
      i => (i.title ?? "").toLowerCase().includes(s) || (i.macro ?? "").toLowerCase().includes(s)
    );
  };

  const renderList = (title: string, type: TabType) => (
    <div className="flex flex-col h-full rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-[rgb(var(--kkeut-border))]">
        <span className="font-bold text-gray-700">{title}</span>
        <Button variant="outline" size="sm" onClick={() => handleCreate(type)}>
          <Plus className="h-4 w-4" /> 추가
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filterList(getList(type)).map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 hover:border-violet-200 transition"
          >
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEditingItem({ type, item })}>
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs font-bold text-gray-600">
                  {item.macro}
                </span>
                <span className="truncate text-sm font-bold text-gray-900">{item.title || "(제목없음)"}</span>
              </div>
              <div className="mt-1 line-clamp-1 text-xs text-gray-500">
                {item.contents || "(내용없음)"}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Switch
                checked={item.isActive}
                onCheckedChange={() => handleToggleActive(type, item)}
              />
              <button onClick={() => handleDelete(type, item.id)} className="p-1 text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {getList(type).length === 0 && (
          <div className="py-8 text-center text-xs text-gray-400">등록된 문구가 없습니다.</div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <TopBar title="설정 > 문구" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="설정 > 문구" />

      <div className="relative flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0 mb-6">
          <div>
            <div className="text-lg font-extrabold">상용구 관리</div>
            <div className="mt-1 text-sm text-gray-600">
              차트, 메시지 등에서 사용할 상용구(단축어)를 관리합니다.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9 w-[200px]"
                placeholder="검색어 입력"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          {renderList("나의 문구", "my")}
          {renderList("병원 문구", "clinic")}
        </div>
      </div>

      {editingItem && (
        <div className="absolute inset-0 z-50 flex items-center justify-end bg-black/20 backdrop-blur-[1px]">
          <div className="h-full w-[400px] bg-white shadow-2xl border-l border-gray-100 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-lg">
                {editingItem.type === "my" ? "나의 문구 수정" : "병원 문구 수정"}
              </h3>
              <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">단축어 (선택)</label>
                <Input
                  value={editingItem.item.macro}
                  onChange={e => handleEditUpdate({ macro: e.target.value } as any)}
                  placeholder="/abc"
                />
                <p className="mt-1 text-xs text-blue-500">입력창에서 '/단축어' 입력 시 자동 완성됩니다.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">제목</label>
                <Input
                  value={editingItem.item.title ?? ""}
                  onChange={e => handleEditUpdate({ title: e.target.value })}
                  placeholder="문구 제목"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-xs font-bold text-gray-500 mb-1">내용</label>
                <SmartTextarea
                  className="flex-1 w-full rounded-xl border border-gray-200 p-3 text-sm resize-none focus:border-violet-500"
                  style={{ minHeight: "200px" }}
                  value={editingItem.item.contents ?? ""}
                  onChange={e => handleEditUpdate({ contents: e.target.value } as any)}
                  placeholder="상용구 내용을 입력하세요."
                />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                <span className="text-sm font-bold text-gray-700">사용 여부</span>
                <Switch
                  checked={editingItem.item.isActive}
                  onCheckedChange={v => handleEditUpdate({ isActive: v })}
                />
              </div>

              <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500 space-y-1">
                <div>작성자: {editingItem.item.creator} · {new Date(editingItem.item.createTime).toLocaleString()}</div>
                {editingItem.item.modifyTime && (
                  <div>수정자: {editingItem.item.modifier} · {new Date(editingItem.item.modifyTime).toLocaleString()}</div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <Button variant="primary" onClick={handleSave}>저장</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { useSettingsStore } from "../../stores/useSettingsStore";
import {
  normalizeTicketQueueCategory,
  normalizeTicketQueueDurationMinutes,
} from "../../utils/ticketQueueCategory";
import type {
  TicketItem,
  TicketRestrictionPreset,
  MembershipItem,
  ProcedureTodoStatsProcedureGroupRule,
} from "../../types/settings";

import { Plus, Trash2, Search, X, Calendar, Pencil } from "lucide-react";
import {
  weekTicketDefService,
  allowedDaysToApiString,
  apiStringToAllowedDays,
  timeToApiDateTime,
  apiDateTimeToTime,
} from "../../services/weekTicketDefService";
import type { WeekTicketDefResponse } from "../../services/weekTicketDefService";
import {
  categoryTicketDefService,
  keywordsToApiString,
  apiStringToKeywords,
} from "../../services/categoryTicketDefService";
import {
  ticketDefService,
  procOpTimeToMinutes,
  minutesToProcOpTime,
  formatDateForApi,
  apiDateToDateString,
} from "../../services/ticketDefService";
import type { TicketDefResponse, CreateTicketDefRequest, UpdateTicketDefRequest, PackageRoundRequest } from "../../services/ticketDefService";
import { membershipTicketDefService } from "../../services/membershipTicketDefService";
import { reservCategoryService } from "../../services/reservCategoryService";
import type { MembershipTicketDefResponse } from "../../services/membershipTicketDefService";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";

const TYPE_TO_USAGE_UNIT: Record<string, TicketItem["usageUnit"]> = {
  "회수권": "session",
  "기간권": "period",
  "패키지": "package",
};
const USAGE_UNIT_TO_TYPE: Record<string, string> = {
  session: "회수권",
  period: "기간권",
  package: "패키지",
};

function normalizeProcedureGroupName(value?: string) {
  return String(value || "").trim();
}

function parseProcedureKeywords(input?: string): string[] {
  return String(input || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function resolveUnifiedQueueCategory(item: Partial<TicketItem>): string | undefined {
  const next = String(item.queueCategoryName || item.autoTodoProcedureName || "").trim();
  return next || undefined;
}

function normalizeTicketItem(item: TicketItem): TicketItem {
  const previousQueueCategoryName = resolveUnifiedQueueCategory(item);
  const queueCategoryName = normalizeTicketQueueCategory(previousQueueCategoryName, item.name);
  const queueDurationMinutes = normalizeTicketQueueDurationMinutes({
    usageUnit: item.usageUnit,
    currentDurationMinutes: item.queueDurationMinutes,
    previousQueueCategoryName,
    nextQueueCategoryName: queueCategoryName,
  });
  return {
    ...item,
    queueCategoryName,
    queueDurationMinutes,
    // legacy field kept for compatibility only
    autoTodoProcedureName: undefined,
  };
}

/**
 * 티켓 설정 화면
 */
export default function TicketsSettingsPage() {
  const { settings } = useSettingsStore();
  const activeBranchId = settings.activeBranchId;
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(activeBranchId);
  if (permLoaded && !permissions["settings.tickets"]) return <NoPermissionOverlay />;

  const [items, setItems] = useState<TicketItem[]>([]);
  const [presets, setPresets] = useState<TicketRestrictionPreset[]>([]);
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [procedureGroups, setProcedureGroups] = useState<ProcedureTodoStatsProcedureGroupRule[]>([]);
  const [reservCategories, setReservCategories] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isProcedureGroupMgrOpen, setIsProcedureGroupMgrOpen] = useState(false);
  const [newProcedureGroupName, setNewProcedureGroupName] = useState("");
  const [newProcedureGroupKeywords, setNewProcedureGroupKeywords] = useState("");
  const [autoTodoTaskInput, setAutoTodoTaskInput] = useState("");

  const weekTicketToPreset = (wt: WeekTicketDefResponse): TicketRestrictionPreset => ({
    id: String(wt.id),
    label: wt.name,
    allowedDays: apiStringToAllowedDays(wt.availableDays),
    allowedTimeRange:
      wt.startTime || wt.endTime
        ? { start: apiDateTimeToTime(wt.startTime) || "", end: apiDateTimeToTime(wt.endTime) || "" }
        : undefined,
  });

  const loadWeekTickets = async () => {
    try {
      const list = await weekTicketDefService.getAll();
      setPresets(list.map(weekTicketToPreset));
    } catch (e) {
      console.error("Failed to load week tickets", e);
    }
  };

  const loadReservCategories = async () => {
    try {
      const list = await reservCategoryService.getAll();
      setReservCategories(list.map((c: any) => ({ id: Number(c.id), name: String(c.name) })));
    } catch (e) {
      console.error("Failed to load reserv categories", e);
    }
  };

  const loadCategoryTickets = async () => {
    try {
      const list = await categoryTicketDefService.getAll();
      setProcedureGroups(
        list.map((c) => ({
          id: String(c.id),
          name: c.name,
          keywords: apiStringToKeywords(c.keyword),
        }))
      );
      return list;
    } catch (e) {
      console.error("Failed to load category tickets", e);
      return [];
    }
  };

  const mapResponseToTicketItem = (
    r: TicketDefResponse,
    categoryList: ProcedureTodoStatsProcedureGroupRule[]
  ): TicketItem => {
    const usageUnit = TYPE_TO_USAGE_UNIT[r.type] || "session";
    const category = categoryList.find((c) => Number(c.id) === r.categoryId);
    return {
      id: String(r.id),
      code: r.code,
      name: r.name,
      usageUnit,
      totalCount: usageUnit === "session" ? (r.maximumUseCount ?? 1) : undefined,
      validDays: usageUnit === "period" ? (r.expireDate ? Math.ceil((new Date(r.expireDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : undefined) : undefined,
      minIntervalDays: r.minimumPeriod ?? undefined,
      maxTotalCount: usageUnit === "period" ? (r.maximumUseCount ?? undefined) : undefined,
      weekTicketId: r.weekTicketId ?? undefined,
      price: r.originalPrice,
      eventPrice: r.eventPrice,
      enabled: r.isActive,
      autoTodoEnabled: r.isAutoTodo,
      autoTodoTitleTemplate: r.todoTemplate ?? undefined,
      autoTodoTasks: r.autoTodoTasks ?? [],
      saleStartDate: apiDateToDateString(r.saleStartDate),
      saleEndDate: apiDateToDateString(r.saleEndDate),
      reservCategoryId: r.reservCategoryId,
      reservCategoryName: r.reservCategoryName ?? undefined,
      queueDurationMinutes: procOpTimeToMinutes(r.procOpTime),
      queueCategoryName: category?.name,
      rounds: r.rounds?.map((rd) => ({
        round: rd.ticketRound,
        treatments: rd.treatments ?? [],
        minIntervalDays: rd.minimumPeriod ?? undefined,
      })),
    };
  };

  const buildRoundsRequest = (item: TicketItem): PackageRoundRequest[] | undefined => {
    if (item.usageUnit !== "package" || !item.rounds || item.rounds.length === 0) return undefined;
    return item.rounds.map((rd) => ({
      ticketRound: rd.round,
      minimumPeriod: rd.minIntervalDays ?? null,
      procOpTime: null,
      treatments: rd.treatments ?? [],
    }));
  };

  const buildCreateRequest = (item: TicketItem): CreateTicketDefRequest => {
    const categoryMatch = procedureGroups.find(
      (g) => g.name === item.queueCategoryName
    );
    return {
      weekTicketId: item.weekTicketId ?? null,
      categoryId: categoryMatch ? Number(categoryMatch.id) : 1,
      reservCategoryId: item.reservCategoryId ?? 2,
      name: item.name,
      type: USAGE_UNIT_TO_TYPE[item.usageUnit] || "회수권",
      isAutoTodo: item.autoTodoEnabled ?? false,
      originalPrice: item.price ?? 0,
      eventPrice: item.eventPrice ?? null,
      isActive: item.enabled ?? true,
      minimumPeriod: item.minIntervalDays ?? null,
      maximumUseCount: item.usageUnit === "session" ? (item.totalCount ?? null) : (item.maxTotalCount ?? null),
      expireDate: item.usageUnit === "period" && item.validDays ? formatDateForApi(new Date(Date.now() + item.validDays * 86400000).toISOString().substring(0, 10)) : null,
      saleStartDate: formatDateForApi(item.saleStartDate) || new Date().toISOString(),
      saleEndDate: formatDateForApi(item.saleEndDate) || new Date().toISOString(),
      procOpTime: minutesToProcOpTime(item.queueDurationMinutes),
      todoTemplate: item.autoTodoTitleTemplate ?? null,
      autoTodoTasks: item.autoTodoTasks ?? [],
      rounds: buildRoundsRequest(item),
    };
  };

  const buildUpdateRequest = (item: TicketItem): UpdateTicketDefRequest => {
    const categoryMatch = procedureGroups.find(
      (g) => g.name === item.queueCategoryName
    );
    return {
      weekTicketId: item.weekTicketId ?? null,
      categoryId: categoryMatch ? Number(categoryMatch.id) : undefined,
      reservCategoryId: item.reservCategoryId ?? undefined,
      name: item.name,
      type: USAGE_UNIT_TO_TYPE[item.usageUnit] || "회수권",
      isAutoTodo: item.autoTodoEnabled ?? false,
      originalPrice: item.price ?? 0,
      eventPrice: item.eventPrice ?? null,
      isActive: item.enabled ?? true,
      minimumPeriod: item.minIntervalDays ?? null,
      maximumUseCount: item.usageUnit === "session" ? (item.totalCount ?? null) : (item.maxTotalCount ?? null),
      expireDate: item.usageUnit === "period" && item.validDays ? formatDateForApi(new Date(Date.now() + item.validDays * 86400000).toISOString().substring(0, 10)) : null,
      saleStartDate: formatDateForApi(item.saleStartDate),
      saleEndDate: formatDateForApi(item.saleEndDate),
      procOpTime: minutesToProcOpTime(item.queueDurationMinutes),
      todoTemplate: item.autoTodoTitleTemplate ?? null,
      autoTodoTasks: item.autoTodoTasks ?? [],
      rounds: buildRoundsRequest(item),
    };
  };

  const loadTicketDefs = async (categoryList?: ProcedureTodoStatsProcedureGroupRule[]) => {
    try {
      const result = await ticketDefService.getAll();
      const cats = categoryList || procedureGroups;
      const mapped = result.items.map((r) => mapResponseToTicketItem(r, cats));
      setItems(mapped);
    } catch (e) {
      console.error("Failed to load ticket defs", e);
    }
  };

  const loadMemberships = async () => {
    try {
      const list = await membershipTicketDefService.getAll();
      setMemberships(list.map(mapMembershipResponse));
    } catch (e) {
      console.error("Failed to load memberships", e);
    }
  };

  const mapMembershipResponse = (r: MembershipTicketDefResponse): MembershipItem => ({
    id: String(r.id),
    name: r.name,
    amount: Number(r.originalPrice),
    bonusPoints: r.bonusPoint ?? 0,
    discountPercent: r.discount ?? 0,
    enabled: r.isActive,
    order: 0,
    createdAt: r.createTime?.split("T")[0] || "",
  });

  // Load from backend on mount
  React.useEffect(() => {
    async function load() {
      if (!activeBranchId) return;
      try {
        setLoading(true);
        const [, catList] = await Promise.all([
          loadWeekTickets(),
          loadCategoryTickets(),
          loadMemberships(),
          loadReservCategories(),
        ]);
        const catGroups = (catList || []).map((c: any) => ({
          id: String(c.id),
          name: c.name,
          keywords: apiStringToKeywords(c.keyword),
        }));
        await loadTicketDefs(catGroups);
      } catch (e) {
        console.error("Failed to load ticket settings", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeBranchId]);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "session" | "period" | "package">("all");
  const [queueCategoryFilter, setQueueCategoryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"tickets" | "memberships">("tickets");
  const [editingMembership, setEditingMembership] = useState<MembershipItem | null>(null);
  const [isAddingMembership, setIsAddingMembership] = useState(false);
  const [membershipDraft, setMembershipDraft] = useState<MembershipItem | null>(null);
  const closeMembershipModal = () => {
    setIsAddingMembership(false);
    setEditingMembership(null);
    setMembershipDraft(null);
  };

  const queueCategoryOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      const queueCategory = resolveUnifiedQueueCategory(item);
      if (queueCategory) values.add(queueCategory);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ko"));
  }, [items]);

  React.useEffect(() => {
    if (queueCategoryFilter === "all" || queueCategoryFilter === "__unassigned__") return;
    if (!queueCategoryOptions.includes(queueCategoryFilter)) {
      setQueueCategoryFilter("all");
    }
  }, [queueCategoryFilter, queueCategoryOptions]);

  const openAddMembershipModal = () => {
    setEditingMembership(null);
    setIsAddingMembership(true);
    setMembershipDraft({
      id: "",
      name: "",
      amount: 1000000,
      bonusPoints: 0,
      discountPercent: 0,
      enabled: true,
      order: memberships.length + 1,
      createdAt: new Date().toISOString().split("T")[0] || "2025-01-01",
    });
  };

  const openEditMembershipModal = (item: MembershipItem) => {
    setIsAddingMembership(false);
    setEditingMembership(item);
    setMembershipDraft({ ...item });
  };

  const revert = async () => {
    await Promise.all([loadWeekTickets(), loadCategoryTickets(), loadMemberships()]);
    await loadTicketDefs();
  };

  // Filtered List
  const filtered = items.filter((it) => {
    if (filterType !== "all" && it.usageUnit !== filterType) return false;
    const queueCategory = resolveUnifiedQueueCategory(it);
    if (queueCategoryFilter === "__unassigned__" && queueCategory) return false;
    if (
      queueCategoryFilter !== "all" &&
      queueCategoryFilter !== "__unassigned__" &&
      queueCategory !== queueCategoryFilter
    ) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        it.name.toLowerCase().includes(q) ||
        it.code.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Modal State (Draft)
  // Modal State (Draft)
  const [editingItem, setEditingItem] = useState<TicketItem | null>(null);
  const isModalOpen = editingItem !== null;

  // Preset Manager State
  const [isPresetMgrOpen, setIsPresetMgrOpen] = useState(false);
  const [newPresetDraft, setNewPresetDraft] = useState<Partial<TicketRestrictionPreset>>({});
  const [editingPreset, setEditingPreset] = useState<TicketRestrictionPreset | null>(null);
  const [roundInputs, setRoundInputs] = useState<Record<number, string>>({});
  const registeredProcedureGroupNames = useMemo(() => {
    const names = new Set<string>();
    (procedureGroups || []).forEach((group) => {
      const normalized = normalizeProcedureGroupName(group?.name);
      if (normalized) names.add(normalized);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ko"));
  }, [procedureGroups]);

  React.useEffect(() => {
    setAutoTodoTaskInput("");
  }, [editingItem?.id]);

  const handleCreate = () => {
    const newItem: TicketItem = {
      id: "__new__",
      code: "",
      name: "",
      usageUnit: "session",
      totalCount: 5,
      price: 0,
      enabled: true,
      autoTodoEnabled: false,
      autoTodoTasks: [],
      saleStartDate: new Date().toISOString().slice(0, 10),
      saleEndDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      queueDurationMinutes: 30,
    };
    setEditingItem(newItem);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const numId = Number(id);
      if (!isNaN(numId)) {
        await ticketDefService.remove(numId);
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.error("Failed to delete ticket", e);
      alert("삭제에 실패했습니다.");
    }
  };

  const handleEdit = (item: TicketItem) => {
    const clone = normalizeTicketItem({ ...item });
    if (clone.weekTicketId && (!clone.allowedDays || clone.allowedDays.length === 0)) {
      const preset = presets.find(p => Number(p.id) === clone.weekTicketId);
      if (preset) {
        clone.allowedDays = preset.allowedDays ? [...preset.allowedDays] : undefined;
        clone.allowedTimeRange = preset.allowedTimeRange ? { ...preset.allowedTimeRange } : undefined;
      }
    }
    setEditingItem(clone);
    setRoundInputs({});
  };

  const handleDuplicate = async (item: TicketItem) => {
    try {
      const baseName = item.name.replace(/_복사_\d+$/, "");
      const existingNames = new Set(items.map((i) => i.name));
      let seq = 0;
      let copyName: string;
      do {
        copyName = `${baseName}_복사_${String(seq).padStart(2, "0")}`;
        seq++;
      } while (existingNames.has(copyName));

      const req = buildCreateRequest({
        ...item,
        name: copyName,
        enabled: false,
      });
      const created = await ticketDefService.create(req);
      const mapped = mapResponseToTicketItem(created, procedureGroups);
      setItems((prev) => [mapped, ...prev]);
    } catch (e) {
      console.error("Failed to duplicate ticket", e);
      alert("복사에 실패했습니다.");
    }
  };

  const updateDraft = (patch: Partial<TicketItem>) => {
    setEditingItem((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const addTreatmentToRound = (roundIndex: number, rawValue: string) => {
    const value = rawValue.trim();
    if (!value || !editingItem) return;
    const rounds = [...(editingItem.rounds || [])];
    const current = rounds[roundIndex];
    if (!current) return;
    const treatments = current.treatments || [];
    if (treatments.includes(value)) return;
    rounds[roundIndex] = { ...current, treatments: [...treatments, value] };
    updateDraft({ rounds, totalCount: rounds.length });
    setRoundInputs((prev) => ({ ...prev, [roundIndex]: "" }));
  };

  const normalizeAutoTodoTasks = (tasks?: string[]): string[] => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    (tasks || []).forEach((task) => {
      const value = String(task || "").trim();
      if (!value) return;
      if (seen.has(value)) return;
      seen.add(value);
      normalized.push(value);
    });
    return normalized;
  };

  const addAutoTodoTasks = (rawValue: string) => {
    if (!editingItem) return;
    const candidates = String(rawValue || "")
      .split(/[\n,]/g)
      .map((v) => v.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;
    const merged = normalizeAutoTodoTasks([...(editingItem.autoTodoTasks || []), ...candidates]);
    updateDraft({ autoTodoTasks: merged });
    setAutoTodoTaskInput("");
  };

  const removeAutoTodoTask = (targetIndex: number) => {
    if (!editingItem) return;
    const next = (editingItem.autoTodoTasks || []).filter((_, idx) => idx !== targetIndex);
    updateDraft({ autoTodoTasks: next });
  };

  const upsertProcedureGroup = async (id: string, patch: Partial<ProcedureTodoStatsProcedureGroupRule>) => {
    setProcedureGroups((prev) =>
      prev.map((group) => (group.id === id ? { ...group, ...patch } : group))
    );
    try {
      const numId = Number(id);
      if (!isNaN(numId)) {
        const updated = await categoryTicketDefService.update(numId, {
          name: patch.name ?? null,
          keyword: patch.keywords ? keywordsToApiString(patch.keywords) : null,
        });
        if (updated.id !== numId) {
          setProcedureGroups((prev) =>
            prev.map((group) =>
              group.id === id
                ? { ...group, id: String(updated.id), name: updated.name, keywords: apiStringToKeywords(updated.keyword) }
                : group
            )
          );
        }
      }
    } catch (e) {
      console.error("Failed to update category ticket", e);
    }
  };

  const addProcedureGroup = async (nameInput: string, keywordInput: string) => {
    const name = normalizeProcedureGroupName(nameInput);
    if (!name) {
      alert("분류명을 입력해 주세요.");
      return;
    }
    const duplicated = procedureGroups.some(
      (group) => normalizeProcedureGroupName(group.name).toLowerCase() === name.toLowerCase()
    );
    if (duplicated) {
      alert("이미 등록된 분류명입니다.");
      return;
    }

    const keywords = parseProcedureKeywords(keywordInput);
    const keywordStr = keywordsToApiString(keywords.length > 0 ? keywords : [name]);
    try {
      const created = await categoryTicketDefService.create({ name, keyword: keywordStr });
      const next: ProcedureTodoStatsProcedureGroupRule = {
        id: String(created.id),
        name: created.name,
        keywords: apiStringToKeywords(created.keyword),
      };
      setProcedureGroups((prev) =>
        [...prev, next].sort((a, b) => a.name.localeCompare(b.name, "ko"))
      );
      setNewProcedureGroupName("");
      setNewProcedureGroupKeywords("");
    } catch (e) {
      console.error("Failed to create category ticket", e);
      alert("카테고리 추가에 실패했습니다.");
    }
  };

  const removeProcedureGroup = async (id: string) => {
    try {
      const numId = Number(id);
      if (!isNaN(numId)) {
        await categoryTicketDefService.remove(numId);
      }
      setProcedureGroups((prev) => prev.filter((group) => group.id !== id));
    } catch (e) {
      console.error("Failed to delete category ticket", e);
      alert("카테고리 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="설정 > 티켓" />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Tab Navigation */}
        <div className="mb-6 flex items-center gap-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("tickets")}
            className={`pb-3 px-1 text-sm font-bold transition ${activeTab === "tickets"
                ? "border-b-2 border-[rgb(var(--kkeut-primary))] text-[rgb(var(--kkeut-primary))]"
                : "text-gray-500 hover:text-gray-700"
              }`}
          >
            티켓 관리
          </button>
          <button
            onClick={() => setActiveTab("memberships")}
            className={`pb-3 px-1 text-sm font-bold transition ${activeTab === "memberships"
                ? "border-b-2 border-[rgb(var(--kkeut-primary))] text-[rgb(var(--kkeut-primary))]"
                : "text-gray-500 hover:text-gray-700"
              }`}
          >
            회원권 관리
          </button>
        </div>

        {/* Tickets Section */}
        {activeTab === "tickets" && (
          <div>
            {/* Header Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold">티켓 관리</div>
                <div className="mt-1 text-sm text-gray-600">
                  시술/관리 티켓 정보를 등록합니다. 결제 시 사용되며 잔여 횟수가 관리됩니다.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={revert}>
                  새로고침
                </Button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-3">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9 w-[240px]"
                    placeholder="코드/티켓명 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex rounded-lg border border-[rgb(var(--kkeut-border))] bg-gray-50 p-1">
                  {(["all", "session", "period", "package"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${filterType === t
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                        }`}
                    >
                      {t === "all" ? "전체" : t === "session" ? "횟수권" : t === "package" ? "패키지" : "기간권"}
                    </button>
                  ))}
                </div>
                <Select
                  className="h-10 min-w-[180px]"
                  value={queueCategoryFilter}
                  onChange={(e) => setQueueCategoryFilter(e.target.value)}
                >
                  <option value="all">중분류 전체</option>
                  <option value="__unassigned__">중분류 미지정</option>
                  {queueCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setNewPresetDraft({ allowedDays: [0, 1, 2, 3, 4, 5, 6] });
                  setIsPresetMgrOpen(true);
                }}>
                  <Calendar className="h-4 w-4" />
                  요일권 관리
                </Button>
                <Button variant="outline" onClick={handleCreate}>
                  <Plus className="h-4 w-4" />
                  티켓 등록
                </Button>
              </div>
            </div>

            {/* List */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white shadow-sm">
              <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">코드</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">티켓명</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">유형</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">횟수/기간</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">가격</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">이벤트가</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">중분류/소요</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">예약카테고리</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">요일권</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">자동할일</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">사용</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--kkeut-border))]">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-gray-400">
                        등록된 티켓이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-center font-mono text-xs whitespace-nowrap">{item.code || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="truncate break-keep font-bold text-gray-900">{item.name}</div>
                          {(item.saleStartDate || item.saleEndDate) && (
                            <div className="mt-0.5 whitespace-nowrap text-[10px] text-gray-500">
                              {`${item.saleStartDate || "..."} ~ ${item.saleEndDate || "..."}`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${item.usageUnit === "session"
                              ? "bg-blue-50 text-blue-700"
                              : item.usageUnit === "package"
                                ? "bg-purple-50 text-purple-700"
                                : "bg-green-50 text-green-700"
                              }`}
                          >
                            {item.usageUnit === "session" ? "횟수권" : item.usageUnit === "package" ? "패키지" : "기간권"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap break-keep text-gray-700">
                          {item.usageUnit === "session"
                            ? `${item.totalCount}회`
                            : item.usageUnit === "package"
                              ? `${item.rounds?.length || 0}회 (패키지)`
                              : `${item.validDays}일`}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap text-gray-600">
                          {item.price?.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {item.eventPrice != null && item.eventPrice > 0 ? (
                            <span className="text-red-500 font-medium">{item.eventPrice.toLocaleString()}원</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const queueCategory = String(item.queueCategoryName || "").trim();
                            const queueDuration = Math.max(0, Number(item.queueDurationMinutes || 0));
                            if (!queueCategory && queueDuration <= 0) {
                              return <span className="whitespace-nowrap text-xs text-gray-300">-</span>;
                            }
                            return (
                              <div className="space-y-1">
                                <div className="whitespace-nowrap break-keep text-xs font-semibold text-gray-700">
                                  {queueCategory || "미지정"}
                                </div>
                                <div className="whitespace-nowrap text-[11px] text-gray-500">
                                  {queueDuration > 0 ? `${queueDuration}분` : "소요시간 미입력"}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap text-xs text-gray-700">
                          {item.reservCategoryName || <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const match = item.weekTicketId
                              ? presets.find(p => Number(p.id) === item.weekTicketId)
                              : presets.find(p =>
                                  JSON.stringify(p.allowedDays?.sort()) === JSON.stringify(item.allowedDays?.sort()) &&
                                  JSON.stringify(p.allowedTimeRange) === JSON.stringify(item.allowedTimeRange)
                                );

                            if (match) return <span className="inline-flex items-center whitespace-nowrap rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700">{match.label}</span>;

                            const hasDays = item.allowedDays && item.allowedDays.length > 0 && item.allowedDays.length < 7;
                            const hasTime = item.allowedTimeRange?.start || item.allowedTimeRange?.end;

                            if (hasDays || hasTime) return <span className="whitespace-nowrap break-keep text-xs text-gray-500">직접 설정</span>;
                            return <span className="whitespace-nowrap text-xs text-gray-300">-</span>;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {item.autoTodoEnabled ? (
                            <span className="whitespace-nowrap text-xs text-blue-600">
                              ON{(item.autoTodoTasks?.length || 0) > 0 ? ` (${item.autoTodoTasks?.length}개)` : ""}
                            </span>
                          ) : (
                            <span className="whitespace-nowrap text-xs text-gray-400">OFF</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <Switch
                            checked={item.enabled}
                            onCheckedChange={async (v) => {
                              setItems(prev => prev.map(i => i.id === item.id ? { ...i, enabled: v } : i));
                              try {
                                await ticketDefService.update(Number(item.id), { isActive: v });
                              } catch (e) {
                                console.error("Failed to toggle ticket", e);
                                setItems(prev => prev.map(i => i.id === item.id ? { ...i, enabled: !v } : i));
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex flex-nowrap items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-w-[3.75rem] whitespace-nowrap"
                              onClick={() => handleEdit(item)}
                            >
                              수정
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-w-[3.75rem] whitespace-nowrap"
                              onClick={() => handleDuplicate(item)}
                            >
                              복사
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-w-[3.75rem] whitespace-nowrap"
                              onClick={() => handleDelete(item.id)}
                            >
                              삭제
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
              <p className="font-bold">안내</p>
              <p className="mt-1">
                향후 API 연동 시 고객 티켓(발행 인스턴스) + 사용 이력(ledger)로 잔여/사용내역을 계산합니다.
              </p>
            </div>
          </div>
        )}

      {/* Edit Modal */}
        {isModalOpen && editingItem && (
          <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-4 duration-200 animate-in fade-in">
            <div className="flex min-h-full items-center justify-center">
              <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl animate-in zoom-in-95">
                <div className="flex max-h-[92vh] flex-col overflow-hidden p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold">티켓 정보 수정</h3>
                <button
                  onClick={() => setEditingItem(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">티켓명</label>
                    <Input
                      value={editingItem.name}
                      onChange={(e) => updateDraft({ name: e.target.value })}
                      placeholder="티켓 이름을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">가격</label>
                    <Input
                      type="number"
                      value={editingItem.price ?? ""}
                      onChange={(e) => updateDraft({ price: e.target.value === "" ? undefined : Number(e.target.value) })}
                      onBlur={(e) => { if (e.target.value === "") updateDraft({ price: 0 }); }}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">이벤트가</label>
                    <Input
                      type="number"
                      value={editingItem.eventPrice ?? ""}
                      onChange={(e) => updateDraft({ eventPrice: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="미입력 시 정상가 적용"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-bold text-gray-500">중분류 카테고리</label>
                      <button
                        type="button"
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50"
                        onClick={() => setIsProcedureGroupMgrOpen(true)}
                      >
                        분류 관리
                      </button>
                    </div>
                    <Select
                      value={editingItem.queueCategoryName || ""}
                      onChange={(e) =>
                        updateDraft({ queueCategoryName: String(e.target.value || "").trim() || undefined })
                      }
                      className="h-11"
                    >
                      <option value="">중분류 선택</option>
                      {editingItem.queueCategoryName &&
                        !registeredProcedureGroupNames.includes(editingItem.queueCategoryName) && (
                          <option value={editingItem.queueCategoryName}>
                            {editingItem.queueCategoryName} (기존값)
                          </option>
                        )}
                      {registeredProcedureGroupNames.map((name) => (
                        <option key={`queue-category-${name}`} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                    <p className="mt-1 text-[10px] text-gray-400">
                      같은 장비/중분류는 동일 이름으로 입력하면 대기 인원/시간이 합산됩니다.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">시술예약 카테고리</label>
                    <Select
                      value={editingItem.reservCategoryId ?? ""}
                      onChange={(e) =>
                        updateDraft({ reservCategoryId: e.target.value ? Number(e.target.value) : undefined })
                      }
                      className="h-11"
                    >
                      <option value="">카테고리 선택</option>
                      {reservCategories.map((rc) => (
                        <option key={`reserv-cat-${rc.id}`} value={rc.id}>
                          {rc.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">시술 소요시간(분)</label>
                    <Input
                      type="number"
                      min={1}
                      value={editingItem.queueDurationMinutes ?? ""}
                      onChange={(e) => updateDraft({ queueDurationMinutes: e.target.value === "" ? undefined : Math.trunc(Number(e.target.value)) || undefined })}
                      onBlur={(e) => { if (e.target.value === "") updateDraft({ queueDurationMinutes: undefined }); }}
                      placeholder="예: 15"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      환자차트의 예상 대기시간 계산에 사용됩니다.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">판매 시작일</label>
                    <Input
                      type="date"
                      value={editingItem.saleStartDate || ""}
                      onChange={(e) => updateDraft({ saleStartDate: e.target.value || undefined })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">판매 종료일</label>
                    <Input
                      type="date"
                      value={editingItem.saleEndDate || ""}
                      onChange={(e) => updateDraft({ saleEndDate: e.target.value || undefined })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">유형</label>
                    <Select
                      value={editingItem.usageUnit}
                      onChange={(e) => {
                        const next = e.target.value as "session" | "period" | "package";
                        if (next === "package") {
                          const rounds = editingItem.rounds && editingItem.rounds.length > 0
                            ? editingItem.rounds
                            : [{ round: 1, treatments: [], minIntervalDays: 0 }];
                          updateDraft({ usageUnit: "package", rounds, totalCount: rounds.length });
                          return;
                        }
                        updateDraft({ usageUnit: next });
                      }}
                    >
                      <option value="session">횟수권(횟수 차감)</option>
                      <option value="period">기간권(날짜 경과)</option>
                      <option value="package">패키지(회차별 시술)</option>
                    </Select>
                  </div>
                  <div>
                    {editingItem.usageUnit === "session" ? (
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-xs font-bold text-gray-500">제공 횟수</label>
                          <Input
                            type="number"
                            min={1}
                            value={editingItem.totalCount ?? ""}
                            onChange={(e) => updateDraft({ totalCount: e.target.value === "" ? undefined : Number(e.target.value) })}
                            onBlur={(e) => { if (e.target.value === "") updateDraft({ totalCount: 1 }); }}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-bold text-gray-500">최소 주기(일, 0=제한없음)</label>
                          <Input
                            type="number"
                            min={0}
                            value={editingItem.minIntervalDays ?? ""}
                            onChange={(e) => updateDraft({ minIntervalDays: e.target.value === "" ? undefined : Number(e.target.value) })}
                            onBlur={(e) => { if (e.target.value === "") updateDraft({ minIntervalDays: 0 }); }}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ) : editingItem.usageUnit === "period" ? (
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-xs font-bold text-gray-500">유효 기간(일)</label>
                          <Input
                            type="number"
                            min={1}
                            value={editingItem.validDays ?? ""}
                            onChange={(e) => updateDraft({ validDays: e.target.value === "" ? undefined : Number(e.target.value) })}
                            onBlur={(e) => { if (e.target.value === "") updateDraft({ validDays: 30 }); }}
                            placeholder="예: 365"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-bold text-gray-500">최소 주기(일)</label>
                            <Input
                              type="number"
                              min={0}
                              value={editingItem.minIntervalDays ?? ""}
                              onChange={(e) => updateDraft({ minIntervalDays: e.target.value === "" ? undefined : Number(e.target.value) })}
                              onBlur={(e) => { if (e.target.value === "") updateDraft({ minIntervalDays: 0 }); }}
                              placeholder="0 (제한없음)"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-bold text-gray-500">최대 이용 횟수</label>
                            <Input
                              type="number"
                              min={0}
                              value={editingItem.maxTotalCount ?? ""}
                              onChange={(e) => updateDraft({ maxTotalCount: e.target.value === "" ? undefined : Number(e.target.value) })}
                              onBlur={(e) => { if (e.target.value === "") updateDraft({ maxTotalCount: 0 }); }}
                              placeholder="0 (무제한)"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-blue-800">회차별 구성</div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs bg-white"
                            onClick={() => {
                              const rounds = editingItem.rounds || [];
                              const nextRound = rounds.length + 1;
                              updateDraft({
                                rounds: [...rounds, { round: nextRound, treatments: [], minIntervalDays: 7 }],
                                totalCount: nextRound
                              });
                            }}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            회차 추가
                          </Button>
                        </div>

                        <div className="max-h-[360px] overflow-y-auto pr-1">
                          <div className="grid grid-cols-1 gap-2">
                            {(editingItem.rounds || []).map((round, idx) => (
                              <div key={idx} className="rounded-lg border border-blue-100 bg-white p-3">
                                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                                  <div className="text-xs font-bold text-gray-700">{round.round}회차</div>
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    {idx > 0 && (
                                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1">
                                        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-blue-700">주기</span>
                                        <Input
                                          type="number"
                                          min={0}
                                          className="h-8 min-w-[4.5rem] w-[4.5rem] rounded-lg px-2 text-center text-sm"
                                          aria-label={`${round.round}회차 주기(일)`}
                                          value={round.minIntervalDays ?? ""}
                                          onChange={(e) => {
                                            const rounds = [...(editingItem.rounds || [])];
                                            const currentRound = rounds[idx];
                                            if (!currentRound) return;
                                            rounds[idx] = { ...currentRound, minIntervalDays: e.target.value === "" ? undefined : Number(e.target.value) };
                                            updateDraft({ rounds });
                                          }}
                                          onBlur={(e) => { if (e.target.value === "") { const rounds = [...(editingItem.rounds || [])]; const cr = rounds[idx]; if (cr) { rounds[idx] = { ...cr, minIntervalDays: 0 }; updateDraft({ rounds }); } } }}
                                        />
                                        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-blue-700">일</span>
                                      </div>
                                    )}
                                    <button
                                      className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                      onClick={() => {
                                        const rounds = (editingItem.rounds || [])
                                          .filter((_, i) => i !== idx)
                                          .map((r, i) => ({ ...r, round: i + 1 }));
                                        updateDraft({ rounds, totalCount: rounds.length });
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>

                                <Input
                                  className="text-xs"
                                  placeholder="시술명 입력 (Enter로 추가)"
                                  value={roundInputs[idx] || ""}
                                  onChange={(e) => setRoundInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.nativeEvent.isComposing) return;
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addTreatmentToRound(idx, roundInputs[idx] || "");
                                    }
                                  }}
                                  onBlur={() => addTreatmentToRound(idx, roundInputs[idx] || "")}
                                />

                                <div className="mt-2 flex flex-wrap gap-1">
                                  {(round.treatments || []).map((t, tIdx) => (
                                    <span key={tIdx} className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                                      {t}
                                      <button
                                        className="ml-1 text-gray-400 hover:text-gray-600"
                                        onClick={() => {
                                          const rounds = [...(editingItem.rounds || [])];
                                          const currentRound = rounds[idx];
                                          if (!currentRound) return;
                                          const treatments = (currentRound.treatments || []).filter((_, i) => i !== tIdx);
                                          rounds[idx] = { ...currentRound, treatments };
                                          updateDraft({ rounds });
                                        }}
                                      >
                                        x
                                      </button>
                                    </span>
                                  ))}
                                  {(!round.treatments || round.treatments.length === 0) && (
                                    <span className="text-[10px] text-gray-400">등록된 시술 없음</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                  </div>

                  <div className="space-y-4">
                    {/* Usage Restrictions */}
                <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-white p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-gray-900">이용 제한 설정</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-400">요일권 불러오기:</span>
                      <div className="flex gap-2">
                        <Select
                          value={editingItem.weekTicketId ? String(editingItem.weekTicketId) : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "__none__") {
                              updateDraft({ weekTicketId: null as any, allowedDays: undefined, allowedTimeRange: undefined });
                              return;
                            }
                            if (!val) {
                              return;
                            }
                            const p = presets.find(x => x.id === val);
                            if (p) {
                              const newDays = p.allowedDays ? [...p.allowedDays] : undefined;
                              const newTime = p.allowedTimeRange ? { ...p.allowedTimeRange } : undefined;
                              updateDraft({ weekTicketId: Number(p.id), allowedDays: newDays, allowedTimeRange: newTime });
                            }
                          }}
                        >
                          <option value="">요일권 선택 ({presets.length}개)</option>
                          <option value="__none__">- (해제)</option>
                          {presets.map(p => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const name = prompt("현재 요일/시간 설정을 요일권으로 저장합니다.\n요일권 이름을 입력하세요.");
                          if (!name) return;
                          try {
                            const created = await weekTicketDefService.create({
                              name,
                              availableDays: allowedDaysToApiString(editingItem.allowedDays),
                              startTime: timeToApiDateTime(editingItem.allowedTimeRange?.start),
                              endTime: timeToApiDateTime(editingItem.allowedTimeRange?.end),
                            });
                            setPresets(prev => [...prev, weekTicketToPreset(created)]);
                          } catch (e) {
                            console.error(e);
                            alert("요일권 저장 실패");
                          }
                        }}
                        className="h-7 text-xs"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        요일권 저장
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Days */}
                    <div>
                      <label className="mb-2 block text-xs font-bold text-gray-500">이용 가능 요일</label>
                      <div className="flex flex-wrap gap-2">
                        {["일", "월", "화", "수", "목", "금", "토"].map((dayName, idx) => {
                          const currentDays = editingItem.allowedDays ?? [0, 1, 2, 3, 4, 5, 6];
                          const active = currentDays.includes(idx);

                          return (
                            <button
                              key={idx}
                              className={`h-8 w-8 rounded-full text-xs font-bold transition-colors ${active
                                ? (idx === 0 ? "bg-red-100 text-red-600" : idx === 6 ? "bg-blue-100 text-blue-600" : "bg-gray-800 text-white")
                                : "bg-gray-100 text-gray-400"
                                }`}
                              onClick={() => {
                                let newDays = [...currentDays];
                                if (newDays.includes(idx)) {
                                  newDays = newDays.filter(d => d !== idx);
                                } else {
                                  newDays.push(idx);
                                }
                                updateDraft({ allowedDays: newDays });
                              }}
                            >
                              {dayName}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-[10px] text-gray-400">선택된 요일에만 티켓을 사용할 수 있습니다.</p>
                    </div>

                    {/* Time Range */}
                    <div>
                      <label className="mb-2 block text-xs font-bold text-gray-500">이용 가능 시간</label>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <Input
                          type="time"
                          value={editingItem.allowedTimeRange?.start || ""}
                          onChange={(e) => updateDraft({
                            allowedTimeRange: {
                              start: e.target.value,
                              end: editingItem.allowedTimeRange?.end || ""
                            }
                          })}
                        />
                        <span className="text-gray-400">~</span>
                        <Input
                          type="time"
                          value={editingItem.allowedTimeRange?.end || ""}
                          onChange={(e) => updateDraft({
                            allowedTimeRange: {
                              start: editingItem.allowedTimeRange?.start || "",
                              end: e.target.value
                            }
                          })}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-gray-400">입력된 시간 내에서만 사용 가능합니다. (비워두면 제한 없음)</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.6)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-gray-900">자동 할일 생성</div>
                      <div className="text-xs text-gray-500">티켓 소진 시 자동으로 할일을 생성합니다.</div>
                    </div>
                    <Switch
                      checked={editingItem.autoTodoEnabled}
                      onCheckedChange={(v) => updateDraft({ autoTodoEnabled: v })}
                    />
                  </div>
                  {editingItem.autoTodoEnabled && (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-[rgba(var(--kkeut-primary),.03)] p-3">
                        <label className="mb-1 block text-xs font-bold text-gray-500">할일 제목 템플릿</label>
                        <Input
                          value={editingItem.autoTodoTitleTemplate || ""}
                          onChange={(e) =>
                            updateDraft({ autoTodoTitleTemplate: e.target.value })
                          }
                          placeholder="예: {ticketName} {round}회차 - {treatment}"
                        />
                        <p className="mt-1 text-[10px] text-gray-400">
                          사용 가능 변수: {"{ticketName}"}, {"{round}"}, {"{treatment}"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-[rgba(var(--kkeut-primary),.03)] p-3">
                        <label className="mb-1 block text-xs font-bold text-gray-500">자동 할일 항목 (복수)</label>
                        <div className="flex items-center gap-2">
                          <Input
                            value={autoTodoTaskInput}
                            onChange={(e) => setAutoTodoTaskInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addAutoTodoTasks(autoTodoTaskInput);
                              }
                            }}
                            placeholder="예: 마취, {treatment}, 진정관리, 크라이오"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => addAutoTodoTasks(autoTodoTaskInput)}
                          >
                            추가
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(editingItem.autoTodoTasks || []).map((task, idx) => (
                            <span
                              key={`auto-todo-task-${idx}-${task}`}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700"
                            >
                              {task}
                              <button
                                type="button"
                                className="text-gray-400 hover:text-red-500"
                                onClick={() => removeAutoTodoTask(idx)}
                                aria-label="항목 삭제"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          {(!editingItem.autoTodoTasks || editingItem.autoTodoTasks.length === 0) && (
                            <span className="text-[10px] text-gray-400">등록된 자동 할일 항목이 없습니다.</span>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-gray-500">
                          Enter 또는 쉼표로 여러 항목을 추가할 수 있습니다. {"{treatment}"} 입력 시 회차 시술명으로 치환됩니다.
                        </p>
                      </div>
                      <p className="text-[10px] text-gray-500">
                        자동 할일 통계/표시는 티켓의 중분류 카테고리를 기준으로 집계됩니다.
                      </p>
                    </div>
                  )}
                </div>
                  </div>
                </div>

              <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-[rgb(var(--kkeut-border))] bg-white pt-4">
                <Button variant="outline" onClick={() => setEditingItem(null)}>
                  취소
                </Button>
                <Button variant="primary" onClick={async () => {
                  if (!editingItem) return;

                  if (!editingItem.name.trim()) {
                    alert("티켓명을 입력해주세요.");
                    return;
                  }

                  if (
                    editingItem.saleStartDate &&
                    editingItem.saleEndDate &&
                    editingItem.saleStartDate > editingItem.saleEndDate
                  ) {
                    alert("판매 종료일은 시작일보다 빠를 수 없습니다.");
                    return;
                  }

                  try {
                    const isNew = editingItem.id === "__new__";
                    if (isNew) {
                      const req = buildCreateRequest(editingItem);
                      const created = await ticketDefService.create(req);
                      const mapped = mapResponseToTicketItem(created, procedureGroups);
                      setItems((prev) => [mapped, ...prev]);
                    } else {
                      const numId = Number(editingItem.id);
                      const req = buildUpdateRequest(editingItem);
                      const updated = await ticketDefService.update(numId, req);
                      const mapped = mapResponseToTicketItem(updated, procedureGroups);
                      setItems((prev) => prev.map((it) => it.id === editingItem.id ? mapped : it));
                    }
                    setEditingItem(null);
                  } catch (e) {
                    console.error("Failed to save ticket", e);
                    alert("저장에 실패했습니다.");
                  }
                }}>
                  적용
                </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        )}

        {/* Procedure Group Manager Modal */}
        {isProcedureGroupMgrOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 duration-200 animate-in fade-in">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl animate-in zoom-in-95">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">중분류 카테고리 관리</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    티켓 중분류(대기/통계 집계 기준) 이름을 추가/수정/삭제할 수 있습니다.
                  </p>
                </div>
                <button
                  onClick={() => setIsProcedureGroupMgrOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={newProcedureGroupName}
                    onChange={(e) => setNewProcedureGroupName(e.target.value)}
                    placeholder="분류명 (예: 제모)"
                  />
                  <Input
                    value={newProcedureGroupKeywords}
                    onChange={(e) => setNewProcedureGroupKeywords(e.target.value)}
                    placeholder="키워드(콤마 구분, 예: 제모, 인중제모)"
                  />
                  <Button
                    variant="primary"
                    onClick={() => addProcedureGroup(newProcedureGroupName, newProcedureGroupKeywords)}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    추가
                  </Button>
                </div>
              </div>

              <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {procedureGroups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-6 text-center text-sm text-gray-400">
                    등록된 분류가 없습니다.
                  </div>
                ) : (
                  procedureGroups
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                    .map((group) => (
                      <div key={group.id} className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[1fr_1fr_auto]">
                        <Input
                          value={group.name}
                          onChange={(e) => {
                            const normalized = normalizeProcedureGroupName(e.target.value);
                            upsertProcedureGroup(group.id, { name: normalized });
                          }}
                          placeholder="분류명"
                        />
                        <Input
                          defaultValue={(group.keywords || []).join(", ")}
                          key={`kw-${group.id}`}
                          onBlur={(e) =>
                            upsertProcedureGroup(group.id, {
                              keywords: parseProcedureKeywords(e.target.value),
                            })
                          }
                          placeholder="키워드(콤마 구분)"
                        />
                        <Button variant="outline" onClick={() => removeProcedureGroup(group.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button variant="outline" onClick={() => setIsProcedureGroupMgrOpen(false)}>
                  닫기
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Preset Manager Modal */}
        {isPresetMgrOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 duration-200 animate-in fade-in">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl animate-in zoom-in-95">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">요일권 설정 관리</h3>
                <button
                  onClick={() => setIsPresetMgrOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6 space-y-2">
                <div className="text-sm font-bold text-gray-900">등록된 요일권</div>
                {presets.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-gray-400">등록된 요일권이 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {presets.map(p => (
                      <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div>
                          <div className="text-sm font-bold">{p.label}</div>
                          <div className="text-xs text-gray-500">
                            {/* Simple summary */}
                            {(!p.allowedDays || p.allowedDays.length === 7) ? "모든 요일" : ["일", "월", "화", "수", "목", "금", "토"].filter((_, i) => p.allowedDays?.includes(i)).join(", ")}
                            {" · "}
                            {(!p.allowedTimeRange?.start && !p.allowedTimeRange?.end) ? "시간제한 없음" : ` ${p.allowedTimeRange.start || "00:00"} ~ ${p.allowedTimeRange.end || "23:59"}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingPreset(editingPreset?.id === p.id ? null : p)}
                            className={`p-1 ${editingPreset?.id === p.id ? "text-blue-500" : "text-gray-400 hover:text-blue-500"}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("정말 삭제하시겠습니까?")) return;
                              try {
                                await weekTicketDefService.remove(Number(p.id));
                                setPresets(prev => prev.filter(x => x.id !== p.id));
                                if (editingPreset?.id === p.id) setEditingPreset(null);
                              } catch (e) {
                                console.error(e);
                                alert("삭제 실패");
                              }
                            }}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="mb-3 text-sm font-bold text-gray-900">새 요일권 등록</div>
                <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">이름</label>
                    <Input
                      value={newPresetDraft.label || ""}
                      onChange={(e) => setNewPresetDraft(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="예: 평일 오전"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">요일</label>
                    <div className="flex flex-wrap gap-2">
                      {["일", "월", "화", "수", "목", "금", "토"].map((dayName, idx) => {
                        const current = newPresetDraft.allowedDays ?? [];
                        const active = current.includes(idx);
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              const newDays = active ? current.filter(d => d !== idx) : [...current, idx];
                              setNewPresetDraft(prev => ({ ...prev, allowedDays: newDays }));
                            }}
                            className={`h-7 w-7 rounded-full text-xs font-bold ${active ? "bg-gray-800 text-white" : "bg-white text-gray-400 border border-gray-200"}`}
                          >
                            {dayName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">시간</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        className="w-32"
                        value={newPresetDraft.allowedTimeRange?.start || ""}
                        onChange={(e) => setNewPresetDraft(prev => ({
                          ...prev,
                          allowedTimeRange: { start: e.target.value, end: prev.allowedTimeRange?.end || "" }
                        }))}
                      />
                      <span className="text-gray-400">~</span>
                      <Input
                        type="time"
                        className="w-32"
                        value={newPresetDraft.allowedTimeRange?.end || ""}
                        onChange={(e) => setNewPresetDraft(prev => ({
                          ...prev,
                          allowedTimeRange: { start: prev.allowedTimeRange?.start || "", end: e.target.value }
                        }))}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!newPresetDraft.label}
                      onClick={async () => {
                        if (!newPresetDraft.label) return;
                        try {
                          const created = await weekTicketDefService.create({
                            name: newPresetDraft.label,
                            availableDays: allowedDaysToApiString(newPresetDraft.allowedDays),
                            startTime: timeToApiDateTime(newPresetDraft.allowedTimeRange?.start),
                            endTime: timeToApiDateTime(newPresetDraft.allowedTimeRange?.end),
                          });
                          setPresets(prev => [...prev, weekTicketToPreset(created)]);
                          setNewPresetDraft({ allowedDays: [] });
                        } catch (e) {
                          console.error(e);
                          alert("등록 실패");
                        }
                      }}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      추가
                    </Button>
                  </div>

                </div>
              </div>

              {editingPreset && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <div className="mb-3 text-sm font-bold text-gray-900">요일권 수정: {editingPreset.label}</div>
                  <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/30 p-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-gray-500">이름</label>
                      <Input
                        value={editingPreset.label || ""}
                        onChange={(e) => setEditingPreset(prev => prev ? { ...prev, label: e.target.value } : null)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-gray-500">요일</label>
                      <div className="flex flex-wrap gap-2">
                        {["일", "월", "화", "수", "목", "금", "토"].map((dayName, idx) => {
                          const current = editingPreset.allowedDays ?? [];
                          const active = current.includes(idx);
                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                const newDays = active ? current.filter(d => d !== idx) : [...current, idx];
                                setEditingPreset(prev => prev ? { ...prev, allowedDays: newDays } : null);
                              }}
                              className={`h-7 w-7 rounded-full text-xs font-bold ${active ? "bg-gray-800 text-white" : "bg-white text-gray-400 border border-gray-200"}`}
                            >
                              {dayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-gray-500">시간</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          className="w-32"
                          value={editingPreset.allowedTimeRange?.start || ""}
                          onChange={(e) => setEditingPreset(prev => prev ? {
                            ...prev,
                            allowedTimeRange: { start: e.target.value, end: prev.allowedTimeRange?.end || "" }
                          } : null)}
                        />
                        <span className="text-gray-400">~</span>
                        <Input
                          type="time"
                          className="w-32"
                          value={editingPreset.allowedTimeRange?.end || ""}
                          onChange={(e) => setEditingPreset(prev => prev ? {
                            ...prev,
                            allowedTimeRange: { start: prev.allowedTimeRange?.start || "", end: e.target.value }
                          } : null)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingPreset(null)}>
                        취소
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!editingPreset.label}
                        onClick={async () => {
                          try {
                            const updated = await weekTicketDefService.update(Number(editingPreset.id), {
                              name: editingPreset.label,
                              availableDays: allowedDaysToApiString(editingPreset.allowedDays),
                              startTime: timeToApiDateTime(editingPreset.allowedTimeRange?.start),
                              endTime: timeToApiDateTime(editingPreset.allowedTimeRange?.end),
                            });
                            setPresets(prev => prev.map(p => p.id === editingPreset.id ? weekTicketToPreset(updated) : p));
                            setEditingPreset(null);
                          } catch (e) {
                            console.error(e);
                            alert("수정 실패");
                          }
                        }}
                      >
                        저장
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

                {/* Membership Management Section */}
                {activeTab === "memberships" && (
                  <div>
                    {/* Header Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                      <div>
                        <div className="text-lg font-extrabold">회원권 관리</div>
                        <div className="mt-1 text-sm text-gray-600">
                          회원권 정보를 등록하고 관리합니다. 금액, 보너스 포인트, 추가 할인율을 설정할 수 있습니다.
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={revert}>
                          새로고침
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-bold">회원권 목록</h3>
                        <Button variant="primary" onClick={openAddMembershipModal}>
                          <Plus className="mr-1 h-4 w-4" />
                          회원권 추가
                        </Button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 text-center text-sm font-medium text-gray-600">
                              <th className="pb-3">회원권명</th>
                              <th className="pb-3">금액</th>
                              <th className="pb-3">보너스 포인트</th>
                              <th className="pb-3">추가 할인 (%)</th>
                              <th className="pb-3">상태</th>
                              <th className="pb-3">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {memberships
                              .slice()
                              .sort((a, b) => a.order - b.order)
                              .map((m) => (
                                <tr key={m.id} className="border-b border-gray-100 text-center">
                                  <td className="py-3 font-medium">{m.name}</td>
                                  <td className="py-3">{(m.amount / 10000).toLocaleString()}만원</td>
                                  <td className="py-3">{m.bonusPoints.toLocaleString()}P</td>
                                  <td className="py-3">{m.discountPercent}%</td>
                                  <td className="py-3">
                                    <Switch
                                      checked={m.enabled}
                                      onCheckedChange={async () => {
                                        try {
                                          await membershipTicketDefService.update(Number(m.id), { isActive: !m.enabled });
                                          await loadMemberships();
                                        } catch (e) {
                                          console.error("Failed to toggle membership", e);
                                        }
                                      }}
                                    />
                                  </td>
                                  <td className="py-3">
                                    <div className="flex justify-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEditMembershipModal(m)}
                                      >
                                        수정
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                          if (!confirm(`${m.name}을(를) 삭제하시겠습니까?`)) return;
                                          try {
                                            await membershipTicketDefService.remove(Number(m.id));
                                            await loadMemberships();
                                          } catch (e) {
                                            console.error("Failed to delete membership", e);
                                            alert("삭제에 실패했습니다.");
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            {memberships.length === 0 && (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-sm text-gray-500">
                                  등록된 회원권이 없습니다
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {/* Membership Add/Edit Modal */}
                    {(isAddingMembership || editingMembership) && membershipDraft && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="w-full max-w-md rounded-lg bg-white p-6">
                          <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-lg font-bold">
                              {editingMembership ? "회원권 수정" : "회원권 추가"}
                            </h3>
                            <button
                              onClick={closeMembershipModal}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium">회원권명</label>
                              <Input
                                value={membershipDraft.name}
                                onChange={(e) =>
                                  setMembershipDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                                }
                                placeholder="예: 골드 회원권"
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium">금액 (만원 단위)</label>
                              <Select
                                value={String(membershipDraft.amount)}
                                onChange={(e) =>
                                  setMembershipDraft((prev) => (prev ? { ...prev, amount: Number(e.target.value) } : prev))
                                }
                              >
                                {[100, 200, 300, 500, 1000, 1500, 2000, 3000, 5000].map((val) => (
                                  <option key={val} value={val * 10000}>
                                    {val}만원
                                  </option>
                                ))}
                              </Select>
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium">보너스 포인트</label>
                              <Input
                                type="number"
                                min="0"
                                value={membershipDraft.bonusPoints || ""}
                                onChange={(e) =>
                                  setMembershipDraft((prev) =>
                                    prev ? { ...prev, bonusPoints: e.target.value === "" ? 0 : Number(e.target.value) } : prev
                                  )
                                }
                                placeholder="0"
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium">추가 할인율 (%)</label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={membershipDraft.discountPercent || ""}
                                onChange={(e) =>
                                  setMembershipDraft((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          discountPercent: e.target.value === "" ? 0 : Math.min(100, Math.max(0, Number(e.target.value))),
                                        }
                                      : prev
                                  )
                                }
                                placeholder="0"
                              />
                            </div>
                          </div>

                          <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={closeMembershipModal}>
                              취소
                            </Button>
                            <Button
                              variant="primary"
                              disabled={!membershipDraft.name.trim()}
                              onClick={async () => {
                                if (!membershipDraft.name.trim()) return;
                                try {
                                  if (editingMembership) {
                                    await membershipTicketDefService.update(Number(membershipDraft.id), {
                                      name: membershipDraft.name,
                                      originalPrice: membershipDraft.amount,
                                      bonusPoint: membershipDraft.bonusPoints,
                                      discount: membershipDraft.discountPercent,
                                      isActive: membershipDraft.enabled,
                                    });
                                  } else {
                                    await membershipTicketDefService.create({
                                      name: membershipDraft.name,
                                      originalPrice: membershipDraft.amount,
                                      bonusPoint: membershipDraft.bonusPoints,
                                      discount: membershipDraft.discountPercent,
                                      isActive: membershipDraft.enabled,
                                    });
                                  }
                                  await loadMemberships();
                                  closeMembershipModal();
                                } catch (e) {
                                  console.error("Failed to save membership", e);
                                  alert("저장에 실패했습니다.");
                                }
                              }}
                            >
                              {editingMembership ? "수정" : "추가"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                )}
      </div>
    </div>
  );
}



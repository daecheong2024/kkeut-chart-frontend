import React, { useMemo, useState, useEffect } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Switch } from "../../components/ui/Switch";
import { chartConfigService } from "../../services/chartConfigService";
import { memberConfigService } from "../../services/memberConfigService";
import type {
  ChartConfigSettings,
  ChartWaitListItem,
  VisitPurposeItem,
  StatusItem,
  CouponItem,
  ChartMemoSection,
  ProcedureTodoStatsProcedureGroupRule,
  ChartStatusTransitionRule,
} from "../../types/settings";
import { ArrowDown, ArrowUp, Plus, Trash2, Check, ChevronDown } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import {
  STATUS_TRANSITION_ANY_LOCATION,
} from "../../utils/statusTransitionResolver";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const STATUS_COLOR_PRESETS: { hex: string; label: string }[] = [
  { hex: "#D27A8C", label: "로즈" },
  { hex: "#F49EAF", label: "라이트로즈" },
  { hex: "#8B3F50", label: "와인" },
  { hex: "#F59E0B", label: "앰버" },
  { hex: "#FBBF24", label: "옐로우" },
  { hex: "#84CC16", label: "라임" },
  { hex: "#10B981", label: "에메랄드" },
  { hex: "#14B8A6", label: "틸" },
  { hex: "#06B6D4", label: "시안" },
  { hex: "#3B82F6", label: "블루" },
  { hex: "#6366F1", label: "인디고" },
  { hex: "#8B5CF6", label: "바이올렛" },
  { hex: "#A855F7", label: "퍼플" },
  { hex: "#EC4899", label: "핑크" },
  { hex: "#6B7280", label: "그레이" },
  { hex: "#1F2937", label: "다크" },
];

function isValidHex(s: string): boolean {
  return /^#([0-9A-Fa-f]{6})$/.test(s);
}

function RadialColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => { setHexInput(value); }, [value]);

  const handleHexChange = (raw: string) => {
    let v = raw.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    setHexInput(v);
    if (isValidHex(v)) onChange(v.toUpperCase());
  };

  const normalizedValue = value.toUpperCase();

  return (
    <div className="space-y-3">
      {/* Preset palette */}
      <div className="grid grid-cols-8 gap-2">
        {STATUS_COLOR_PRESETS.map((c) => {
          const active = c.hex.toUpperCase() === normalizedValue;
          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => onChange(c.hex)}
              title={`${c.label} ${c.hex}`}
              className={`relative h-9 w-9 rounded-lg border-2 transition-all hover:scale-110 ${
                active
                  ? "border-[#5C2A35] ring-2 ring-[#D27A8C]/40 shadow-md"
                  : "border-white shadow-sm hover:border-slate-200"
              }`}
              style={{ backgroundColor: c.hex }}
            >
              {active && (
                <svg
                  className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {/* Preview + hex + native picker */}
      <div className="flex items-center gap-2.5 rounded-lg border border-[rgb(var(--kkeut-border))] bg-[#FCF7F8] px-3 py-2">
        <div
          className="h-9 w-9 shrink-0 rounded-lg border border-white shadow-sm"
          style={{ backgroundColor: value }}
        />
        <div className="flex-1">
          <div className="text-[10px] font-bold text-[#8B3F50] tracking-wider uppercase mb-0.5">HEX</div>
          <input
            type="text"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            placeholder="#D27A8C"
            maxLength={7}
            className="w-full bg-transparent text-[13px] font-mono font-bold text-[#5C2A35] outline-none uppercase"
          />
        </div>
        <label
          className="relative cursor-pointer rounded-lg border border-[#F8DCE2] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#8B3F50] hover:bg-[#FCEBEF] transition-colors"
          title="커스텀 색상 선택"
        >
          + 직접 선택
          <input
            type="color"
            value={isValidHex(value) ? value : "#D27A8C"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}

function getTransitionLocationOptions(
  waitLists: ChartWaitListItem[],
) {
  const dedupe = new Map<string, string>();
  dedupe.set(STATUS_TRANSITION_ANY_LOCATION, "전체 위치");
  for (const waitList of waitLists || []) {
    const id = String(waitList.id || "").trim();
    const label = String(waitList.label || "").trim();
    if (!id || !label) continue;
    if (!dedupe.has(id)) dedupe.set(id, label);
  }
  return Array.from(dedupe.entries()).map(([id, label]) => ({ id, label }));
}

function sortByOrder<T extends { order: number }>(arr: T[]): T[] {
  return arr.slice().sort((a, b) => a.order - b.order);
}

function moveItem<T extends { id: string; order: number }>(items: T[], id: string, dir: "up" | "down") {
  const sorted = sortByOrder(items);
  const idx = sorted.findIndex((x) => x.id === id);
  if (idx < 0) return items;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return items;
  const a = sorted[idx];
  const b = sorted[swapIdx];
  const next = sorted.map((x) => ({ ...x }));
  if (!next[idx] || !next[swapIdx]) return items;
  next[idx].order = b?.order ?? 0;
  next[swapIdx].order = a?.order ?? 0;
  return next;
}

function sanitizeAlertMinutes(value?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 20;
  return Math.min(720, Math.max(1, Math.round(n)));
}

function normalizeRuleKeywords(input: string): string[] {
  const parts = input.split(",").map((v) => v.trim());
  const cleaned = parts.filter((v) => v.length > 0);
  if (input.endsWith(",") || input.endsWith(", ")) {
    cleaned.push("");
  }
  return cleaned;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-sm">
      <div className="text-lg font-extrabold">{title}</div>
      {desc && <div className="mt-2 text-sm text-gray-600">{desc}</div>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

type CustomSelectOption = {
  value: string;
  label: string;
  muted?: boolean;
};

function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const selected = options.find((option) => option.value === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        className={`flex h-12 w-full items-center justify-center gap-1 rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 text-center text-sm font-semibold shadow-sm transition ${disabled ? "cursor-not-allowed text-gray-400" : "text-gray-800 hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.03)]"}`}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        <span className={`truncate min-w-0 ${selected?.muted ? "text-gray-500" : ""}`}>
          {selected?.label || placeholder || "선택"}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-[80] mt-1 min-w-full w-max max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">선택 가능한 항목이 없습니다.</div>
          ) : (
            options.map((option) => {
              const selectedOption = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${selectedOption ? "bg-[rgba(var(--kkeut-primary),.12)] text-[rgb(var(--kkeut-primary-strong))] font-bold" : "text-slate-700 hover:bg-[rgba(var(--kkeut-primary),.07)]"} ${option.muted ? "text-gray-500" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  {selectedOption ? <Check className="h-4 w-4" /> : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const defaultChartConfig: ChartConfigSettings = {
  waitLists: [],
  visitPurposes: [],
  statuses: [],
  statusRules: {
    tabletReceptionStatusId: '',
    sendDefaultStatusId: '',
    startProgressStatusId: '',
    applyWaitOrderSorting: true,
    statusTransitions: [],
    todoPerformerJobTitleIds: [],
    paymentAssigneeJobTitleIds: [],
    receptionDoctorJobTitleIds: [],
    procedureTodoStatsProcedureGroups: [],
  },
  memoSections: [],
  coupons: [],
  patientTags: [],
};

type SimpleEditorKind = "waitList" | "visitPurpose" | "status" | "coupon";

type SimpleEditorState = {
  kind: SimpleEditorKind;
  mode: "create" | "edit";
  id?: string;
  label: string;
  enabled: boolean;
  colorHex: string;
  alertEnabled: boolean;
  alertAfterMinutes: number;
  allowPerPatientAlertMinutes: boolean;
  isCompletionStatus: boolean;
  discountPercent: number;
  createdAt: string;
};

function getSimpleEditorTitle(kind: SimpleEditorKind, mode: "create" | "edit"): string {
  if (kind === "waitList") return mode === "create" ? "대기리스트 추가" : "대기리스트 수정";
  if (kind === "visitPurpose") return mode === "create" ? "방문목적 추가" : "방문목적 수정";
  if (kind === "status") return mode === "create" ? "상태 추가" : "상태 수정";
  return mode === "create" ? "쿠폰 등록" : "쿠폰 수정";
}

function getSimpleEditorPlaceholder(kind: SimpleEditorKind): string {
  if (kind === "waitList") return "예: 후수납";
  if (kind === "visitPurpose") return "예: 제모";
  if (kind === "status") return "예: 진행중";
  return "예: 신규 고객 쿠폰";
}

export default function ChartSettingsPage() {
  const { settings, updateSettings } = useSettingsStore(); // [CHANGED] Extract updateSettings
  const activeBranchId = settings.activeBranchId;
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(activeBranchId);
  if (permLoaded && !permissions["settings.chart"]) return <NoPermissionOverlay />;

  const [draft, setDraft] = useState<ChartConfigSettings>(defaultChartConfig);
  const [original, setOriginal] = useState<ChartConfigSettings>(defaultChartConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jobTitles, setJobTitles] = useState<Array<{ id: string; name: string; order: number }>>([]);

  const [simpleEditor, setSimpleEditor] = useState<SimpleEditorState | null>(null);
  const [simpleEditorError, setSimpleEditorError] = useState("");

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(original),
    [draft, original]
  );

  // Load from backend on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        console.log("ChartSettingsPage: loading config for branch:", activeBranchId);
        if (!activeBranchId) return;
        setLoading(true);
        const data = await chartConfigService.get(activeBranchId);
        console.log("ChartSettingsPage: fetched data:", data);
        const incoming = data || defaultChartConfig;
        const config: ChartConfigSettings = {
          ...incoming,
          statusRules: {
            ...defaultChartConfig.statusRules,
            ...(incoming.statusRules || {}),
            statusTransitions: (incoming.statusRules?.statusTransitions || []).map((rule) => ({
              ...rule,
              enabled: rule.enabled !== false,
            })),
          },
        };
        setDraft(config);
        setOriginal(config);

        // [NEW] Sync store on load to ensure consistency if backend has data
        updateSettings({ chartConfig: config });
      } catch (error) {
        console.error('Failed to load chart config:', error);
        setDraft(defaultChartConfig);
        setOriginal(defaultChartConfig);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [activeBranchId, updateSettings]); // [CHANGED] Added updateSettings dependency

  useEffect(() => {
    const loadJobTitles = async () => {
      try {
        const jobs = await memberConfigService.getJobTitles();
        setJobTitles(
          jobs
            .map((j) => ({ id: String(j.id), name: j.name, order: j.displayOrder }))
            .sort((a, b) => a.order - b.order)
        );
      } catch (e) {
        console.error("Failed to load job titles for chart settings", e);
        setJobTitles([]);
      }
    };
    void loadJobTitles();
  }, [activeBranchId]);

  const save = async () => {
    try {
      if (!activeBranchId) {
        alert("지점이 선택되지 않았습니다.");
        return;
      }
      setSaving(true);
      const saved = await chartConfigService.update(activeBranchId, draft);
      setOriginal(saved);

      // [NEW] Update global store settings so other components (WaitView) reflect changes immediately
      updateSettings({ chartConfig: saved });

      alert("저장되었습니다.");
    } catch (error) {
      console.error('Failed to save chart config:', error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<ChartConfigSettings>) => setDraft((p) => ({ ...p, ...patch }));
  const openSimpleEditor = (
    kind: SimpleEditorKind,
    item?: Partial<SimpleEditorState> & { id: string; label: string; enabled: boolean }
  ) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setSimpleEditor({
      kind,
      mode: item ? "edit" : "create",
      id: item?.id,
      label: item?.label || "",
      enabled: item?.enabled ?? true,
      colorHex: item?.colorHex || "#A3A3A3",
      alertEnabled: item?.alertEnabled ?? false,
      alertAfterMinutes: sanitizeAlertMinutes(item?.alertAfterMinutes),
      allowPerPatientAlertMinutes: item?.allowPerPatientAlertMinutes ?? false,
      isCompletionStatus: item?.isCompletionStatus ?? false,
      discountPercent: Math.min(100, Math.max(0, Math.round(Number(item?.discountPercent ?? 5)))),
      createdAt: item?.createdAt || `${yyyy}-${mm}-${dd}`,
    });
    setSimpleEditorError("");
  };
  const closeSimpleEditor = () => {
    setSimpleEditor(null);
    setSimpleEditorError("");
  };
  const saveSimpleEditor = () => {
    if (!simpleEditor) return;
    const label = simpleEditor.label.trim();
    if (!label) {
      setSimpleEditorError("이름을 입력해 주세요.");
      return;
    }

    if (simpleEditor.kind === "waitList") {
      if (simpleEditor.mode === "create") {
        const next: ChartWaitListItem = {
          id: uid("w"),
          label,
          enabled: simpleEditor.enabled,
          order: ((draft.waitLists || []).reduce((m, x) => Math.max(m, x.order), 0) || 0) + 1,
        };
        update({ waitLists: [...(draft.waitLists || []), next] });
      } else {
        update({
          waitLists: (draft.waitLists || []).map((x) =>
            x.id === simpleEditor.id ? { ...x, label, enabled: simpleEditor.enabled } : x
          ),
        });
      }
      closeSimpleEditor();
      return;
    }

    if (simpleEditor.kind === "visitPurpose") {
      if (simpleEditor.mode === "create") {
        const next: VisitPurposeItem = {
          id: uid("vp"),
          label,
          enabled: simpleEditor.enabled,
          order: ((draft.visitPurposes || []).reduce((m, x) => Math.max(m, x.order), 0) || 0) + 1,
        };
        update({ visitPurposes: [...(draft.visitPurposes || []), next] });
      } else {
        update({
          visitPurposes: (draft.visitPurposes || []).map((x) =>
            x.id === simpleEditor.id ? { ...x, label, enabled: simpleEditor.enabled } : x
          ),
        });
      }
      closeSimpleEditor();
      return;
    }

    if (simpleEditor.kind === "status") {
      const nextColor = (simpleEditor.colorHex || "#A3A3A3").trim() || "#A3A3A3";
      const nextAlertMinutes = sanitizeAlertMinutes(simpleEditor.alertAfterMinutes);
      if (simpleEditor.mode === "create") {
        const next: StatusItem = {
          id: uid("s"),
          label,
          enabled: simpleEditor.enabled,
          order: ((draft.statuses || []).reduce((m, x) => Math.max(m, x.order), 0) || 0) + 1,
          colorHex: nextColor,
          alertEnabled: simpleEditor.alertEnabled,
          alertAfterMinutes: nextAlertMinutes,
          allowPerPatientAlertMinutes: simpleEditor.allowPerPatientAlertMinutes,
          isCompletionStatus: simpleEditor.isCompletionStatus,
        };
        update({ statuses: [...(draft.statuses || []), next] });
      } else {
        update({
          statuses: (draft.statuses || []).map((x) =>
            x.id === simpleEditor.id
              ? {
                  ...x,
                  label,
                  enabled: simpleEditor.enabled,
                  colorHex: nextColor,
                  alertEnabled: simpleEditor.alertEnabled,
                  alertAfterMinutes: nextAlertMinutes,
                  allowPerPatientAlertMinutes: simpleEditor.allowPerPatientAlertMinutes,
                  isCompletionStatus: simpleEditor.isCompletionStatus,
                }
              : x
          ),
        });
      }
      closeSimpleEditor();
      return;
    }

    if (simpleEditor.kind === "coupon") {
      const discountPercent = Math.min(100, Math.max(0, Math.round(Number(simpleEditor.discountPercent || 0))));
      if (simpleEditor.mode === "create") {
        const next: CouponItem = {
          id: uid("c"),
          label,
          enabled: simpleEditor.enabled,
          order: ((draft.coupons || []).reduce((m, x) => Math.max(m, x.order), 0) || 0) + 1,
          discountPercent,
          createdAt: simpleEditor.createdAt,
        };
        update({ coupons: [...(draft.coupons || []), next] });
      } else {
        update({
          coupons: (draft.coupons || []).map((x) =>
            x.id === simpleEditor.id
              ? {
                  ...x,
                  label,
                  enabled: simpleEditor.enabled,
                  discountPercent,
                  createdAt: simpleEditor.createdAt || x.createdAt,
                }
              : x
          ),
        });
      }
      closeSimpleEditor();
      return;
    }
  };
  const updateStatusRules = (patch: Partial<NonNullable<ChartConfigSettings["statusRules"]>>) => {
    update({
      statusRules: {
        ...defaultChartConfig.statusRules,
        ...(draft.statusRules || {}),
        ...patch,
      },
    });
  };
  const transitionLocationOptions = useMemo(
    () => getTransitionLocationOptions(draft.waitLists || []),
    [draft.waitLists]
  );
  const addStatusTransitionRule = () => {
    const fallbackStatusId =
      sortByOrder(draft.statuses || []).find((status) => status.enabled)?.id ||
      draft.statusRules?.sendDefaultStatusId ||
      draft.statusRules?.startProgressStatusId ||
      "";
    const nextRule: ChartStatusTransitionRule = {
      id: uid("st"),
      actionType: "drag_move",
      fromLocationId: STATUS_TRANSITION_ANY_LOCATION,
      toLocationId: STATUS_TRANSITION_ANY_LOCATION,
      defaultStatusId: fallbackStatusId,
      enabled: true,
      order: (draft.statusRules?.statusTransitions || []).length + 1,
    };
    updateStatusRules({
      statusTransitions: [...(draft.statusRules?.statusTransitions || []), nextRule],
    });
  };
  const allStatusOptions = useMemo(
    () =>
      sortByOrder(draft.statuses || []).map((status) => ({
        value: status.id,
        label: status.label,
      })),
    [draft.statuses]
  );
  const enabledStatusOptions = useMemo(
    () =>
      (draft.statuses || [])
        .filter((status) => status.enabled)
        .map((status) => ({
          value: status.id,
          label: status.label,
        })),
    [draft.statuses]
  );
  const transitionActionOptions = useMemo(
    () =>
      ((draft.statusRules as any)?.transitionActionOptions || []).map((option: any) => ({
        value: option.value,
        label: option.label,
      })),
    [(draft.statusRules as any)?.transitionActionOptions]
  );
  const transitionLocationSelectOptions = useMemo(
    () =>
      transitionLocationOptions.map((option) => ({
        value: option.id,
        label: option.label,
        muted: option.id === STATUS_TRANSITION_ANY_LOCATION,
      })),
    [transitionLocationOptions]
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <TopBar title="설정 > 차트" />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="설정 > 차트" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold">차트 설정</div>
            <div className="mt-1 text-sm text-gray-600">
              대기리스트 / 방문목적 / 상태 / 쿠폰 등 차트 UI 기준 데이터를 세팅합니다.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
            <Button variant="outline" onClick={() => setDraft(original)} disabled={saving}>
              되돌리기
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {/* 대기리스트 */}
          <Section title="대기리스트" desc="차트/대기 화면에서 사용하는 대기 위치 목록입니다.">
            <div className="space-y-2">
              {sortByOrder(draft.waitLists || []).map((w) => (
                <div key={w.id} className="flex items-center gap-2 rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                  <Switch
                    checked={w.enabled}
                    onCheckedChange={(v) =>
                      update({
                        waitLists: (draft.waitLists || []).map((x) => (x.id === w.id ? { ...x, enabled: v } : x)),
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                      onClick={() => openSimpleEditor("waitList", { id: w.id, label: w.label, enabled: w.enabled })}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-800">{w.label || "이름 없음"}</span>
                        <span className="text-[11px] font-semibold text-slate-500">수정</span>
                      </div>
                    </button>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      disabled={w.isInitialReception}
                      className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold transition ${w.isInitialReception ? "border-blue-300 bg-blue-100 text-blue-700 cursor-default" : "border-slate-200 bg-white text-slate-400 hover:border-blue-200 hover:text-blue-500"}`}
                      onClick={() => {
                        if (w.isInitialReception) return;
                        update({
                          waitLists: (draft.waitLists || []).map((x) => ({
                            ...x,
                            isInitialReception: x.id === w.id,
                          })),
                        });
                      }}
                      title="접수 시 환자가 배치되는 초기 위치"
                    >
                      접수후위치
                    </button>
                    <button
                      type="button"
                      disabled={w.isCompletionLocation}
                      className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold transition ${w.isCompletionLocation ? "border-green-300 bg-green-100 text-green-700 cursor-default" : "border-slate-200 bg-white text-slate-400 hover:border-green-200 hover:text-green-500"}`}
                      onClick={() => {
                        if (w.isCompletionLocation) return;
                        update({
                          waitLists: (draft.waitLists || []).map((x) => ({
                            ...x,
                            isCompletionLocation: x.id === w.id,
                          })),
                        });
                      }}
                      title="완료 시 환자가 이동하는 위치"
                    >
                      완료후위치
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => update({ waitLists: moveItem(draft.waitLists || [], w.id, "up") })}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => update({ waitLists: moveItem(draft.waitLists || [], w.id, "down") })}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => update({ waitLists: (draft.waitLists || []).filter((x) => x.id !== w.id) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button
                variant="outline"
                onClick={() => openSimpleEditor("waitList")}
              >
                <Plus className="h-4 w-4" />
                추가
              </Button>
            </div>
          </Section>

          {/* 방문목적 */}
          <Section title="방문목적" desc="접수/예약 시 선택하는 방문목적(카테고리)입니다.">
            <div className="space-y-2">
              {sortByOrder(draft.visitPurposes || []).map((p) => (
                <div key={p.id} className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={(v) =>
                        update({
                          visitPurposes: (draft.visitPurposes || []).map((x) => (x.id === p.id ? { ...x, enabled: v } : x)),
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                        onClick={() => openSimpleEditor("visitPurpose", { id: p.id, label: p.label, enabled: p.enabled })}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-slate-800">{p.label || "이름 없음"}</span>
                          <span className="text-[11px] font-semibold text-slate-500">수정</span>
                        </div>
                      </button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => update({ visitPurposes: moveItem(draft.visitPurposes || [], p.id, "up") })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ visitPurposes: moveItem(draft.visitPurposes || [], p.id, "down") })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => update({ visitPurposes: (draft.visitPurposes || []).filter((x) => x.id !== p.id) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button
                variant="outline"
                onClick={() => openSimpleEditor("visitPurpose")}
              >
                <Plus className="h-4 w-4" />
                추가
              </Button>
            </div>
          </Section>

          {/* 상태 규칙 + 상태 목록 */}
          <div className="xl:col-span-2">
          <Section title="상태 규칙" desc="태블릿 접수/보내기/진행하기 시 기본 상태를 지정합니다.">
            <div className="space-y-3">
              <div className="grid gap-3">
                <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-1">환자가 태블릿으로 접수요청하면*</div>
                    <CustomSelect
                      value={draft.statusRules?.tabletReceptionStatusId || ""}
                      onChange={(nextValue) => updateStatusRules({ tabletReceptionStatusId: nextValue })}
                      options={allStatusOptions}
                      placeholder="상태 선택"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-1">'보내기' 상태 기본값</div>
                    <CustomSelect
                      value={draft.statusRules?.sendDefaultStatusId || ""}
                      onChange={(nextValue) => updateStatusRules({ sendDefaultStatusId: nextValue })}
                      options={allStatusOptions}
                      placeholder="상태 선택"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-1">'진행하기' 선택하면</div>
                    <CustomSelect
                      value={draft.statusRules?.startProgressStatusId || ""}
                      onChange={(nextValue) => updateStatusRules({ startProgressStatusId: nextValue })}
                      options={allStatusOptions}
                      placeholder="상태 선택"
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold">환자 대기 순서 반영</div>
                      <div className="mt-1 text-xs text-gray-500">(상태 순서에 따라 환자 순서를 정렬해요.)</div>
                    </div>
                    <Switch
                      checked={draft.statusRules?.applyWaitOrderSorting ?? true}
                      onCheckedChange={(v) => updateStatusRules({ applyWaitOrderSorting: v })}
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold">위치 이동별 기본 상태</div>
                    <div className="mt-1 text-xs text-gray-500">
                      대기차트/통합차트에서 환자를 이동할 때, From → To + 액션 기준으로 상태를 자동 지정합니다.
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={addStatusTransitionRule}>
                    <Plus className="h-4 w-4" />
                    규칙 추가
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
{(draft.statusRules?.statusTransitions || [])
                    .slice()
                    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
                    .map((rule, idx) => (
                      <div key={rule.id} className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                        <CustomSelect
                          value={rule.actionType || "any"}
                          onChange={(nextValue) => {
                            const next = (draft.statusRules?.statusTransitions || []).map((item) =>
                              item.id === rule.id ? { ...item, actionType: nextValue as any } : item
                            );
                            updateStatusRules({ statusTransitions: next });
                          }}
                          options={transitionActionOptions}
                          placeholder="액션"
                        />

                        <CustomSelect
                          value={rule.fromLocationId || STATUS_TRANSITION_ANY_LOCATION}
                          onChange={(nextValue) => {
                            const next = (draft.statusRules?.statusTransitions || []).map((item) =>
                              item.id === rule.id ? { ...item, fromLocationId: nextValue } : item
                            );
                            updateStatusRules({ statusTransitions: next });
                          }}
                          options={transitionLocationSelectOptions}
                          placeholder="출발 위치"
                        />

                        <CustomSelect
                          value={rule.toLocationId || STATUS_TRANSITION_ANY_LOCATION}
                          onChange={(nextValue) => {
                            const next = (draft.statusRules?.statusTransitions || []).map((item) =>
                              item.id === rule.id ? { ...item, toLocationId: nextValue } : item
                            );
                            updateStatusRules({ statusTransitions: next });
                          }}
                          options={transitionLocationSelectOptions}
                          placeholder="도착 위치"
                        />

                        <CustomSelect
                          value={rule.defaultStatusId || ""}
                          onChange={(nextValue) => {
                            const next = (draft.statusRules?.statusTransitions || []).map((item) =>
                              item.id === rule.id ? { ...item, defaultStatusId: nextValue } : item
                            );
                            updateStatusRules({ statusTransitions: next });
                          }}
                          options={enabledStatusOptions}
                          placeholder="기본 상태"
                        />

                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          <Switch
                            checked={rule.enabled !== false}
                            onCheckedChange={(checked) => {
                              const next = (draft.statusRules?.statusTransitions || []).map((item) =>
                                item.id === rule.id ? { ...item, enabled: checked } : item
                              );
                              updateStatusRules({ statusTransitions: next });
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const rules = [...(draft.statusRules?.statusTransitions || [])];
                              const index = rules.findIndex((item) => item.id === rule.id);
                              if (index <= 0) return;
                              const prev = rules[index - 1];
                              if (!prev) return;
                              rules[index - 1] = { ...rule, order: prev.order ?? index };
                              rules[index] = { ...prev, order: rule.order ?? idx + 1 };
                              updateStatusRules({ statusTransitions: rules });
                            }}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const rules = [...(draft.statusRules?.statusTransitions || [])];
                              const index = rules.findIndex((item) => item.id === rule.id);
                              if (index < 0 || index >= rules.length - 1) return;
                              const nextRule = rules[index + 1];
                              if (!nextRule) return;
                              rules[index + 1] = { ...rule, order: nextRule.order ?? idx + 2 };
                              rules[index] = { ...nextRule, order: rule.order ?? idx + 1 };
                              updateStatusRules({ statusTransitions: rules });
                            }}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const next = (draft.statusRules?.statusTransitions || []).filter((item) => item.id !== rule.id);
                              updateStatusRules({ statusTransitions: next });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                  {(draft.statusRules?.statusTransitions || []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-xs text-gray-500">
                      등록된 전이 규칙이 없습니다. 기본값(보내기/진행하기 + 위치 fallback)으로 동작합니다.
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                <div className="text-sm font-extrabold">할일 진행 가능 직군</div>
                <div className="mt-1 text-xs text-gray-500">
                  체크된 직군만 할일 담당자 드롭다운에 노출됩니다.
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {jobTitles.map((job) => {
                    const selected = (draft.statusRules?.todoPerformerJobTitleIds || []).includes(job.id);
                    return (
                      <label
                        key={job.id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-gray-700">{job.name}</span>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = draft.statusRules?.todoPerformerJobTitleIds || [];
                            const next = e.target.checked
                              ? [...current, job.id]
                              : current.filter((id) => id !== job.id);
                            update({
                              statusRules: {
                                ...(draft.statusRules || {
                                  tabletReceptionStatusId: "",
                                  sendDefaultStatusId: "",
                                  startProgressStatusId: "",
                                  applyWaitOrderSorting: true,
                                  receptionDoctorJobTitleIds: [],
                                  procedureTodoStatsProcedureGroups: [],
                                }),
                                todoPerformerJobTitleIds: next
                              } as any
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                <div className="text-sm font-extrabold">수납 할당 가능 직군</div>
                <div className="mt-1 text-xs text-gray-500">
                  체크된 직군만 수납 모달의 수납담당자 드롭다운에 노출됩니다.
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {jobTitles.map((job) => {
                    const selected = (draft.statusRules?.paymentAssigneeJobTitleIds || []).includes(job.id);
                    return (
                      <label
                        key={`payment-assignee-${job.id}`}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-gray-700">{job.name}</span>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = draft.statusRules?.paymentAssigneeJobTitleIds || [];
                            const next = e.target.checked
                              ? [...current, job.id]
                              : current.filter((id) => id !== job.id);
                            update({
                              statusRules: {
                                ...(draft.statusRules || {
                                  tabletReceptionStatusId: "",
                                  sendDefaultStatusId: "",
                                  startProgressStatusId: "",
                                  applyWaitOrderSorting: true,
                                  receptionDoctorJobTitleIds: [],
                                  procedureTodoStatsProcedureGroups: [],
                                }),
                                paymentAssigneeJobTitleIds: next
                              } as any
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                <div className="text-sm font-extrabold">접수 담당의 직군</div>
                <div className="mt-1 text-xs text-gray-500">
                  체크된 직군에 속한 멤버만 접수창의 <b>담당의</b> 드롭다운에 노출됩니다. (미선택 시 전체 멤버 표시)
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {jobTitles.map((job) => {
                    const selected = (draft.statusRules?.receptionDoctorJobTitleIds || []).includes(job.id);
                    return (
                      <label
                        key={`reception-doctor-${job.id}`}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-gray-700">{job.name}</span>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = draft.statusRules?.receptionDoctorJobTitleIds || [];
                            const next = e.target.checked
                              ? [...current, job.id]
                              : current.filter((id) => id !== job.id);
                            update({
                              statusRules: {
                                ...(draft.statusRules || {
                                  tabletReceptionStatusId: "",
                                  sendDefaultStatusId: "",
                                  startProgressStatusId: "",
                                  applyWaitOrderSorting: true,
                                  procedureTodoStatsProcedureGroups: [],
                                }),
                                receptionDoctorJobTitleIds: next
                              } as any
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold">할일 통계 시술 묶음</div>
                    <div className="mt-1 text-xs text-gray-500">
                      여러 시술명을 하나의 통계 항목으로 묶어 집계합니다. 예) 제모
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const current = draft.statusRules?.procedureTodoStatsProcedureGroups || [];
                      const nextRule: ProcedureTodoStatsProcedureGroupRule = {
                        id: uid("todo_group"),
                        name: "",
                        keywords: [],
                      };
                      update({
                        statusRules: {
                          ...(draft.statusRules || {
                            tabletReceptionStatusId: "",
                            sendDefaultStatusId: "",
                            startProgressStatusId: "",
                            applyWaitOrderSorting: true,
                            todoPerformerJobTitleIds: [],
                            paymentAssigneeJobTitleIds: [],
                            receptionDoctorJobTitleIds: [],
                            procedureTodoStatsProcedureGroups: [],
                          }),
                          procedureTodoStatsProcedureGroups: [...current, nextRule],
                        } as any
                      });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    규칙 추가
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {(draft.statusRules?.procedureTodoStatsProcedureGroups || []).map((rule) => (
                    <div
                      key={rule.id}
                      className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[180px_minmax(0,1fr)_auto]"
                    >
                      <Input
                        value={rule.name}
                        placeholder="통계 항목명 (예: 제모)"
                        onChange={(e) => {
                          const current = draft.statusRules?.procedureTodoStatsProcedureGroups || [];
                          const next = current.map((item) =>
                            item.id === rule.id
                              ? { ...item, name: e.target.value }
                              : item
                          );
                          update({
                            statusRules: {
                              ...(draft.statusRules || {
                                tabletReceptionStatusId: "",
                                sendDefaultStatusId: "",
                                startProgressStatusId: "",
                                applyWaitOrderSorting: true,
                                todoPerformerJobTitleIds: [],
                                paymentAssigneeJobTitleIds: [],
                                receptionDoctorJobTitleIds: [],
                                procedureTodoStatsProcedureGroups: [],
                              }),
                              procedureTodoStatsProcedureGroups: next,
                            } as any
                          });
                        }}
                      />
                      <Input
                        value={(rule.keywords || []).join(", ")}
                        placeholder="키워드 콤마 구분 (예: 제모, 인중제모, 겨드랑이제모)"
                        onChange={(e) => {
                          const current = draft.statusRules?.procedureTodoStatsProcedureGroups || [];
                          const next = current.map((item) =>
                            item.id === rule.id
                              ? { ...item, keywords: normalizeRuleKeywords(e.target.value) }
                              : item
                          );
                          update({
                            statusRules: {
                              ...(draft.statusRules || {
                                tabletReceptionStatusId: "",
                                sendDefaultStatusId: "",
                                startProgressStatusId: "",
                                applyWaitOrderSorting: true,
                                todoPerformerJobTitleIds: [],
                                paymentAssigneeJobTitleIds: [],
                                receptionDoctorJobTitleIds: [],
                                procedureTodoStatsProcedureGroups: [],
                              }),
                              procedureTodoStatsProcedureGroups: next,
                            } as any
                          });
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const current = draft.statusRules?.procedureTodoStatsProcedureGroups || [];
                          const next = current.filter((item) => item.id !== rule.id);
                          update({
                            statusRules: {
                              ...(draft.statusRules || {
                                tabletReceptionStatusId: "",
                                sendDefaultStatusId: "",
                                startProgressStatusId: "",
                                applyWaitOrderSorting: true,
                                todoPerformerJobTitleIds: [],
                                paymentAssigneeJobTitleIds: [],
                                receptionDoctorJobTitleIds: [],
                                procedureTodoStatsProcedureGroups: [],
                              }),
                              procedureTodoStatsProcedureGroups: next,
                            } as any
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {(draft.statusRules?.procedureTodoStatsProcedureGroups || []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-xs text-gray-500">
                      등록된 묶음 규칙이 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </Section>
          </div>

          <Section title="상태" desc="차트에서 사용하는 상태(라벨/색상/순서)를 관리합니다.">
            <div className="space-y-2">
              {sortByOrder(draft.statuses || []).map((s) => (
                <div key={s.id} className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(v) => update({ statuses: (draft.statuses || []).map((x) => (x.id === s.id ? { ...x, enabled: v } : x)) })}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                        onClick={() =>
                          openSimpleEditor("status", {
                            id: s.id,
                            label: s.label,
                            enabled: s.enabled,
                            colorHex: s.colorHex,
                            alertEnabled: Boolean(s.alertEnabled),
                            alertAfterMinutes: sanitizeAlertMinutes(s.alertAfterMinutes),
                            allowPerPatientAlertMinutes: Boolean(s.allowPerPatientAlertMinutes),
                            isCompletionStatus: Boolean(s.isCompletionStatus),
                          })
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-800">{s.label || "이름 없음"}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {s.isCompletionStatus ? "완료 상태 · " : ""}
                              {s.alertEnabled
                                ? `지연알림 ${sanitizeAlertMinutes(s.alertAfterMinutes)}분 · 환자별 ${s.allowPerPatientAlertMinutes ? "허용" : "미허용"}`
                                : "지연알림 미사용"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: s.colorHex }} />
                            <span className="text-[11px] font-semibold text-slate-500">수정</span>
                          </div>
                        </div>
                      </button>
                    </div>

                    <Button variant="outline" size="sm" onClick={() => update({ statuses: moveItem(draft.statuses || [], s.id, "up") })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ statuses: moveItem(draft.statuses || [], s.id, "down") })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ statuses: (draft.statuses || []).filter((x) => x.id !== s.id) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button variant="outline" onClick={() => openSimpleEditor("status")}>
                <Plus className="h-4 w-4" />
                상태 추가
              </Button>
            </div>
          </Section>

          {/* 쿠폰 */}
          <Section title="쿠폰 관리" desc="결제/혜택 화면에서 사용하는 쿠폰을 관리합니다.">
            <div className="space-y-2">
              {sortByOrder(draft.coupons || []).map((c) => (
                <div key={c.id} className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={(v) => update({ coupons: (draft.coupons || []).map((x) => (x.id === c.id ? { ...x, enabled: v } : x)) })}
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                        onClick={() =>
                          openSimpleEditor("coupon", {
                            id: c.id,
                            label: c.label,
                            enabled: c.enabled,
                            discountPercent: c.discountPercent,
                            createdAt: c.createdAt,
                          })
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-800">{c.label || "이름 없음"}</div>
                            <div className="mt-1 text-[11px] text-slate-500">등록일 {c.createdAt || "-"}</div>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500">수정</span>
                        </div>
                      </button>
                    </div>
                    <div className="text-sm font-bold text-pink-500 bg-pink-50 px-3 py-1 rounded-full">-{c.discountPercent}%</div>
                    <Button variant="outline" size="sm" onClick={() => update({ coupons: moveItem(draft.coupons || [], c.id, "up") })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ coupons: moveItem(draft.coupons || [], c.id, "down") })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => update({ coupons: (draft.coupons || []).filter((x) => x.id !== c.id) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button variant="outline" onClick={() => openSimpleEditor("coupon")}>
                <Plus className="h-4 w-4" />
                쿠폰 등록
              </Button>
            </div>
          </Section>

          {/* 메모 항목 + 환자 태그 */}
          <Section title="차트 메모 항목" desc="차트 화면에서 사용하는 메모 탭(관리, 원장님상담 등)을 관리합니다.">
            <div className="space-y-2">
              {sortByOrder(draft.memoSections || []).map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={m.label}
                        className="flex-1 text-sm font-bold"
                        onChange={(e) =>
                          update({
                            memoSections: (draft.memoSections || []).map((x) =>
                              x.id === m.id ? { ...x, label: e.target.value } : x
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.showInVisitHistory !== false}
                      onChange={(e) =>
                        update({
                          memoSections: (draft.memoSections || []).map((x) =>
                            x.id === m.id ? { ...x, showInVisitHistory: e.target.checked } : x
                          ),
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    내원이력
                  </label>
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.printEnabled !== false}
                      onChange={(e) =>
                        update({
                          memoSections: (draft.memoSections || []).map((x) =>
                            x.id === m.id ? { ...x, printEnabled: e.target.checked } : x
                          ),
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    인쇄
                  </label>
                  <Button variant="outline" size="sm" onClick={() => update({ memoSections: moveItem(draft.memoSections || [], m.id, "up") })}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => update({ memoSections: moveItem(draft.memoSections || [], m.id, "down") })}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => update({ memoSections: (draft.memoSections || []).filter((x) => x.id !== m.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Section>

          {/* 환자 태그 */}
          <Section title="환자 태그" desc="신규 환자 등록 시 선택하거나 입력하는 태그 목록입니다.">
            <div className="flex flex-wrap gap-2">
              {(draft.patientTags || []).map((tag) => (
                <div key={tag} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium">
                  {tag}
                  <button
                    onClick={() => update({ patientTags: (draft.patientTags || []).filter((t) => t !== tag) })}
                    className="ml-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  className="w-32 h-8 text-sm"
                  placeholder="태그 입력"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = (e.currentTarget.value).trim();
                      if (val && !(draft.patientTags || []).includes(val)) {
                        update({ patientTags: [...(draft.patientTags || []), val] });
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => alert("엔터를 눌러 추가하세요")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Section>
        </div >
      </div >

      {simpleEditor && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
          onMouseDown={closeSimpleEditor}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-xl font-extrabold text-slate-900">
                {getSimpleEditorTitle(simpleEditor.kind, simpleEditor.mode)}
              </div>
              <div className="mt-1 text-sm text-slate-500">목록에서는 읽기만 하고, 등록/수정은 모달에서 입력합니다.</div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <div className="mb-1 text-xs font-bold text-slate-500">항목명</div>
                <Input
                  autoFocus
                  value={simpleEditor.label}
                  placeholder={getSimpleEditorPlaceholder(simpleEditor.kind)}
                  onChange={(event) => {
                    setSimpleEditor((prev) => (prev ? { ...prev, label: event.target.value } : prev));
                    if (simpleEditorError) setSimpleEditorError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveSimpleEditor();
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--kkeut-border))] bg-slate-50 px-3 py-2">
                <div>
                  <div className="text-sm font-bold text-slate-800">사용 여부</div>
                  <div className="text-[11px] text-slate-500">끄면 선택지에서 숨겨집니다.</div>
                </div>
                <Switch
                  checked={simpleEditor.enabled}
                  onCheckedChange={(checked) => setSimpleEditor((prev) => (prev ? { ...prev, enabled: checked } : prev))}
                />
              </div>

              {simpleEditor.kind === "status" && (
                <>
                  <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 py-3">
                    <div className="mb-2 text-xs font-bold text-slate-500">상태 색상</div>
                    <RadialColorPicker
                      value={simpleEditor.colorHex}
                      onChange={(hex) => setSimpleEditor((prev) => (prev ? { ...prev, colorHex: hex } : prev))}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--kkeut-border))] bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-sm font-bold text-slate-800">지연 알림 사용</div>
                      <div className="text-[11px] text-slate-500">상태 체류 시간이 기준 분을 넘으면 강조합니다.</div>
                    </div>
                    <Switch
                      checked={Boolean(simpleEditor.alertEnabled)}
                      onCheckedChange={(checked) =>
                        setSimpleEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                alertEnabled: checked,
                                alertAfterMinutes: checked ? sanitizeAlertMinutes(prev.alertAfterMinutes) : prev.alertAfterMinutes,
                              }
                            : prev
                        )
                      }
                    />
                  </div>

                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px]">
                    <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 py-2">
                      <div className="mb-1 text-xs font-bold text-slate-500">기본 지연 시간(분)</div>
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        step={1}
                        disabled={!simpleEditor.alertEnabled}
                        value={sanitizeAlertMinutes(simpleEditor.alertAfterMinutes)}
                        onChange={(event) =>
                          setSimpleEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  alertAfterMinutes: sanitizeAlertMinutes(Number(event.target.value || prev.alertAfterMinutes)),
                                }
                              : prev
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 py-2">
                      <div className="text-xs font-bold text-slate-600">환자별 설정 허용</div>
                      <Switch
                        checked={Boolean(simpleEditor.allowPerPatientAlertMinutes)}
                        disabled={!simpleEditor.alertEnabled}
                        onCheckedChange={(checked) =>
                          setSimpleEditor((prev) => (prev ? { ...prev, allowPerPatientAlertMinutes: checked } : prev))
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--kkeut-border))] bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-sm font-bold text-slate-800">완료 상태</div>
                      <div className="text-[11px] text-slate-500">이 상태로 변경되면 차트에서 완료(done)로 처리됩니다.</div>
                    </div>
                    <Switch
                      checked={Boolean(simpleEditor.isCompletionStatus)}
                      onCheckedChange={(checked) =>
                        setSimpleEditor((prev) => (prev ? { ...prev, isCompletionStatus: checked } : prev))
                      }
                    />
                  </div>
                </>
              )}

              {simpleEditor.kind === "coupon" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 py-2">
                    <div className="mb-1 text-xs font-bold text-slate-500">할인율(%)</div>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={simpleEditor.discountPercent}
                      onChange={(event) =>
                        setSimpleEditor((prev) =>
                          prev
                            ? { ...prev, discountPercent: Math.min(100, Math.max(0, Number(event.target.value || 0))) }
                            : prev
                        )
                      }
                    />
                  </div>
                  <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 py-2">
                    <div className="mb-1 text-xs font-bold text-slate-500">등록일</div>
                    <Input
                      type="date"
                      value={simpleEditor.createdAt}
                      onChange={(event) => setSimpleEditor((prev) => (prev ? { ...prev, createdAt: event.target.value } : prev))}
                    />
                  </div>
                </div>
              )}

              {simpleEditorError && <div className="text-xs font-semibold text-rose-600">{simpleEditorError}</div>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
              <Button variant="outline" onClick={closeSimpleEditor}>
                취소
              </Button>
              <Button variant="primary" onClick={saveSimpleEditor}>
                저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}



import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronDown, Circle, Clock, FileText, PlayCircle, Printer, Send, Trash2, User, X } from "lucide-react";
import { differenceInMinutes, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Patient, STATUS_CONFIG, Treatment, useChartStore } from "../../stores/useChartStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { visitService } from "../../services/visitService";
import { TodoItem } from "../../services/todoService";
import { TreatmentEditModal } from "./TreatmentEditModal";
import type { StatusItem } from "../../types/settings";

const LOCATIONS = [
  { id: "post_pay", label: "수납" },
  { id: "main_wait", label: "메인대기실" },
  { id: "wash_room", label: "세안/검진실" },
  { id: "exam_room", label: "검진실" },
  { id: "consult_room", label: "상담실" },
  { id: "mid_wait", label: "중간대기실" },
  { id: "care_1", label: "관리실1" },
  { id: "care_2", label: "관리실2" },
  { id: "hair_removal", label: "제모시술실" },
  { id: "treatment_1", label: "치료실1" },
  { id: "treatment_3", label: "치료실3" },
  { id: "proc_1", label: "시술실1" },
  { id: "proc_2", label: "시술실2" },
  { id: "go_home", label: "귀가" },
  { id: "reservation", label: "예약" },
  { id: "done", label: "완료" },
  { id: "reception", label: "접수" }
];

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
    } catch {
      return value.split(",").map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

const normalizeActor = (v?: string) => (!v || v.trim().toLowerCase() === "system" ? "" : v);

function sanitizeAlertMinutes(value?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 20;
  return Math.min(720, Math.max(1, Math.round(n)));
}

type PendingStatusAlertModal = {
  statusId: string;
  label: string;
  colorHex?: string;
  alertMinutes: string;
  defaultAlertMinutes: number;
};

type PendingAssigneeModal = {
  statusId: string;
  label: string;
  colorHex?: string;
  procedureName: string;
  alertMinutes?: number;
};

function statusRequiresAssignee(statusSetting?: StatusItem | null, statusKey?: string, label?: string): boolean {
  if (statusSetting?.requiresAssignee === true) return true;
  if (statusSetting?.requiresAssignee === false) return false;
  if (statusKey === "anesthesia" || statusKey === "proc") return true;
  const lbl = (label || "").trim();
  return /(마취|모델링)/.test(lbl);
}

type WaitCardProps = {
  patient: Patient;
  isHighlighted?: boolean;
  patientTodos?: TodoItem[];
  todoAssignableMembers?: Array<{ id: string; name: string; jobTitleName?: string }>;
  onTodoCycle?: (todo: TodoItem, actor?: string) => void;
  onTodoAssigneeChange?: (todoId: number, assignee?: string) => void;
  showTodos?: boolean;
  locationOptions?: Array<{ id: string; label: string }>;
  onMoveLocation?: (selectedPatient: Patient, nextLocationId: string) => void;
  quickAction?: {
    label: string;
    hint?: string;
    disabled?: boolean;
    busy?: boolean;
    queued?: boolean;
    compact?: boolean;
    iconTitle?: string;
    onClick: () => void;
  };
  onDragStart: (e: React.DragEvent) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: () => void;
  onStatusDropdownChange?: (isOpen: boolean) => void;
  onDelete?: () => void;
  onPrint?: () => void;
  printPreview?: string;
  onCardClick?: () => void;
  expandOnClick?: boolean;
  onAlert?: (message: string) => void;
};

export function WaitCard({
  patient,
  isHighlighted = false,
  patientTodos = [],
  todoAssignableMembers = [],
  onTodoCycle,
  onTodoAssigneeChange,
  showTodos = true,
  locationOptions,
  quickAction,
  onMoveLocation,
  onDragStart,
  onMouseEnter,
  onMouseLeave,
  onStatusDropdownChange,
  onDelete,
  onPrint,
  printPreview,
  onCardClick,
  expandOnClick = false,
  onAlert,
}: WaitCardProps) {
  const showMessage = (msg: string) => onAlert ? onAlert(msg) : alert(msg);
  const [isExpanded, setIsExpanded] = useState(false);
  const chartActions = useChartStore() as any;
  const updatePatientStatus = chartActions.updatePatientStatus as ((id: number, status: string, options?: { statusAlertMinutes?: number }) => void) | undefined;
  const toggleTreatment = chartActions.toggleTreatment as ((patientId: number, treatmentId: string) => void) | undefined;
  const updateTreatment = chartActions.updateTreatment as ((patientId: number, treatmentId: string, updates: Partial<Treatment>) => void) | undefined;
  const deleteTreatment = chartActions.deleteTreatment as ((patientId: number, treatmentId: string) => void) | undefined;

  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [selectedTreatment, setSelectedTreatment] = useState<Treatment | null>(null);
  const [todoActorById, setTodoActorById] = useState<Record<number, string>>({});
  const [pendingStatusAlertModal, setPendingStatusAlertModal] = useState<PendingStatusAlertModal | null>(null);
  const [isSavingStatusAlert, setIsSavingStatusAlert] = useState(false);
  const [pendingAssigneeModal, setPendingAssigneeModal] = useState<PendingAssigneeModal | null>(null);
  const [isSavingAssignee, setIsSavingAssignee] = useState(false);

  const waitTime = patient.lastMovedAt ? differenceInMinutes(new Date(), new Date(patient.lastMovedAt)) : 0;
  const resolvedLocationOptions =
    Array.isArray(locationOptions) && locationOptions.length > 0 ? locationOptions : LOCATIONS;
  const locationLabel =
    resolvedLocationOptions.find((l) => l.id === patient.location)?.label ||
    LOCATIONS.find((l) => l.id === patient.location)?.label ||
    "미지정";

  const dynamicStatuses = settings.chartConfig?.statuses || [];
  const useDynamicStatus = dynamicStatuses.length > 0;
  const getDynamicStatusSetting = (statusId: string): StatusItem | undefined =>
    dynamicStatuses.find((status) => status.id === statusId);

  const getStatusConfig = (statusId: string) => {
    if (useDynamicStatus) {
      const found = dynamicStatuses.find((s) => s.id === statusId);
      if (found) {
        return {
          label: found.label,
          colorHex: found.colorHex,
          color: "",
          bgColor: "",
          borderColor: ""
        };
      }
    }
    return STATUS_CONFIG[statusId] || STATUS_CONFIG.wait || { label: "대기", color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200" };
  };

  const statusConfig = getStatusConfig(patient.status);

  const isAlertTriggered = (() => {
    const status = String(patient.status || "").toLowerCase();
    if (status === "done" || status === "completed") return false;
    const statusSetting = dynamicStatuses.find((s) => String(s.id) === String(patient.status)) ?? dynamicStatuses.find((s) => s.label === patient.status);
    if (!statusSetting?.alertEnabled || !patient.lastMovedAt) {
      if (patient.name === "홍찬기") console.log("[ALERT DEBUG]", patient.name, { status: patient.status, statusSetting: statusSetting?.id, alertEnabled: statusSetting?.alertEnabled, lastMovedAt: patient.lastMovedAt, dynamicIds: dynamicStatuses.map(s => s.id + '(' + typeof s.id + ')'), patientStatus: patient.status + '(' + typeof patient.status + ')' });
      return false;
    }
    const threshold = sanitizeAlertMinutes(patient.statusAlertMinutes ?? statusSetting.alertAfterMinutes);
    if (patient.name === "홍찬기") console.log("[ALERT DEBUG]", patient.name, { waitTime, threshold, triggered: waitTime >= threshold });
    return waitTime >= threshold;
  })();

  const cardStyle = isAlertTriggered
    ? { backgroundColor: "#FEF2F2", borderColor: "#F87171" }
    : (statusConfig as any).colorHex
      ? { backgroundColor: `${(statusConfig as any).colorHex}1A`, borderColor: `${(statusConfig as any).colorHex}33` }
      : {};
  const badgeStyle = (statusConfig as any).colorHex
    ? { color: (statusConfig as any).colorHex, borderColor: `${(statusConfig as any).colorHex}33` }
    : {};
  const dropdownBaseClassName =
    "flex h-8 w-full items-center justify-between gap-1 rounded-lg border bg-white/80 px-2.5 text-[11px] font-bold shadow-sm transition-colors";

  const getTodoStatus = (todo: TodoItem): "todo" | "doing" | "done" => {
    if (todo.status === "todo" || todo.status === "doing" || todo.status === "done") return todo.status;
    return todo.isCompleted ? "done" : "todo";
  };

  const sortedPatientTodos = [...patientTodos].sort((a, b) => {
    const t = (a.createdAt || "").localeCompare(b.createdAt || "");
    if (t !== 0) return t;
    return a.id - b.id;
  });
  const canExportToDone = sortedPatientTodos.every((todo) => getTodoStatus(todo) === "done");
  const setStatusDropdownOpen = (nextOpen: boolean) => {
    setIsStatusOpen(nextOpen);
    onStatusDropdownChange?.(nextOpen);
  };
  const notifyDropdownInteraction = (isOpen: boolean) => {
    onStatusDropdownChange?.(isOpen);
  };

  const closeStatusAlertModal = () => {
    setPendingStatusAlertModal(null);
    onStatusDropdownChange?.(false);
  };

  const closeAssigneeModal = () => {
    setPendingAssigneeModal(null);
    onStatusDropdownChange?.(false);
  };

  const departmentUserGroups = (() => {
    const users = (settings.members?.users || []) as any[];
    const depts = (settings.members?.departments || []) as any[];
    const groups: { deptName: string; users: { id: number; name: string }[] }[] = [];
    for (const dept of depts) {
      const deptUsers = users
        .filter((u: any) => String(u.departmentId) === String(dept.id))
        .map((u: any) => ({ id: Number(u.id), name: String(u.name || "") }));
      if (deptUsers.length > 0) groups.push({ deptName: dept.name, users: deptUsers });
    }
    const assignedIds = new Set(users.filter((u: any) => u.departmentId).map((u: any) => String(u.id)));
    const unassigned = users
      .filter((u: any) => !assignedIds.has(String(u.id)))
      .map((u: any) => ({ id: Number(u.id), name: String(u.name || "") }));
    if (unassigned.length > 0) groups.push({ deptName: "기타", users: unassigned });
    return groups;
  })();

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    setTodoActorById((prev) => {
      const next: Record<number, string> = { ...prev };
      const todoIdSet = new Set<number>();
      let changed = false;

      for (const t of patientTodos) {
        todoIdSet.add(t.id);
        const normalizedAssignee = normalizeActor(t.assignee) || "";
        if (!Object.prototype.hasOwnProperty.call(next, t.id) || next[t.id] !== normalizedAssignee) {
          next[t.id] = normalizedAssignee;
          changed = true;
        }
      }

      for (const key of Object.keys(next)) {
        const todoId = Number(key);
        if (!todoIdSet.has(todoId)) {
          delete next[todoId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [patientTodos]);

  const applyStatusChange = async (
    statusKey: string,
    statusAlertMinutes?: number,
    extras?: { managedByUserId?: number; procedureName?: string }
  ) => {
    updatePatientStatus?.(patient.id, statusKey, { statusAlertMinutes });
    setStatusDropdownOpen(false);
    try {
      await visitService.updateVisit(patient.id, {
        status: statusKey,
        statusAlertMinutes,
        managedByUserId: extras?.managedByUserId,
        procedureName: extras?.procedureName,
      });
      return true;
    } catch (error) {
      console.error("Failed to update status:", error);
      showMessage("상태 변경에 실패했습니다.");
      return false;
    }
  };

  const handleStatusChange = async (statusKey: string) => {
    if (statusKey === "done" && !canExportToDone) {
      showMessage("할일이 모두 완료되어야 완료 상태로 변경할 수 있습니다.");
      return;
    }
    const nextStatusSetting = getDynamicStatusSetting(statusKey);
    const fallbackLabel = STATUS_CONFIG[statusKey]?.label;
    const statusLabel = nextStatusSetting?.label || fallbackLabel || statusKey;

    if (nextStatusSetting?.alertEnabled && nextStatusSetting.allowPerPatientAlertMinutes) {
      const defaultMinutes =
        patient.status === statusKey && typeof patient.statusAlertMinutes === "number"
          ? sanitizeAlertMinutes(patient.statusAlertMinutes)
          : sanitizeAlertMinutes(nextStatusSetting.alertAfterMinutes);

      setStatusDropdownOpen(false);
      setPendingStatusAlertModal({
        statusId: statusKey,
        label: nextStatusSetting.label,
        colorHex: nextStatusSetting.colorHex,
        alertMinutes: String(defaultMinutes),
        defaultAlertMinutes: sanitizeAlertMinutes(nextStatusSetting.alertAfterMinutes),
      });
      onStatusDropdownChange?.(true);
      return;
    }

    const nextAlertMinutes = nextStatusSetting?.alertEnabled
      ? sanitizeAlertMinutes(nextStatusSetting.alertAfterMinutes)
      : undefined;

    if (statusRequiresAssignee(nextStatusSetting, statusKey, statusLabel)) {
      setStatusDropdownOpen(false);
      setPendingAssigneeModal({
        statusId: statusKey,
        label: statusLabel,
        colorHex: nextStatusSetting?.colorHex,
        procedureName: statusLabel,
        alertMinutes: nextAlertMinutes,
      });
      onStatusDropdownChange?.(true);
      return;
    }

    await applyStatusChange(statusKey, nextAlertMinutes);
  };

  return (
    <>
    <div
      draggable
      onDragStart={onDragStart}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, select, input")) return;
        if (expandOnClick) { setIsExpanded(!isExpanded); return; }
        if (onCardClick) onCardClick();
      }}
      className={`border rounded-2xl p-2 hover:shadow-[0_4px_12px_rgba(226,107,124,0.08)] transition-all duration-200 ease-in-out ${onCardClick || expandOnClick ? "cursor-pointer" : "cursor-move"} group select-none relative ${!(statusConfig as any).colorHex ? `${statusConfig.bgColor} ${statusConfig.borderColor}` : ""} ${isHighlighted ? "animate-card-highlight" : ""} ${isAlertTriggered ? "animate-pulse ring-2 ring-red-400" : ""}`}
      style={cardStyle}
    >
      <div className="mb-1.5 flex flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {expandOnClick ? (
            <span className="shrink-0 text-[10px] text-[#E5B5C0] transition-transform" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          ) : (
            <button
              type="button"
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#E5B5C0] hover:text-[#D27A8C] hover:bg-[#FCEBEF] transition-all"
              style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            >▶</button>
          )}
          <span className="shrink-0 text-xs font-normal text-[#9E9E9E]">{patient.chartNo}</span>
          <span className="min-w-0 truncate text-base font-bold text-[#5C2A35]">{patient.name}</span>
          <span className="shrink-0 text-[11px] font-medium text-[#616161]">{patient.gender}, {patient.age}세</span>
          <div className="shrink-0 flex items-center gap-1 ml-auto">
            {patient.time && (
            <div className="flex flex-col items-center rounded border border-green-200 bg-green-50 px-1.5 py-0.5 min-w-[36px]">
              <span className="text-[8px] font-medium text-green-600 leading-tight">예약</span>
              <span className="text-[11px] font-bold text-green-600 leading-tight">{patient.time}</span>
            </div>
            )}
            {patient.checkInTime && (
              <div className="flex flex-col items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 min-w-[36px]">
                <span className="text-[8px] font-medium text-blue-600 leading-tight">접수</span>
                <span className="text-[11px] font-bold text-blue-600 leading-tight">{patient.checkInTime}</span>
              </div>
            )}
            {patient.completedAt && (
              <div className="flex flex-col items-center rounded border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-0.5 min-w-[36px]">
                <span className="text-[8px] font-medium text-fuchsia-600 leading-tight">완료</span>
                <span className="text-[11px] font-bold text-fuchsia-600 leading-tight">{patient.completedAt.includes('T') ? format(new Date(patient.completedAt), 'HH:mm') : patient.completedAt}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/app/chart-view/${patient.patientId}`);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#F8DCE2]/50 bg-white/80 text-[#616161] transition-all duration-200 hover:bg-[#FCEBEF] hover:text-[#D27A8C] hover:border-[#D27A8C]/30"
            title="차트 보기"
          >
            <FileText className="h-4 w-4" />
          </button>
          {patient.status !== "done" && (() => {
            const [showPrintTip, setShowPrintTip] = React.useState(false);
            const printBtnRef = React.useRef<HTMLButtonElement>(null);
            const tipStyle = React.useMemo(() => {
              if (!showPrintTip || !printBtnRef.current) return undefined;
              const r = printBtnRef.current.getBoundingClientRect();
              return { position: "fixed" as const, top: r.top - 8, left: r.left + r.width / 2, transform: "translate(-50%, -100%)" };
            }, [showPrintTip]);
            return (
              <>
                <button
                  ref={printBtnRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPrint) onPrint();
                    else showMessage(`메모 출력: ${patient.name}`);
                  }}
                  onMouseEnter={(e) => { e.stopPropagation(); setShowPrintTip(true); }}
                  onMouseLeave={() => setShowPrintTip(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#F8DCE2]/50 bg-white/80 text-[#616161] transition-all duration-200 hover:bg-[#FCEBEF] hover:text-[#D27A8C] hover:border-[#D27A8C]/30"
                >
                  <Printer className="h-4 w-4" />
                </button>
                {showPrintTip && printPreview && tipStyle && createPortal(
                  <div
                    className="pointer-events-none w-max max-w-[280px] rounded-lg border border-[#F8DCE2] bg-white px-3 py-2 text-[11px] text-[#242424] shadow-lg whitespace-pre-wrap leading-relaxed"
                    style={{ ...tipStyle, zIndex: 99999 }}
                  >
                    {printPreview}
                  </div>,
                  document.body
                )}
              </>
            );
          })()}
          {onMoveLocation && patient.status !== "done" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!canExportToDone) {
                  showMessage("할일이 모두 완료되어야 내보낼 수 있습니다.");
                  return;
                }
                onMoveLocation(patient, "done");
              }}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm transition-colors ${
                canExportToDone
                  ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300"
              }`}
              title={canExportToDone ? "완료로 내보내기" : "할일 완료 후 내보내기"}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
          {quickAction && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (quickAction.disabled || quickAction.busy) return;
                quickAction.onClick();
              }}
              disabled={quickAction.disabled || quickAction.busy}
              title={
                quickAction.busy
                  ? "처리 중..."
                  : quickAction.iconTitle || quickAction.hint || quickAction.label
              }
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm transition-colors ${
                quickAction.disabled
                  ? "cursor-not-allowed border-emerald-100 bg-emerald-50 text-emerald-200"
                  : quickAction.queued
                    ? "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
              }`}
            >
              <PlayCircle className={`h-4 w-4 ${quickAction.busy ? "animate-pulse" : ""}`} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#F8DCE2]/50 bg-white/80 text-[#616161] transition-all duration-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200"
              title="삭제"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className={`grid gap-2 ${onMoveLocation && patient.status !== "done" ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="relative min-w-0" ref={dropdownRef}>
            <button
              onClick={() => setStatusDropdownOpen(!isStatusOpen)}
              className={`${dropdownBaseClassName} ${!(statusConfig as any).colorHex ? `${statusConfig.color} ${statusConfig.borderColor} hover:bg-white` : "hover:bg-white/85"}`}
              style={badgeStyle}
            >
              <span className="flex items-center gap-1 truncate">
                <span className="truncate">{statusConfig.label}</span>
                {patient.status !== "done" && (
                  <>
                    <Clock className={`h-3 w-3 shrink-0 ${isAlertTriggered ? "text-red-600" : ""}`} />
                    <span className={isAlertTriggered ? "text-red-600 font-bold" : ""}>{waitTime}분</span>
                  </>
                )}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isStatusOpen ? "rotate-180" : ""}`} />
            </button>
            {isStatusOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                {useDynamicStatus
                  ? dynamicStatuses
                      .filter((s) => s.enabled)
                      .sort((a, b) => a.order - b.order)
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleStatusChange(s.id)}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between ${patient.status === s.id ? "font-bold bg-gray-50" : "text-[#616161]"}`}
                          style={patient.status === s.id && s.colorHex ? { color: s.colorHex, backgroundColor: `${s.colorHex}1A` } : {}}
                        >
                          {s.label}
                          {patient.status === s.id && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.colorHex || "currentColor" }} />}
                        </button>
                      ))
                  : Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <button
                        key={key}
                        onClick={() => handleStatusChange(key)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between ${patient.status === key ? "font-bold bg-violet-50 text-violet-600" : "text-[#616161]"}`}
                      >
                        {config.label}
                        {patient.status === key && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                      </button>
                    ))}
              </div>
            )}
          </div>

          {onMoveLocation && patient.status !== "done" && (
            <div className="relative min-w-0">
              <select
                value={patient.location || ""}
                title={`현재 장소: ${locationLabel}`}
                draggable={false}
                className={`${dropdownBaseClassName} appearance-none pr-8 font-bold text-[#242424] focus:border-cyan-400 focus:outline-none hover:bg-white`}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  notifyDropdownInteraction(true);
                }}
                onFocus={() => notifyDropdownInteraction(true)}
                onBlur={() => notifyDropdownInteraction(false)}
                onChange={(e) => {
                  e.stopPropagation();
                  const nextLocationId = String(e.target.value || "").trim();
                  notifyDropdownInteraction(false);
                  if (!nextLocationId || nextLocationId === patient.location) return;
                  if ((nextLocationId === "done" || nextLocationId === "go_home") && !canExportToDone) {
                    showMessage("할일이 모두 완료되어야 완료로 이동할 수 있습니다.");
                    return;
                  }
                  onMoveLocation(patient, nextLocationId);
                }}
              >
                {resolvedLocationOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#616161]" />
            </div>
          )}
        </div>
      </div>


      {isExpanded && (
        <>
          <div className="mb-0.5 flex flex-wrap items-center gap-1">
            {(patient.tags || []).map((tag, i) => (
              <span key={i} className="px-1.5 py-0 text-[10px] rounded font-medium bg-gray-100 text-[#616161]">{tag}</span>
            ))}
            {patient.reservCategoryName && (
              <span className="px-1.5 py-0 text-[10px] rounded font-medium bg-violet-50 text-violet-600 border border-violet-200">{patient.reservCategoryName}</span>
            )}
          </div>
          {patient.receptionMemo && <div className="mb-1 text-[10px] leading-4 text-[#242424] whitespace-pre-wrap">{patient.receptionMemo}</div>}
        </>
      )}

      {showTodos && sortedPatientTodos.length > 0 && (
        <div className="mt-1 space-y-0.5 border-t border-gray-100/50 pt-1">
          {sortedPatientTodos.map((todo) => {
            const status = getTodoStatus(todo);
            const actor =
              status === "done"
                ? normalizeActor(todo.completedBy) || normalizeActor(todo.creator) || "담당자"
                : status === "doing"
                  ? normalizeActor(todo.startedBy) || normalizeActor(todo.creator) || "담당자"
                  : normalizeActor(todo.creator) || "담당자";
            const when = status === "done" ? todo.completedAt : status === "doing" ? todo.startedAt : todo.createdAt;

            return (
              <div key={`todo-${todo.id}`} className="flex items-center gap-1.5 text-[12px] text-[#424242] hover:bg-gray-50 p-0.5 rounded">
                <svg
                  className="w-3.5 h-3.5 cursor-pointer shrink-0"
                  viewBox="0 0 16 16"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTodoCycle?.(todo, todoActorById[todo.id] || undefined);
                  }}
                  title={status === "todo" ? "시작" : status === "doing" ? "완료" : "초기화"}
                >
                  <circle cx="8" cy="8" r="7" fill="none" stroke={status === "todo" ? "#D1D5DB" : status === "doing" ? "#D27A8C" : "#10B981"} strokeWidth="1.5" />
                  {status === "doing" && <path d="M8 1 A7 7 0 0 1 8 15 Z" fill="#D27A8C" />}
                  {status === "done" && <circle cx="8" cy="8" r="5.5" fill="#10B981" />}
                </svg>
                <span className={`flex-1 min-w-0 truncate text-[11px] ${status === "done" ? "line-through text-gray-400" : ""}`}>{todo.content}</span>
                {status === "doing" && todo.startedAt && (
                  <span className="text-[10px] text-[#D27A8C] shrink-0">{format(new Date(todo.startedAt), "HH:mm")}~</span>
                )}
                {status === "done" && todo.startedAt && todo.completedAt && (
                  <span className="text-[10px] text-emerald-600 shrink-0">
                    {Math.round((new Date(todo.completedAt).getTime() - new Date(todo.startedAt).getTime()) / 60000)}분
                  </span>
                )}
                <div className="shrink-0 flex items-center gap-0.5">
                  <select
                    className="h-5 w-[80px] rounded border border-gray-200 bg-white px-0.5 py-0 text-[9px] text-[#616161] appearance-none"
                    value={todoActorById[todo.id] || ""}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={() => notifyDropdownInteraction(true)}
                    onFocus={() => notifyDropdownInteraction(true)}
                    onBlur={() => notifyDropdownInteraction(false)}
                    onChange={(e) => {
                      const value = e.target.value;
                      notifyDropdownInteraction(false);
                      setTodoActorById((prev) => ({ ...prev, [todo.id]: value }));
                      onTodoAssigneeChange?.(todo.id, value || undefined);
                    }}
                  >
                    <option value="">미지정</option>
                    {todoAssignableMembers.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}{m.jobTitleName ? ` (${m.jobTitleName})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {patient.treatments && patient.treatments.length > 0 && (
        <div className="mt-1 space-y-0.5 border-t border-gray-100/50 pt-1">
          {patient.treatments.map((t) => (
            <div key={t.id} className="flex items-start justify-between cursor-pointer group/item select-none">
              <div className="flex items-start gap-2">
                <div
                  className="mt-0.5 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTreatment?.(patient.id, t.id);
                  }}
                >
                  {t.status === "pending" && <div className="w-4 h-4 rounded-full border border-gray-300 group-hover/item:border-blue-400 transition-colors" />}
                  {t.status === "process" && (
                    <div className="w-4 h-4 rounded-full border border-blue-500 overflow-hidden relative">
                      <div className="absolute left-0 top-0 w-2 h-full bg-blue-500" />
                    </div>
                  )}
                  {t.status === "completed" && (
                    <div className="w-4 h-4 rounded-full bg-blue-500 border border-blue-500 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </div>
                <div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTreatment(t);
                      onStatusDropdownChange?.(true);
                    }}
                    className={`cursor-pointer text-[11px] font-medium hover:text-blue-500 hover:underline ${t.status === "completed" ? "text-[#9E9E9E] line-through" : "text-[#242424]"}`}
                  >
                    {t.name}
                  </div>
                  {t.assignee && (
                    <div className="flex items-center gap-1 text-[10px] text-[#616161] mt-0.5">
                      <User className="w-3 h-3 text-[#9E9E9E]" />
                      {t.assignee}
                    </div>
                  )}
                </div>
              </div>
              {(t.time || t.endTime) && (
                <div className="text-[10px] text-[#9E9E9E] text-right">
                  {t.time ? `${t.time}분` : "0분"}
                  {t.endTime && ` 종료 ${t.endTime}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedTreatment && (
        <TreatmentEditModal
          treatment={selectedTreatment}
          onClose={() => {
            setSelectedTreatment(null);
            onStatusDropdownChange?.(false);
          }}
          onSave={(updates) => {
            const newStatus = selectedTreatment.status === "pending" ? "process" : selectedTreatment.status;
            updateTreatment?.(patient.id, selectedTreatment.id, { ...updates, status: newStatus });
          }}
          onDelete={() => deleteTreatment?.(patient.id, selectedTreatment.id)}
        />
      )}
    </div>

    {pendingStatusAlertModal && (
      <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/35 p-4">
        <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
          <div className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(240,249,255,0.95),rgba(248,250,252,0.92))] px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#9E9E9E]">Status Alert</div>
                <div className="mt-2 text-xl font-bold text-[#242424]">마취/대기 알림 시간 설정</div>
                <div className="mt-1 text-sm text-[#616161]">
                  {patient.name}님 상태를{" "}
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{
                      color: pendingStatusAlertModal.colorHex || undefined,
                      backgroundColor: pendingStatusAlertModal.colorHex ? `${pendingStatusAlertModal.colorHex}18` : undefined,
                    }}
                  >
                    {pendingStatusAlertModal.label}
                  </span>
                  {" "}으로 변경합니다.
                </div>
              </div>
              <button
                type="button"
                onClick={closeStatusAlertModal}
                disabled={isSavingStatusAlert}
                className="rounded-full p-2 text-[#9E9E9E] transition hover:bg-white/80 hover:text-[#616161] disabled:cursor-not-allowed disabled:opacity-40"
                title="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="mb-2 text-sm font-bold text-[#242424]">알림 표시 시간(분)</div>
              <input
                type="number"
                min={1}
                max={720}
                step={1}
                value={pendingStatusAlertModal.alertMinutes}
                onChange={(event) =>
                  setPendingStatusAlertModal((prev) =>
                    prev ? { ...prev, alertMinutes: event.target.value } : prev
                  )
                }
                disabled={isSavingStatusAlert}
                className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-lg font-bold text-[#242424] outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
              <div className="mt-2 text-[11px] text-[#616161]">
                기본값 {pendingStatusAlertModal.defaultAlertMinutes}분. 설정한 시간이 지나면 대기 차트에서 강조됩니다.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[5, 10, 15, 20, 30, 45, 60].map((minute) => {
                const active = String(minute) === pendingStatusAlertModal.alertMinutes.trim();
                return (
                  <button
                    key={`status-alert-minute-${minute}`}
                    type="button"
                    disabled={isSavingStatusAlert}
                    onClick={() =>
                      setPendingStatusAlertModal((prev) =>
                        prev ? { ...prev, alertMinutes: String(minute) } : prev
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                        : "border-slate-200 bg-white text-[#616161] hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {minute}분
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={closeStatusAlertModal}
              disabled={isSavingStatusAlert}
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#616161] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={isSavingStatusAlert}
              onClick={async () => {
                const parsed = Number(pendingStatusAlertModal.alertMinutes.trim());
                if (!Number.isFinite(parsed) || parsed <= 0) {
                  showMessage("알림 시간은 1분 이상의 숫자로 입력해주세요.");
                  return;
                }

                const sanitized = sanitizeAlertMinutes(parsed);

                if (statusRequiresAssignee(getDynamicStatusSetting(pendingStatusAlertModal.statusId), pendingStatusAlertModal.statusId, pendingStatusAlertModal.label)) {
                  const target = {
                    statusId: pendingStatusAlertModal.statusId,
                    label: pendingStatusAlertModal.label,
                    colorHex: pendingStatusAlertModal.colorHex,
                    procedureName: pendingStatusAlertModal.label,
                    alertMinutes: sanitized,
                  };
                  setPendingStatusAlertModal(null);
                  setPendingAssigneeModal(target);
                  return;
                }

                setIsSavingStatusAlert(true);
                try {
                  const success = await applyStatusChange(
                    pendingStatusAlertModal.statusId,
                    sanitized
                  );
                  if (success) {
                    closeStatusAlertModal();
                  }
                } finally {
                  setIsSavingStatusAlert(false);
                }
              }}
              className="h-10 rounded-xl bg-[#D27A8C] px-5 text-sm font-bold text-white shadow-sm hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingStatusAlert ? "저장중..." : "적용"}
            </button>
          </div>
        </div>
      </div>
    )}

    {pendingAssigneeModal && (
      <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/35 p-4">
        <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
          <div className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(240,249,255,0.95),rgba(248,250,252,0.92))] px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#9E9E9E]">Assignee</div>
                <div className="mt-2 text-xl font-bold text-[#242424]">{pendingAssigneeModal.label} 담당자 선택</div>
                <div className="mt-1 text-sm text-[#616161]">
                  {patient.name}님의 <span className="font-bold text-[#242424]">{pendingAssigneeModal.procedureName}</span> 진행자를 선택해주세요.
                </div>
              </div>
              <button
                type="button"
                onClick={closeAssigneeModal}
                disabled={isSavingAssignee}
                className="rounded-full p-2 text-[#9E9E9E] transition hover:bg-white/80 hover:text-[#616161] disabled:cursor-not-allowed disabled:opacity-40"
                title="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
            {departmentUserGroups.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-[#9E9E9E]">등록된 사용자가 없습니다. 직원 설정에서 추가해주세요.</div>
            ) : (
              departmentUserGroups.map((group) => (
                <div key={group.deptName} className="mb-3">
                  <div className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-[#5C2A35]">{group.deptName}</div>
                  <div className="flex flex-wrap gap-2">
                    {group.users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={isSavingAssignee}
                        onClick={async () => {
                          setIsSavingAssignee(true);
                          try {
                            const success = await applyStatusChange(
                              pendingAssigneeModal.statusId,
                              pendingAssigneeModal.alertMinutes,
                              { managedByUserId: u.id, procedureName: pendingAssigneeModal.procedureName }
                            );
                            if (success) closeAssigneeModal();
                          } finally {
                            setIsSavingAssignee(false);
                          }
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-[#242424] transition hover:border-[#D27A8C] hover:bg-[#D27A8C]/10 hover:text-[#D27A8C] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button
              type="button"
              disabled={isSavingAssignee}
              onClick={async () => {
                setIsSavingAssignee(true);
                try {
                  const success = await applyStatusChange(
                    pendingAssigneeModal.statusId,
                    pendingAssigneeModal.alertMinutes
                  );
                  if (success) closeAssigneeModal();
                } finally {
                  setIsSavingAssignee(false);
                }
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#616161] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              담당자 없이 진행
            </button>
            <button
              type="button"
              onClick={closeAssigneeModal}
              disabled={isSavingAssignee}
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#616161] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}


import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { kisTerminalService } from "../services/kisTerminalService";
import { isManualPaymentMode } from "../utils/terminalMode";
import {
    Calendar,
    User,
    FileText,
    Settings,
    Plus,
    MoreVertical,
    ChevronDown,
    ChevronRight,
    X,
    Filter,
    CheckCircle,
    MessageSquare,
    CreditCard,
    Stethoscope,
    Check,
    Edit3,
    Trash,
    Pin,
    Minus,
    Gift,
    Image as ImageIcon,
    Save,
    Ticket as TicketIcon,
    Printer,
    Lock,
    Unlock,
    ClipboardList,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInYears } from "date-fns";
import { ko } from "date-fns/locale";

import { patientService, PatientDetail } from '../services/patientService';
import { visitService, ReservationChangeHistoryItem } from '../services/visitService';
import { chartConfigService } from '../services/chartConfigService';
import { paymentService, PaymentItem, PaymentRecord, PaymentUsageSummaryItem, PaymentDetailBreakdown } from '../services/paymentService';
import { memberConfigService } from '../services/memberConfigService';
import { categoryTicketDefService } from '../services/categoryTicketDefService';
import { membershipService, PatientMembership, MembershipBalance, MembershipHistory } from '../services/membershipService';
import { ReservationChangeHistoryModal } from '../components/reservation/ReservationChangeHistoryModal';
import { cartService, CartItem, CartPreview } from '../services/cartService';
import { todoService, TodoItem } from '../services/todoService';
import { procedureTodoStatsService } from '../services/procedureTodoStatsService';
import { procedureService, CustomerProcedure } from '../services/procedureService';
import { useChartStore } from '../stores/useChartStore';
import { patientRecordService, PatientRecordData } from '../services/patientRecordService';
import { ticketService, TicketHistory } from '../services/ticketService';
import { fetchQuickTicketOptions, canOverrideCycleBlock, type QuickTicketOption } from '../utils/quickTicketOption';
import { hospitalSettingsService } from '../services/hospitalSettingsService';
import { useChartSignalR } from '../hooks/useChartSignalR';
import { useResizableColumns, ColumnDef } from '../hooks/useResizableColumns';
import { VIEW_EVENT_MAP } from '../config/signalrEvents';
import { useCurrentUserPermissions } from '../hooks/useCurrentUserPermissions';
import { NoPermissionOverlay } from '../components/common/NoPermissionOverlay';

import { AppointmentItem } from '../types/appointments';
import { ChartConfigSettings, ChartMemoSection } from '../types/settings';
import ConsentSendModal from '../components/ConsentSendModal';
import DocumentIssuanceModal from '../components/DocumentIssuanceModal';
import { useAlert } from '../components/ui/AlertDialog';

// Type Aliases to match existing code usage
type Visit = Omit<AppointmentItem, 'id'> & {
    id: number;
    room?: string;
    consultation?: Record<string, string>;
    memo?: string;
    scheduledAt: string;
    treatmentName?: string;
};
type ChartConfig = ChartConfigSettings;
type Payment = PaymentItem;
type Patient = PatientDetail & {
    gender?: string;
    age?: number;
};

function areMembershipBalancesEqual(
    prev: MembershipBalance[] | undefined,
    next: MembershipBalance[] | undefined
): boolean {
    const a = Array.isArray(prev) ? prev : [];
    const b = Array.isArray(next) ? next : [];
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
        const left = a[i];
        const right = b[i];
        if (!left || !right) return false;
        if (Number(left.id) !== Number(right.id)) return false;
        if (String(left.name || "") !== String(right.name || "")) return false;
        if (Number(left.balance || 0) !== Number(right.balance || 0)) return false;
        if (Number(left.discountPercent || 0) !== Number(right.discountPercent || 0)) return false;
    }

    return true;
}

function buildPrioritizedMembershipIds(
    balances: MembershipBalance[] | undefined,
    selectedMembershipId: number | undefined,
    isMembershipUsageDisabled: boolean
): number[] {
    if (isMembershipUsageDisabled) return [];
    if (!selectedMembershipId) return [];
    const hasSelected = (balances || []).some((membership) => Number(membership?.id || 0) === selectedMembershipId);
    if (!hasSelected) return [];
    const rest = (balances || [])
        .filter((m) => Number(m?.id || 0) > 0 && Number(m?.id || 0) !== selectedMembershipId)
        .sort((a, b) => ((a.cashBalance ?? 0) + (a.pointBalance ?? 0)) - ((b.cashBalance ?? 0) + (b.pointBalance ?? 0)));
    return [selectedMembershipId, ...rest.map((m) => Number(m.id))];
}

const RESERVATION_ACTION_LABEL: Record<string, string> = {
    create: "생성",
    update: "수정",
    move: "예약 변경",
    cancel: "취소",
};

const RESERVATION_FIELD_LABEL: Record<string, string> = {
    scheduledat: "예약 시간",
    category: "카테고리",
    consultation: "상담 정보",
    doctor: "원장상담",
    medicalrecord: "진료기록",
    checkinat: "접수 시간",
    memo: "예약 메모",
    cancelreason: "취소 사유",
    plannedticketnames: "예정 시술권",
    plannedticketids: "예정 시술권 ID",
    plannedtreatments: "예정 시술",
    skipcrmmessage: "CRM 메시지 생략",
    durationmin: "예약 길이",
    statusalertminutes: "상태 알림 시간",
    iswalkin: "워크인",
    isnoshow: "노쇼",
};

const USAGE_SUMMARY_SOURCE_STYLES: Record<string, string> = {
    payment: "border-indigo-200 bg-indigo-50 text-indigo-700",
    ticket_new: "border-emerald-200 bg-emerald-50 text-emerald-700",
    ticket_usage: "border-teal-200 bg-teal-50 text-teal-700",
    ticket_refund: "border-red-200 bg-red-50 text-red-700",
    membership_new: "border-purple-200 bg-purple-50 text-purple-700",
    membership_deduction: "border-violet-200 bg-violet-50 text-violet-700",
    refund: "border-red-200 bg-red-50 text-red-700",
};

const RIGHT_SIDEBAR_TAB_COLORS: Record<string, { bg: string; color: string; activeBg: string; border: string }> = {
    record: { bg: "#FCEBEF", color: "#D27A8C", activeBg: "#D27A8C", border: "#F8DCE2" },
    reservation: { bg: "#E0F7FA", color: "#00838F", activeBg: "#00838F", border: "#80DEEA" },
    membership: { bg: "#EDE7F6", color: "#6A1B9A", activeBg: "#6A1B9A", border: "#CE93D8" },
    ticket: { bg: "#E0F2F1", color: "#00695C", activeBg: "#00695C", border: "#80CBC4" },
    consent: { bg: "#FCEBEF", color: "#7A2E3D", activeBg: "#7A2E3D", border: "#E5B5C0" },
    refund: { bg: "#FCE4EC", color: "#C62828", activeBg: "#C62828", border: "#EF9A9A" },
};

function formatUsageSummaryTime(value?: string): string {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return format(parsed, "MM.dd a hh:mm", { locale: ko });
}

function getRefundClientBlockReason(record: Partial<PaymentRecord> | null | undefined): string | null {
    if (!record) return "환불할 결제건 정보를 찾을 수 없습니다.";

    const actualPaidAmount = Math.max(0, paymentService.calcActualPaidAmount(record));
    if (actualPaidAmount <= 0) {
        return "실결제금액이 0원인 결제건은 이 화면에서 직접 환불할 수 없습니다.";
    }

    return null;
}

type RefundResponsibilityType = "customer" | "hospital";

type RefundModalCheck = {
    recordId: number;
    sourceAmount: number;
    autoUsedAmount: number;
    penaltyAmount: number;
    estimatedRefund: number;
    canRefund: boolean;
    reason?: string;
    items?: Array<{ itemName: string; itemType: string; rootId?: number; paidAmount: number; originalPrice: number; originalUnitPrice: number; eventPrice?: number; usedCount: number; totalCount?: number; usedAmountAtOriginalPrice: number; penaltyRate: number; penaltyAmount: number; estimatedRefund: number; refundFormula: string; paymentDetailIds?: number[] }>;
};

type RefundModalState = {
    mode: "single" | "group";
    records: PaymentRecord[];
    checks: RefundModalCheck[];
    responsibilityType: RefundResponsibilityType;
    reason: string;
    manualUsedAmount: string;
    blockedMessages: string[];
    isSubmitting: boolean;
    refundItemName?: string;
    refundPaymentDetailId?: number;
    refundRate?: number;
};

const CONSULTATION_KEY_LABEL: Record<string, string> = {
    management: "관리",
    counselor: "실장상담",
    doctor: "원장상담",
    counselorid: "담당상담자",
    doctorid: "원장",
};

const HISTORY_DATE_LIKE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?/;
const HISTORY_UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const pad2 = (value: number): string => String(value).padStart(2, "0");

const normalizeHistoryFieldKey = (field?: string | null): string =>
    String(field || "").trim().toLowerCase();

const tryParseHistoryJson = (raw: string): unknown | null => {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const formatHistoryDateTime = (value?: string | null): string => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
};

const formatHistorySimpleValue = (value?: string | null): string => {
    if (value == null) return "-";
    const raw = String(value).trim();
    if (!raw) return "-";
    const lowered = raw.toLowerCase();
    if (lowered === "true") return "예";
    if (lowered === "false") return "아니오";
    if (HISTORY_DATE_LIKE_REGEX.test(raw)) return formatHistoryDateTime(raw);
    return raw;
};

const formatHistoryCategoryValue = (
    raw: string,
    categoryNameById: Map<string, string>
): string => {
    const trimmed = String(raw || "").trim();
    if (!trimmed || trimmed.toLowerCase() === "null") return "미지정";
    const resolved = categoryNameById.get(trimmed);
    if (resolved) return resolved;
    if (HISTORY_UUID_LIKE_REGEX.test(trimmed)) return "미등록 카테고리";
    return trimmed;
};

const formatHistoryConsultationValue = (
    value: unknown,
    memberNameById: Map<string, string>
): string => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "-";
    const record = value as Record<string, unknown>;
    const lines: string[] = [];
    const orderedKeys = ["management", "counselor", "doctor", "counselorId", "doctorId"];
    const seen = new Set<string>();

    const appendLine = (key: string, rawValue: unknown) => {
        const text = String(rawValue ?? "").trim();
        if (!text) return;
        const normalized = normalizeHistoryFieldKey(key);
        const keyLabel = CONSULTATION_KEY_LABEL[normalized] || key;
        const displayValue = normalized.endsWith("id") ? (memberNameById.get(text) || text) : text;
        lines.push(`${keyLabel}: ${displayValue}`);
    };

    orderedKeys.forEach((key) => {
        if (!(key in record)) return;
        seen.add(key);
        appendLine(key, record[key]);
    });
    Object.entries(record).forEach(([key, rawValue]) => {
        if (seen.has(key)) return;
        appendLine(key, rawValue);
    });

    return lines.length > 0 ? lines.join("\n") : "-";
};

const formatReservationHistoryValue = (
    field: string,
    value: string | null | undefined,
    categoryNameById: Map<string, string>,
    memberNameById: Map<string, string>
): string => {
    if (value == null) return "-";
    const raw = String(value).trim();
    if (!raw) return "-";

    const fieldKey = normalizeHistoryFieldKey(field);
    if (fieldKey === "category") {
        return formatHistoryCategoryValue(raw, categoryNameById);
    }
    if (fieldKey === "durationmin" || fieldKey === "statusalertminutes") {
        const minutes = Number(raw);
        if (!Number.isNaN(minutes)) return `${minutes}분`;
    }

    const parsed = tryParseHistoryJson(raw);
    if (fieldKey === "consultation") {
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return formatHistoryConsultationValue(parsed, memberNameById);
        }
        return raw;
    }

    if (
        fieldKey === "plannedticketnames" ||
        fieldKey === "plannedticketids" ||
        fieldKey === "plannedtreatments"
    ) {
        if (Array.isArray(parsed)) {
            const values = parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
            return values.length > 0 ? values.join(", ") : "없음";
        }
        return raw;
    }

    if (Array.isArray(parsed)) {
        const values = parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
        return values.length > 0 ? values.join(", ") : "없음";
    }
    if (parsed && typeof parsed === "object") {
        const lines = Object.entries(parsed as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${String(v ?? "").trim()}`)
            .filter((line) => !line.endsWith(":"));
        if (lines.length > 0) return lines.join("\n");
    }

    return formatHistorySimpleValue(raw);
};

import { useSettingsStore } from "../stores/useSettingsStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { ReceptionForm } from "../components/chart/ReceptionForm";
import { PatientSearchModal } from "../components/common/PatientSearchModal";
import AddPaymentModal from "../components/AddPaymentModal";
import { RefundModal } from "../components/refund/RefundModal";
import { PaymentInfoModal } from "../components/refund/PaymentInfoModal";
import { BulkRefundModal, type BulkRefundModalItem } from "../components/refund/BulkRefundModal";
import { MembershipSettlementModal } from "../components/refund/MembershipSettlementModal";
import { RefundDetailModal } from "../components/refund/RefundDetailModal";
import { UnifiedRefundModal, type UnifiedRefundSelection } from "../components/refund/UnifiedRefundModal";
import SmartTextarea from "../components/SmartTextarea";
import { printService, PrintSection } from "../services/printService";
import { useNavigate, useParams } from "react-router-dom";
import {
    buildProcedureDurationOverrideMap,
    buildProcedureQueueMap,
    resolveProcedureQueueSummary,
    normalizeQueueProcedureKey,
    type ProcedureQueueSummary,
} from "../utils/todoQueue";

// --- Interfaces ---


export default function PatientChartPage() {
    const { showAlert, showConfirm } = useAlert();
    const { patientId } = useParams<{ patientId: string }>();
    const patientIdStr = patientId;
    const navigate = useNavigate();
    const { settings, updateSettings } = useSettingsStore();
    const { permissions: userPerms, loaded: permsLoaded } = useCurrentUserPermissions(settings.activeBranchId);
    const canViewMedicalRecord = !permsLoaded || !!userPerms["chart.medical_record.view"];
    const canEditMedicalRecord = !permsLoaded || !!userPerms["chart.medical_record.edit"];
    const canViewPayment = !permsLoaded || !!userPerms["chart.payment.view"];
    const canEditPayment = !permsLoaded || !!userPerms["chart.payment.edit"];
    const canViewMemo = !permsLoaded || !!userPerms["patients.memo.view"];
    const canEditMemo = !permsLoaded || !!userPerms["patients.memo.edit"];
    const canForceUnlock = !permsLoaded || !!userPerms["chart.lock.force_unlock"];

    const columnDefs = useMemo<ColumnDef[]>(() => [
        { minWidth: 220, ratio: 2 },
        { minWidth: 360, ratio: 4 },
        { minWidth: 280, ratio: 3 },
        { minWidth: 280, ratio: 2.5 },
    ], []);
    const { containerRef: gridRef, widths: colWidths, onMouseDown: onSepMouseDown } = useResizableColumns(columnDefs);

    const isMobile = useMediaQuery("(max-width: 767px)");
    const [activeMobileColumn, setActiveMobileColumn] = useState<"visits" | "chart" | "ticket" | "sidebar">("chart");

    // Data States
    const [patient, setPatient] = useState<Patient | null>(null);
    const [visits, setVisits] = useState<Visit[]>([]);
    const [chartVisitsData, setChartVisitsData] = useState<any[]>([]);
    const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);

    const [payments, setPayments] = useState<Payment[]>([]);
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [quantityDraftByItemId, setQuantityDraftByItemId] = useState<Record<number, string>>({});
    const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null);

    // Purchased tickets/memberships history
    const [tickets, setTickets] = useState<any[]>([]);
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [ticketQueueByProcedure, setTicketQueueByProcedure] = useState<Record<string, ProcedureQueueSummary>>({});
    const [patientRecords, setPatientRecords] = useState<PatientRecordData[]>([]);
    const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
    const [memberships, setMemberships] = useState<PatientMembership[]>([]);
    const [customerReservations, setCustomerReservations] = useState<any[]>([]);
    const [changeHistoryReservId, setChangeHistoryReservId] = useState<number | null>(null);
    const [dailyUsageSummary, setDailyUsageSummary] = useState<PaymentUsageSummaryItem[]>([]);

    // Cart preview and membership selection states
    const [cartPreview, setCartPreview] = useState<CartPreview | null>(null);
    const [membershipBalances, setMembershipBalances] = useState<MembershipBalance[]>([]);
    const [selectedMembershipId, setSelectedMembershipId] = useState<number | undefined>(undefined);
    const [isMembershipUsageDisabled, setIsMembershipUsageDisabled] = useState(false);
    const [usePoints, setUsePoints] = useState(true);
    const [refundDetailModalHistId, setRefundDetailModalHistId] = useState<number | null>(null);
    const [selectedCouponId, setSelectedCouponId] = useState<string | undefined>(undefined);
    const [isCouponDropdownOpen, setIsCouponDropdownOpen] = useState(false);
    const [refundingPaymentId, setRefundingPaymentId] = useState<number | null>(null);
    const [refundModal, setRefundModal] = useState<RefundModalState | null>(null);
    const couponDropdownRef = useRef<HTMLDivElement | null>(null);
    const [isCounselorDropdownOpen, setIsCounselorDropdownOpen] = useState(false);
    const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState(false);
    const counselorDropdownRef = useRef<HTMLDivElement | null>(null);
    const doctorDropdownRef = useRef<HTMLDivElement | null>(null);

    // Fetch hospital settings on mount to ensure fresh data
    useEffect(() => {
        const fetchHospitalSettings = async () => {
            try {
                const data = await hospitalSettingsService.get(settings.activeBranchId || "1");
                if (data) {
                    updateSettings({ hospital: data as any });
                }
            } catch (error) {
                console.error("Failed to sync hospital settings:", error);
            }
        };
        fetchHospitalSettings();
    }, [settings.activeBranchId, updateSettings]);



    // UI States
    const [activeRightSidebarTab, setActiveRightSidebarTab] = useState<
        "record" | "reservation" | "membership" | "ticket" | "consent" | "refund"
    >("record");
    const [isConsentSendModalOpen, setIsConsentSendModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);

    const [showReceptionModal, setShowReceptionModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showVisitCreationModal, setShowVisitCreationModal] = useState(false);
    const [isReservationHistoryModalOpen, setIsReservationHistoryModalOpen] = useState(false);
    const [isReservationHistoryLoading, setIsReservationHistoryLoading] = useState(false);
    const [reservationHistoryError, setReservationHistoryError] = useState<string | null>(null);
    const [reservationHistoryItems, setReservationHistoryItems] = useState<ReservationChangeHistoryItem[]>([]);
    const [selectedReservationVisit, setSelectedReservationVisit] = useState<Visit | null>(null);
    const [isMemoSectionSettingsOpen, setIsMemoSectionSettingsOpen] = useState(false);
    const [memoSectionLabelDraft, setMemoSectionLabelDraft] = useState<Record<string, string>>({});
    const [memoSectionHistoryVisibilityDraft, setMemoSectionHistoryVisibilityDraft] = useState<Record<string, boolean>>({});
    const [memoSectionSaving, setMemoSectionSaving] = useState(false);
    const [isPrintSettingsOpen, setIsPrintSettingsOpen] = useState(false);
    const [isPrintPreviewCollapsed, setIsPrintPreviewCollapsed] = useState(true);
    const [printConfigDraft, setPrintConfigDraft] = useState<Record<string, boolean>>({});
    const [printConfigSaving, setPrintConfigSaving] = useState(false);
    const [quickTicketPickerData, setQuickTicketPickerData] = useState<{ tickets: any[]; receptionData: any; _selectedIds?: string[] } | null>(null);
    const [quickTicketBusy, setQuickTicketBusy] = useState(false);

    const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // NOTE: totalPayment = 누적 결제 합계(헤더 뱃지용)
    const [totalPayment, setTotalPayment] = useState(0);

    // Recalculate cumulative totalPayment from payment records only (single source of truth).
    useEffect(() => {
        const sum = paymentRecords.reduce((acc, curr) => {
            const status = String(curr?.status ?? "paid").trim().toLowerCase();
            if (status === "refunded" || status === "cancelled") return acc;
            const paidByMethod =
                (curr.cashPaid || 0) +
                (curr.cardPaid || 0) +
                (curr.transferPaid || 0) +
                (curr.easyPayPaid || 0);
            return acc + paidByMethod;
        }, 0);
        setTotalPayment(sum);
    }, [paymentRecords]);

    const [todoInput, setTodoInput] = useState("");
    const [recordInput, setRecordInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchTab, setSearchTab] = useState<"all" | "ticket" | "membership">("all");

    const [ticketTab, setTicketTab] = useState<"active" | "completed" | "refunded">("active");
    const [ticketSearch, setTicketSearch] = useState<string>("");
    const [reservationSearch, setReservationSearch] = useState<string>("");
    const [membershipSearch, setMembershipSearch] = useState<string>("");
    const [consentSearch, setConsentSearch] = useState<string>("");
    const [refundSearch, setRefundSearch] = useState<string>("");
    const [assigningTodoId, setAssigningTodoId] = useState<number | null>(null);
    const [dailySummaryTab, setDailySummaryTab] = useState<"purchase_refund" | "usage">("purchase_refund");
    const [expandedRefundId, setExpandedRefundId] = useState<string | null>(null);
    const [isFinalAmountExpanded, setIsFinalAmountExpanded] = useState(false);
    const [visitViewMode, setVisitViewMode] = useState<"summary" | "detail">("summary");
    const [expandedVisitIds, setExpandedVisitIds] = useState<number[]>([]);

    // Chart Lock States
    const [isChartLocked, setIsChartLocked] = useState(false);
    const [isLockedByMe, setIsLockedByMe] = useState(false);
    const [lockingUserName, setLockingUserName] = useState<string | null>(null);
    const [lockingUserId, setLockingUserId] = useState<number | null>(null);
    const [isLockBusy, setIsLockBusy] = useState(false);
    const isReadOnly = !isLockedByMe;
    const chartLockCleanupRef = useRef(false);
    const isLockedByMeRef = useRef(false);
    const myUserIdRef = useRef<number | null>(null);

    useEffect(() => {
        isLockedByMeRef.current = isLockedByMe;
    }, [isLockedByMe]);

    // [FIX] Missing States
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [chartDataVersion, setChartDataVersion] = useState(0);
    const [debugLog, setDebugLog] = useState("");

    const searchRef = useRef<HTMLDivElement>(null);
    const locationDropdownRef = useRef<HTMLDivElement>(null);
    const dirtyFieldsRef = useRef<Record<string, { visitId: number; value: string }>>({});

    const toggleVisitExpand = (visitId: number) => {
        setExpandedVisitIds((prev) =>
            prev.includes(visitId) ? prev.filter((vid) => vid !== visitId) : [...prev, visitId]
        );
    };

    const [expandedMembershipId, setExpandedMembershipId] = useState<number | null>(null);
    const [membershipHistory, setMembershipHistory] = useState<MembershipHistory[]>([]);
    const [membershipFilter, setMembershipFilter] = useState<'active' | 'completed'>('active');
    const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
    const [ticketHistoryByTicketId, setTicketHistoryByTicketId] = useState<Record<number, TicketHistory[]>>({});
    const [ticketHistoryLoadingId, setTicketHistoryLoadingId] = useState<number | null>(null);

    const handleToggleMembershipHistory = async (membershipId: number) => {
        if (expandedMembershipId === membershipId) {
            setExpandedMembershipId(null);
            setMembershipHistory([]);
        } else {
            setExpandedMembershipId(membershipId);
            try {
                const history = await membershipService.getHistory(membershipId, Number(patientIdStr));
                setMembershipHistory(history);
            } catch (e) {
                console.error("Failed to load history", e);
            }
        }
    };

    const handleToggleTicketHistory = async (ticketId: number) => {
        if (expandedTicketId === ticketId) {
            setExpandedTicketId(null);
            return;
        }

        setExpandedTicketId(ticketId);
        if (ticketHistoryByTicketId[ticketId]) return;

        setTicketHistoryLoadingId(ticketId);
        try {
            const history = await ticketService.getHistory(ticketId, Number(patientIdStr));
            setTicketHistoryByTicketId((prev) => ({ ...prev, [ticketId]: history || [] }));
        } catch (error) {
            console.error("Failed to load ticket history:", error);
            setTicketHistoryByTicketId((prev) => ({ ...prev, [ticketId]: [] }));
        } finally {
            setTicketHistoryLoadingId((prev) => (prev === ticketId ? null : prev));
        }
    };

    const handleCancelTicketHistory = async (ticketId: number, historyId: number) => {
        if (!(await showConfirm({ message: "이 티켓 사용 이력을 취소하시겠습니까?\n취소 시 잔여 횟수가 복구됩니다.", type: "warning", confirmText: "취소하기", cancelText: "닫기" }))) return;

        try {
            await ticketService.cancelHistory(historyId);
            const nextHistory = await ticketService.getHistory(ticketId, Number(patientIdStr));
            setTicketHistoryByTicketId((prev) => ({ ...prev, [ticketId]: nextHistory || [] }));
            await refreshChartData();
            showAlert({ message: "티켓 사용 이력이 취소되었습니다.", type: "success" });
        } catch (e: any) {
            console.error("Failed to cancel ticket history", e);
            const msg = e?.response?.data?.message || e?.message || "Unknown error";
            showAlert({ message: `티켓 사용 취소 실패: ${msg}`, type: "error" });
        }
    };

    const isSameDate = (d1?: string, d2?: string) => {
        if (!d1 || !d2) return false;
        return d1.substring(0, 10) === d2.substring(0, 10);
    };

    const parseScheduledAtLocal = (value?: string) => {
        const raw = String(value || "").trim();
        if (!raw) return new Date();

        // Backend may return "YYYY-MM-DD HH:mm:ss" (space) without timezone.
        // Treat it as local time and avoid forcing UTC.
        const normalized = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;
        const parsed = new Date(normalized);
        if (!Number.isNaN(parsed.getTime())) return parsed;

        const fallback = new Date(raw);
        return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
    };

    const getTodosForVisit = useCallback(
        (visit: any) => {
            const visitId = Number(visit?.id || 0);
            const visitDate = String(visit?.scheduledAt || "").slice(0, 10);
            return todos.filter((todo: any) => {
                const todoVisitId = Number(todo?.visitId || 0);
                if (todoVisitId > 0) {
                    return todoVisitId === visitId;
                }
                const createdAtDate = String(todo?.createdAt || todo?.createTime || "").slice(0, 10);
                return Boolean(visitDate) && createdAtDate === visitDate;
            });
        },
        [todos]
    );

    const isReservationVisit = useCallback((visit: any) => {
        const status = String(visit?.status || "").trim().toLowerCase();
        const room = String(visit?.room || "").trim().toLowerCase();
        const hasCheckIn = Boolean(visit?.checkInAt || visit?.checkInTime);
        const isWalkIn = visit?.isWalkIn === true;
        if (isWalkIn || hasCheckIn) return false;
        return (
            room === "reservation" ||
            status === "reservation" ||
            status === "reserved" ||
            status === "scheduled"
        );
    }, []);

    const chartVisits = useMemo(
        () => chartVisitsData,
        [chartVisitsData]
    );

    const selectedVisit = useMemo(
        () => chartVisits.find((v) => v.id === selectedVisitId),
        [chartVisits, selectedVisitId]
    );

    const reservationVisits = useMemo(() => {
        return visits.filter((visit: any) => isReservationVisit(visit));
    }, [visits, isReservationVisit]);

    useEffect(() => {
        if (chartVisits.length === 0) {
            if (selectedVisitId !== null) {
                const selectedVisitStillExists = chartVisits.some((visit) => visit.id === selectedVisitId);
                if (!selectedVisitStillExists) setSelectedVisitId(null);
            }
            return;
        }

        const hasSelectedChartVisit = chartVisits.some((visit) => visit.id === selectedVisitId);
        if (!hasSelectedChartVisit) {
            setSelectedVisitId(chartVisits[0]?.id ?? null);
        }
    }, [chartVisits, selectedVisitId]);

    // --- Helpers: ticket remaining 계산(백엔드 필드가 다양할 때 대응) ---
    const getTicketRemaining = (t: any): number | null => {
        if (t?.remainingCount === null) return null; // 무제한
        if (typeof t?.remainingCount === "number") return t.remainingCount;

        // fallback: quantity - usageCount
        if (typeof t?.quantity === "number") {
            const used = typeof t?.usageCount === "number" ? t.usageCount : 0;
            return Math.max(0, t.quantity - used);
        }
        return null;
    };

    const getTicketUsed = (t: any): number => {
        // Debug: Log ticket structure
        // console.log("Ticket Item:", t); 

        // Handle case sensitivity (backend might send UsageCount or usageCount)
        const u = t.usageCount ?? t.UsageCount;
        if (typeof u === "number") return u;

        if (typeof t?.quantity === "number" && typeof t?.remainingCount === "number") {
            return Math.max(0, t.quantity - t.remainingCount);
        }
        return 0;
    };

    const parseUsedTreatments = (raw?: string | null): string[] => {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((value) => String(value || "").trim()).filter(Boolean);
        } catch {
            return [];
        }
    };

    const normalizeTodoProcedureKey = (value?: string): string => {
        const normalized = String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[()[\]{}\/\\+_:\-·]/g, " ")
            .replace(/\s+/g, "_");
        return normalized || "etc";
    };

    const buildTicketTodoContent = (
        ticketName: string,
        template?: string,
        context?: { round?: number; treatment?: string }
    ): string => {
        const baseName = String(ticketName || "시술권").trim() || "시술권";
        const fallback = context?.treatment
            ? `${baseName} ${context.round || 1}회차 - ${context.treatment}`
            : baseName;
        const rawTemplate = String(template || "").trim();
        if (!rawTemplate) return fallback;

        let parsed = rawTemplate
            .replaceAll("{ticketName}", baseName)
            .replaceAll("{round}", String(context?.round || ""))
            .replaceAll("{treatment}", String(context?.treatment || ""));
        parsed = parsed.replace(/\s+/g, " ").trim();
        return parsed || fallback;
    };

    const resolveTicketQueueMeta = useCallback(
        (ticket: any) => {
            const queueCategoryName = String(ticket?.queueCategoryName || "").trim();
            const queueProcedureName = String(
                queueCategoryName || ticket?.autoTodoProcedureName || ticket?.name || ""
            ).trim();
            const legacyProcedureName = String(ticket?.autoTodoProcedureName || ticket?.name || "").trim();
            const queueSummary =
                resolveProcedureQueueSummary(ticketQueueByProcedure, queueProcedureName) ||
                (queueCategoryName
                    ? resolveProcedureQueueSummary(ticketQueueByProcedure, legacyProcedureName)
                    : null);
            return {
                queueCategoryName,
                queueProcedureName,
                legacyProcedureName,
                queueSummary,
            };
        },
        [ticketQueueByProcedure]
    );

    const ticketSearchItems = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return (settings?.tickets?.items || [])
            .filter((ticket: any) => {
                if (!ticket?.enabled) return false;
                if (ticket.saleStartDate && ticket.saleStartDate > today) return false;
                if (ticket.saleEndDate && ticket.saleEndDate < today) return false;
                if (searchQuery && !String(ticket.name || "").includes(searchQuery)) return false;
                return true;
            })
            .map((ticket: any) => {
                const { queueSummary } = resolveTicketQueueMeta(ticket);
                return {
                    ...ticket,
                    queueTodoCount: Math.max(0, Number(queueSummary?.todoCount || 0)),
                    queueDoingCount: Math.max(0, Number(queueSummary?.doingCount || 0)),
                    queueWaitMinutes: Math.max(0, Number(queueSummary?.estimatedWaitMinutes || 0)),
                };
            })
            .sort((a: any, b: any) => String(a?.name || "").localeCompare(String(b?.name || ""), "ko"));
    }, [resolveTicketQueueMeta, searchQuery, settings?.tickets?.items]);

    // --- Derived Calculations ---
    const totalAmount = useMemo(
        () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        [cartItems]
    );
    const selectedVisitDate = String(selectedVisit?.scheduledAt || "").slice(0, 10);
    const visibleTodos = useMemo(() => {
        if (!selectedVisit?.id) return [];

        return todos.filter((todo: any) => {
            const todoVisitId = Number(todo?.visitId || 0);
            if (todoVisitId > 0) {
                return todoVisitId === selectedVisit.id;
            }

            const createdAtDate = String(todo?.createdAt || todo?.createTime || "").slice(0, 10);
            return Boolean(selectedVisitDate) && createdAtDate === selectedVisitDate;
        });
    }, [todos, selectedVisit, selectedVisitDate]);

    const dailyPurchaseItems = useMemo(() => dailyUsageSummary.filter((item) => ["ticket_new", "membership_new"].includes(item.sourceType)), [dailyUsageSummary]);
    const dailyUsageItems = useMemo(() => dailyUsageSummary.filter((item) => ["ticket_usage", "membership_deduction"].includes(item.sourceType)), [dailyUsageSummary]);
    const dailyRefundItems = useMemo(() => dailyUsageSummary.filter((item) => item.sourceType === "refund"), [dailyUsageSummary]);
    const paidAmount = useMemo(() => {
        if (!selectedVisitDate) return 0;
        return paymentRecords.reduce((sum, row) => {
            const status = String(row?.status ?? "paid").trim().toLowerCase();
            if (status === "refunded" || status === "cancelled") return sum;
            const paidAtDate = String(row?.paidAt || "").slice(0, 10);
            if (!paidAtDate || paidAtDate !== selectedVisitDate) return sum;
            return sum + paymentService.calcActualPaidAmount(row);
        }, 0);
    }, [paymentRecords, selectedVisitDate]);
    const dueAmount = cartPreview?.totalCashRequired ?? totalAmount;
    const remaining = Math.max(0, dueAmount - paidAmount);

    const enabledCoupons = useMemo(() => {
        return (settings.chartConfig?.coupons || [])
            .filter((coupon: any) => coupon?.enabled)
            .slice()
            .sort((a: any, b: any) => Number(a?.order || 0) - Number(b?.order || 0));
    }, [settings.chartConfig?.coupons]);
    const sortedPatientRecords = useMemo(() => {
        return [...patientRecords].sort((a, b) => {
            const pinDiff = Number(Boolean(b?.isPinned)) - Number(Boolean(a?.isPinned));
            if (pinDiff !== 0) return pinDiff;
            const aTime = new Date(a?.createdAt || 0).getTime();
            const bTime = new Date(b?.createdAt || 0).getTime();
            return bTime - aTime;
        });
    }, [patientRecords]);
    const selectedCouponLabel = useMemo(() => {
        const selected = enabledCoupons.find((coupon: any) => String(coupon.id) === String(selectedCouponId));
        if (!selected) return "쿠폰 미적용";
        return `${selected.label} (${Number(selected.discountPercent || 0)}% 할인)`;
    }, [enabledCoupons, selectedCouponId]);
    const totalMembershipBalance = useMemo(
        () => membershipBalances.reduce((sum, membership) => sum + Math.max(0, Number(membership.balance || 0)), 0),
        [membershipBalances]
    );
    const prioritizedMembershipIds = useMemo(
        () => buildPrioritizedMembershipIds(membershipBalances, selectedMembershipId, isMembershipUsageDisabled),
        [isMembershipUsageDisabled, membershipBalances, selectedMembershipId]
    );
    const selectedMembershipLabel = useMemo(() => {
        if (isMembershipUsageDisabled) return "회원권 미사용";
        if (!selectedMembershipId) return "회원권 미사용";
        const found = membershipBalances.find((m) => m.id === selectedMembershipId);
        if (!found) return "회원권 미사용";
        return `${found.name} (${found.balance.toLocaleString()}원, ${found.discountPercent}% 할인)`;
    }, [isMembershipUsageDisabled, membershipBalances, selectedMembershipId]);

    useEffect(() => {
        if (!patientIdStr || !selectedVisitDate) {
            setDailyUsageSummary([]);
            return;
        }

        let cancelled = false;

        const loadDailyUsageSummary = async () => {
            try {
                const patientIdNum = Number(patientIdStr);
                if (!Number.isFinite(patientIdNum) || patientIdNum <= 0) {
                    if (!cancelled) setDailyUsageSummary([]);
                    return;
                }

                const usageItems = await paymentService.getUsageSummary(
                    patientIdNum,
                    selectedVisitDate,
                    selectedVisit?.id || undefined
                );

                if (!cancelled) {
                    setDailyUsageSummary(Array.isArray(usageItems) ? usageItems : []);
                }
            } catch (error) {
                console.error("Failed to load daily usage summary:", error);
                if (!cancelled) {
                    setDailyUsageSummary([]);
                }
            }
        };

        void loadDailyUsageSummary();

        return () => {
            cancelled = true;
        };
    }, [memberships, patientIdStr, paymentRecords, selectedVisit?.id, selectedVisitDate, tickets]);
    const consentTemplates = useMemo(() => {
        const fromLocalChart = (chartConfig as any)?.forms?.templates;
        const fromStoreChart = (settings.chartConfig as any)?.forms?.templates;
        const fromStoreForms = (settings.forms as any)?.templates;

        const candidates = [fromLocalChart, fromStoreChart, fromStoreForms].find(
            (arr) => Array.isArray(arr) && arr.length > 0
        );
        return Array.isArray(candidates) ? candidates : [];
    }, [chartConfig, settings.chartConfig, settings.forms]);
    const [chartMembers, setChartMembers] = useState<{ id: string; name: string; departmentId: string }[]>([]);
    const [chartDepartments, setChartDepartments] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        const branchId = Number(settings.activeBranchId) || 1;
        Promise.all([
            memberConfigService.getMembers(branchId).catch(() => []),
            memberConfigService.getDepartments(branchId).catch(() => []),
        ]).then(([members, depts]) => {
            setChartMembers((members || []).map((u: any) => ({ id: String(u.id), name: String(u.name || ""), departmentId: String(u.departmentId || "") })));
            setChartDepartments((depts || []).map((d: any) => ({ id: String(d.id), name: String(d.name || "") })));
        });
    }, [settings.activeBranchId]);

    const counselorMembers = useMemo(() => {
        if (chartMembers.length === 0) return [];
        return chartMembers.filter((u) => {
            const dept = chartDepartments.find((d) => d.id === u.departmentId);
            return !dept || !(dept.name.includes("원장") || dept.name.includes("진료") || dept.name.includes("의사"));
        });
    }, [chartMembers, chartDepartments]);
    const doctorMembers = useMemo(() => {
        if (chartMembers.length === 0) return [];
        return chartMembers.filter((u) => {
            const dept = chartDepartments.find((d) => d.id === u.departmentId);
            return !dept || (dept.name.includes("원장") || dept.name.includes("진료") || dept.name.includes("의사"));
        });
    }, [chartMembers, chartDepartments]);
    const selectedCounselorId = String((selectedVisit as any)?.counselorId || (selectedVisit?.consultation as any)?.counselorId || "");
    const selectedDoctorCounselorId = String((selectedVisit as any)?.doctorCounselorId || (selectedVisit?.consultation as any)?.doctorCounselorId || "");
    const selectedCounselorLabel =
        counselorMembers.find((member) => member.id === selectedCounselorId)?.name || "미지정";
    const selectedDoctorCounselorLabel = doctorMembers.find((member) => member.id === selectedDoctorCounselorId)?.name || "미지정";
    const { procedureCategories: chartProcedureCategories } = useChartStore();
    const reservationCategoryNameById = useMemo(() => {
        return new Map<string, string>(
            (chartProcedureCategories || []).map((category: any) => [
                String(category?.id ?? ""),
                String(category?.name ?? ""),
            ])
        );
    }, [chartProcedureCategories]);
    const reservationMemberNameById = useMemo(
        () =>
            new Map<string, string>(
                ((settings.members?.users || []) as any[]).map((user: any) => [
                    String(user?.id ?? ""),
                    String(user?.name ?? ""),
                ])
            ),
        [settings.members?.users]
    );

    const departmentUserGroups = useMemo(() => {
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
    }, [settings.members?.users, settings.members?.departments]);

    const waitLocations = useMemo(() => {
        if (settings.chartConfig?.waitLists && settings.chartConfig.waitLists.length > 0) {
            return settings.chartConfig.waitLists
                .filter((w) => w.enabled)
                .sort((a, b) => a.order - b.order)
                .map((w) => ({ id: w.id || w.label, label: w.label }));
        }
        return [
            { id: "main_wait", label: "대기실" },
            { id: "proc_room", label: "시술실" },
            { id: "care_room", label: "관리실" },
        ];
    }, [settings.chartConfig]);

    const memoSections = useMemo(() => {
        if (settings.chartConfig?.memoSections && settings.chartConfig.memoSections.length > 0) {
            return settings.chartConfig.memoSections
                .filter((m) => m.enabled)
                .sort((a, b) => a.order - b.order);
        }
        return [
            { id: "chart1", label: "관리", enabled: true, order: 1 },
            { id: "chart2", label: "원장상담", enabled: true, order: 2 },
            { id: "chart3", label: "실장상담", enabled: true, order: 3 },
        ];
    }, [settings.chartConfig?.memoSections]);

    const historyMemoSections = useMemo(
        () => memoSections.filter((section) => section.showInVisitHistory !== false),
        [memoSections]
    );

    const handleOpenMemoSectionSettings = useCallback(() => {
        const labelDraft: Record<string, string> = {};
        const visibilityDraft: Record<string, boolean> = {};
        memoSections.forEach((section, idx) => {
            labelDraft[section.id] = String(section.label || `${idx + 1}열`);
            visibilityDraft[section.id] = section.showInVisitHistory !== false;
        });
        setMemoSectionLabelDraft(labelDraft);
        setMemoSectionHistoryVisibilityDraft(visibilityDraft);
        setIsMemoSectionSettingsOpen(true);
    }, [memoSections]);

    const handleSaveMemoSectionSettings = useCallback(async () => {
        if (memoSectionSaving) return;
        const sourceSections = [...memoSections].sort((a, b) => a.order - b.order);
        if (sourceSections.length === 0) {
            setIsMemoSectionSettingsOpen(false);
            return;
        }

        const nextMemoSections: ChartMemoSection[] = sourceSections.map((section, idx) => {
            const nextLabel = String(memoSectionLabelDraft[section.id] || "").trim() || section.label || `${idx + 1}열`;
            return {
                ...section,
                label: nextLabel,
                showInVisitHistory: memoSectionHistoryVisibilityDraft[section.id] !== false,
            };
        });

        setMemoSectionSaving(true);
        try {
            const branchId = String(settings.activeBranchId || "1");
            const updated = await chartConfigService.update(branchId, { memoSections: nextMemoSections });
            const mergedChartConfig = {
                ...(settings.chartConfig || chartConfig || {}),
                memoSections: updated.memoSections && updated.memoSections.length > 0 ? updated.memoSections : nextMemoSections,
            } as ChartConfigSettings;
            setChartConfig(mergedChartConfig);
            updateSettings({ chartConfig: mergedChartConfig });
            setIsMemoSectionSettingsOpen(false);
        } catch (error) {
            console.error("Failed to save memo section settings:", error);
            showAlert({ message: "차트 메모 항목 설정 저장에 실패했습니다.", type: "warning" });
        } finally {
            setMemoSectionSaving(false);
        }
    }, [
        memoSectionHistoryVisibilityDraft,
        memoSectionLabelDraft,
        memoSectionSaving,
        memoSections,
        settings.activeBranchId,
        settings.chartConfig,
        chartConfig,
        updateSettings,
    ]);

    // --- Persistence Load ---
    const loadPersistenceData = useCallback(async (pId: number) => {
        try {
            const branchId = settings.activeBranchId || "1";
            const statsDate = format(new Date(), "yyyy-MM-dd");
            const results = await Promise.allSettled([
                cartService.getCart(pId),
                paymentService.listByPatient(pId),
                procedureService.getByCustomer(pId),
                patientRecordService.getByPatientId(pId),
                ticketService.getTickets(pId),
                paymentService.getPaymentRecords(pId),
                membershipService.getMemberships(pId),
                procedureTodoStatsService.getDashboard({
                    branchId,
                    fromDateISO: statsDate,
                    toDateISO: statsDate,
                }),
                visitService.getAllReservationsByCustomer(pId),
            ]);

            // Cart
            if (results[0].status === "fulfilled") setCartItems(results[0].value as any);
            else console.error("Failed to load cart:", results[0].reason);

            // Payments
            if (results[1].status === "fulfilled") setPayments(results[1].value as any);
            else {
                console.error("Failed to load payments:", results[1].reason);
                setPayments([]);
            }

            if (results[2].status === "fulfilled") {
                const procs = (results[2].value as CustomerProcedure[]) || [];
                setTodos(procs.map((p) => ({
                    id: p.id,
                    customerId: p.customerId,
                    visitId: p.chartId,
                    content: p.name,
                    sourceType: p.sourceType,
                    isCompleted: p.isCompleted,
                    status: p.status as any,
                    createdAt: p.createdAt,
                    creator: p.creator,
                    assigneeUserId: (p as any).managedByUserId ?? undefined,
                    assignee: p.managedByUserName,
                    startedAt: p.startTime,
                    completedAt: p.endTime,
                })) as any[]);
            } else console.error("Failed to load procedures:", results[2].reason);


            // Records
            if (results[3].status === "fulfilled") setPatientRecords((results[3].value as any) || []);
            else console.error("Failed to load records:", results[3].reason);

            // Tickets
            if (results[4].status === "fulfilled") setTickets((results[4].value as any[]) || []);
            else console.error("Failed to load tickets:", results[4].reason);

            // Payment Records (NEW)
            if (results[5].status === "fulfilled") setPaymentRecords((results[5].value as any[]) || []);
            else console.error("Failed to load payment records:", results[5].reason);

            // Memberships
            if (results[6].status === "fulfilled") setMemberships((results[6].value as any[]) || []);
            else console.error("Failed to load memberships:", results[6].reason);

            // Queue stats for ticket guidance
            if (results[7].status === "fulfilled") {
                const ticketDefs = useSettingsStore.getState().settings.tickets?.items || [];
                const procedureDurationOverrides = buildProcedureDurationOverrideMap(ticketDefs);
                let capacityMap: Record<string, number> = {};
                try {
                    const cats = await categoryTicketDefService.getAll();
                    cats.forEach(c => {
                        if (c.equipmentCount > 1) {
                            capacityMap[normalizeQueueProcedureKey(c.name)] = c.equipmentCount;
                        }
                    });
                } catch {}
                setTicketQueueByProcedure(
                    buildProcedureQueueMap(results[7].value?.byProcedure || [], {
                        averageByProcedureKey: procedureDurationOverrides,
                        capacityByProcedureKey: capacityMap,
                    })
                );
            } else {
                console.error("Failed to load todo queue stats:", results[7].reason);
                setTicketQueueByProcedure({});
            }
            // Customer reservations
            if (results[8]?.status === "fulfilled") setCustomerReservations((results[8].value as any[]) || []);

        } catch (e) {
            console.error("Critical error loading persistence data", e);
            setTicketQueueByProcedure({});
        }
    }, [settings.activeBranchId]);


    // --- Main Refresh ---
    const refreshChartData = useCallback(async () => {
        if (!patientIdStr) return;

        const pId = Number(patientIdStr);
        if (!Number.isFinite(pId)) return;

        setLoading(true);
        setError(null);
        let log = "";

        try {
            const numericBranchId = Number(settings.activeBranchId) || 1;
            log += `Br:${String(settings.activeBranchId)}/${numericBranchId} `;

            const [pt, vs, visitHistory, cfg, pay, members, depts] = await Promise.all([
                patientService.getById(pId).catch((e: any) => {
                    log += `PtErr:${e?.message || "?"} `;
                    throw e;
                }),
                visitService.getByPatientId(pId).catch((e: any) => {
                    log += `VsErr:${e?.message || "?"} `;
                    return [];
                }),
                visitService.getVisitHistory(pId).catch((e: any) => {
                    log += `VhErr:${e?.message || "?"} `;
                    return [];
                }),
                chartConfigService.get(String(numericBranchId)).catch((e: any) => {
                    log += `CfgErr:${e?.message || "?"} `;
                    return null;
                }),
                paymentService.listByPatient(pId).catch((e: any) => {
                    log += `PayErr:${e?.message || "?"} `;
                    return [];
                }),
                memberConfigService.getMembers(numericBranchId).catch((e: any) => {
                    log += `MErr:${e?.message || "?"} `;
                    return [];
                }),
                memberConfigService.getDepartments(numericBranchId).catch((e: any) => {
                    log += `DErr:${e?.message || "?"} `;
                    return [];
                }),
            ]);

            log += `M:${(members as any[])?.length || 0} D:${(depts as any[])?.length || 0} `;

            if (!pt) {
                showAlert({ message: "존재하지 않는 환자입니다", type: "error" });
                navigate("/app/chart");
                return;
            }

            // residentNumber mock
            const ptAny = pt as any;
            if (ptAny && !ptAny.residentNumber) {
                const y = ptAny.birthDate ? ptAny.birthDate.substring(2, 4) : "00";
                const m = ptAny.birthDate ? ptAny.birthDate.substring(5, 7) : "01";
                const d = ptAny.birthDate ? ptAny.birthDate.substring(8, 10) : "01";
                const genderCode = ptAny.sex === "M" ? "1" : "2";
                ptAny.residentNumber = `${y}${m}${d}-${genderCode}******`;
            }

            setPatient(pt as any);

            const activeVisits = (vs as any[])
                .filter((v: any) => v.status !== "cancelled")
                .map((v: any) => ({ ...v, room: v.room || v.currentLocationName || undefined }));
            setVisits(activeVisits as any);

            const visitRoomMap = new Map(activeVisits.map((v: any) => [v.id, v.room || v.currentLocationId || v.currentLocationName]));
            const chartHistory = ((visitHistory as any[]) || []).map((v: any) => ({
                ...v,
                room: v.room || visitRoomMap.get(v.id) || undefined,
            }));
            setChartVisitsData(chartHistory);
            const firstChartVisit = chartHistory.length > 0 ? chartHistory[0] : null;

            setSelectedVisitId((prev) => {
                if (prev !== null) {
                    const selectedIsChartVisit = chartHistory.some((v: any) => v.id === prev);
                    if (selectedIsChartVisit) return prev;
                }
                return firstChartVisit?.id ?? null;
            });

            setPayments(pay as any);

            const membersUpdate = {
                ...(settings.members || { users: [], departments: [] }),
                users: (members as any[]) || [],
                departments: ((depts as any[]) || []).map((d: any) => ({
                    id: String(d.id),
                    name: d.name,
                    order: d.displayOrder,
                })),
            };

            if (cfg) {
                setChartConfig(cfg as any);
                updateSettings({
                    chartConfig: cfg,
                    tickets: (cfg as any).tickets,
                    forms: (cfg as any).forms || settings.forms,
                    members: membersUpdate,
                });
                log += "UpdSet ";
            } else {
                updateSettings({ members: membersUpdate });
                log += "NoCfg+Members ";
            }

            await loadPersistenceData(pId);
        } catch (e: any) {
            console.error("Failed to load chart data", e);
            log += `Fail:${e?.message || "?"} `;
            setError(e?.response?.data?.message || e?.message || "데이터 로드 실패");
        } finally {
            setLoading(false);
            setRefreshing(false);
            setChartDataVersion((v) => v + 1);
            setDebugLog(log);
        }
    }, [patientIdStr, settings.activeBranchId, updateSettings, navigate, loadPersistenceData, isReservationVisit]);

    useEffect(() => {
        refreshChartData();
        const intervalId = setInterval(() => {
            // (optional) silent refresh
        }, 5000);
        return () => clearInterval(intervalId);
    }, [refreshChartData]);

    const handleChartLockEvent = useCallback((data: any) => {
        if (!data || data.eventType !== 'chart_lock') return;
        const pId = Number(patientIdStr);
        if (data.customerId !== pId) return;

        const eventUserId = data.userId ?? null;
        const isMine = myUserIdRef.current != null && eventUserId === myUserIdRef.current;

        if (data.mode === 'lock' || data.isLocked) {
            setIsChartLocked(true);
            setLockingUserId(eventUserId);
            setLockingUserName(data.userName ?? null);
            setIsLockedByMe(isMine);
        } else if (data.mode === 'unlock' || data.isLocked === false) {
            if (isLockedByMe && !isMine) {
                const forcerName = data.userName || "다른 사용자";
                showAlert({ message: `${forcerName}님이 차트를 강제잠금해제 하셨습니다.`, type: "warning" });
                refreshChartData();
            }
            setIsChartLocked(false);
            setLockingUserId(null);
            setLockingUserName(null);
            setIsLockedByMe(false);
        }
    }, [patientIdStr, isLockedByMe, showAlert, refreshChartData]);

    const handleProcedureStatusEvent = useCallback((data: any) => {
        if (!data || data.eventType !== 'procedure_status') return;
        const pId = Number(patientIdStr);
        if (data.customerId !== pId) return;
        setTodos((prev) => prev.map((t) =>
            t.id === data.procedureId
                ? {
                    ...t,
                    status: data.status,
                    isCompleted: data.status === "done",
                    assigneeUserId: data.managedByUserId ?? undefined,
                    assignee: data.managedByUserName ?? undefined,
                    startedAt: data.startTime ?? undefined,
                    completedAt: data.endTime ?? undefined,
                }
                : t
        ));
    }, [patientIdStr]);

    const handleSignalREvent = useCallback((data: any) => {
        handleChartLockEvent(data);
        handleProcedureStatusEvent(data);
    }, [handleChartLockEvent, handleProcedureStatusEvent]);

    useChartSignalR({
        onRefreshRequired: refreshChartData,
        onEventData: handleSignalREvent,
        events: VIEW_EVENT_MAP.chart,
    });

    useEffect(() => {
        const pId = Number(patientIdStr);
        if (!Number.isFinite(pId) || pId <= 0) return;

        chartLockCleanupRef.current = false;

        const applyLockState = (result: any) => {
            const isMine = Boolean(result.isLockedByMe);
            if (result.isLocked) {
                setIsChartLocked(true);
                setIsLockedByMe(isMine);
                setLockingUserId(result.lockingUserId ?? null);
                setLockingUserName(result.lockingUserName ?? null);
                if (isMine) {
                    myUserIdRef.current = result.lockingUserId ?? null;
                }
                if (!isMine) {
                    showAlert({ message: result.message || "차트가 잠겨있습니다.", type: "warning" });
                }
            } else {
                setIsChartLocked(false);
                setIsLockedByMe(false);
                setLockingUserId(null);
                setLockingUserName(null);
            }
        };

        const initLock = async () => {
            try {
                const status = await visitService.getChartLockStatus(pId);
                if (status.isLocked && !status.isLockedByMe) {
                    applyLockState(status);
                    return;
                }
                const result = await visitService.lockChartsByCustomer(pId);
                applyLockState(result);
            } catch (e: any) {
                console.error("Chart lock failed:", e);
            }
        };

        initLock();

        const handleBeforeUnload = () => {
            flushDirtyFieldsRef.current();
            if (!chartLockCleanupRef.current && isLockedByMeRef.current) {
                const baseUrl = (import.meta.env.VITE_API_BASE_URL as string || '').replace(/\/+$/, '');
                const token = sessionStorage.getItem('auth_token');
                fetch(`${baseUrl}/charts/customer/${pId}/chartlock`, {
                    method: 'DELETE',
                    keepalive: true,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-Branch-Id': String(pId),
                    },
                }).catch(() => {});
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            flushDirtyFieldsRef.current();
            if (!chartLockCleanupRef.current && isLockedByMeRef.current) {
                chartLockCleanupRef.current = true;
                visitService.unlockChartsByCustomer(pId).catch(() => {});
            }
        };
    }, [patientIdStr]);

    const handleUnlockChart = useCallback(async () => {
        const pId = Number(patientIdStr);
        if (!Number.isFinite(pId) || isLockBusy) return;
        setIsLockBusy(true);
        try {
            await visitService.unlockChartsByCustomer(pId);
            chartLockCleanupRef.current = true;
            setIsChartLocked(false);
            setIsLockedByMe(false);
            setLockingUserId(null);
            setLockingUserName(null);
        } catch (e: any) {
            console.error("Unlock failed:", e);
            showAlert({ message: "잠금 해제 실패", type: "error" });
        } finally {
            setIsLockBusy(false);
        }
    }, [patientIdStr, showAlert, isLockBusy]);

    const handleForceUnlockChart = useCallback(async () => {
        const pId = Number(patientIdStr);
        if (!Number.isFinite(pId) || isLockBusy) return;
        setIsLockBusy(true);
        try {
            await visitService.forceUnlockChartsByCustomer(pId);
            const result = await visitService.lockChartsByCustomer(pId);
            if (result.success) {
                chartLockCleanupRef.current = false;
                setIsChartLocked(true);
                setIsLockedByMe(true);
                setLockingUserId(result.lockingUserId ?? null);
                setLockingUserName(result.lockingUserName ?? null);
                myUserIdRef.current = result.lockingUserId ?? null;
                await refreshChartData();
            } else {
                setIsChartLocked(true);
                setIsLockedByMe(false);
                setLockingUserId(result.lockingUserId ?? null);
                setLockingUserName(result.lockingUserName ?? null);
                showAlert({ message: result.message || "차트 잠금 실패", type: "warning" });
            }
        } catch (e: any) {
            console.error("Force unlock failed:", e);
            showAlert({ message: e?.response?.data?.message || "강제 잠금 해제 실패", type: "error" });
        } finally {
            setIsLockBusy(false);
        }
    }, [patientIdStr, showAlert, refreshChartData, isLockBusy]);

    const handleLockChart = useCallback(async () => {
        const pId = Number(patientIdStr);
        if (!Number.isFinite(pId) || isLockBusy) return;
        setIsLockBusy(true);
        try {
            const result = await visitService.lockChartsByCustomer(pId);
            if (result.success) {
                chartLockCleanupRef.current = false;
                setIsChartLocked(true);
                setIsLockedByMe(true);
                setLockingUserId(result.lockingUserId ?? null);
                setLockingUserName(result.lockingUserName ?? null);
                myUserIdRef.current = result.lockingUserId ?? null;
                await refreshChartData();
            } else {
                setIsChartLocked(true);
                setIsLockedByMe(false);
                setLockingUserId(result.lockingUserId ?? null);
                setLockingUserName(result.lockingUserName ?? null);
                showAlert({ message: result.message || "차트 잠금 실패", type: "warning" });
            }
        } catch (e: any) {
            console.error("Lock failed:", e);
            showAlert({ message: "차트 잠금 실패", type: "error" });
        } finally {
            setIsLockBusy(false);
        }
    }, [patientIdStr, showAlert, refreshChartData, isLockBusy]);

    useEffect(() => {
        if (!selectedCouponId) return;
        const exists = enabledCoupons.some((coupon: any) => String(coupon.id) === String(selectedCouponId));
        if (!exists) {
            setSelectedCouponId(undefined);
        }
    }, [enabledCoupons, selectedCouponId]);

    useEffect(() => {
        if (!isCouponDropdownOpen) return;
        const handleOutsideClick = (event: MouseEvent) => {
            if (!couponDropdownRef.current) return;
            if (couponDropdownRef.current.contains(event.target as Node)) return;
            setIsCouponDropdownOpen(false);
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [isCouponDropdownOpen]);
    useEffect(() => {
        if (!isCounselorDropdownOpen && !isDoctorDropdownOpen) return;
        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (counselorDropdownRef.current?.contains(target)) return;
            if (doctorDropdownRef.current?.contains(target)) return;
            setIsCounselorDropdownOpen(false);
            setIsDoctorDropdownOpen(false);
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [isCounselorDropdownOpen, isDoctorDropdownOpen]);

    useEffect(() => {
        if (!isSearchOpen) return;
        const handleOutsideClick = (event: MouseEvent) => {
            if (!searchRef.current) return;
            if (searchRef.current.contains(event.target as Node)) return;
            setIsSearchOpen(false);
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [isSearchOpen]);

    useEffect(() => {
        if (!isLocationDropdownOpen) return;
        const handleOutsideClick = (event: MouseEvent) => {
            if (!locationDropdownRef.current) return;
            if (locationDropdownRef.current.contains(event.target as Node)) return;
            setIsLocationDropdownOpen(false);
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [isLocationDropdownOpen]);

    useEffect(() => {
        setIsMembershipUsageDisabled(false);
    }, [patientIdStr]);

    useEffect(() => {
        if (membershipBalances.length === 0) {
            if (selectedMembershipId !== undefined) {
                setSelectedMembershipId(undefined);
            }
            if (isMembershipUsageDisabled) {
                setIsMembershipUsageDisabled(false);
            }
            return;
        }

        if (isMembershipUsageDisabled) {
            return;
        }

        const exists = membershipBalances.some((membership) => membership.id === selectedMembershipId);
        if (!exists) {
            const firstMembership = membershipBalances[0];
            if (firstMembership) {
                setSelectedMembershipId(firstMembership.id);
            }
        }
    }, [isMembershipUsageDisabled, membershipBalances, selectedMembershipId]);

    // Load cart preview and membership balances when patient or cart changes
    useEffect(() => {
        let isDisposed = false;

        const loadCartPreview = async () => {
            if (!patientIdStr) return;
            const pId = Number(patientIdStr);
            if (!Number.isFinite(pId)) return;

            try {
                // Load membership balances for selector
                const balanceResponse = await membershipService.getMembershipBalances(pId);
                const nextBalances = Array.isArray(balanceResponse?.memberships) ? balanceResponse.memberships : [];
                if (!isDisposed) {
                    setMembershipBalances((prev) =>
                        areMembershipBalancesEqual(prev, nextBalances) ? prev : nextBalances
                    );
                }

                const previewMembershipIds = buildPrioritizedMembershipIds(
                    nextBalances,
                    selectedMembershipId,
                    isMembershipUsageDisabled
                );

                // Load cart preview
                const preview = await cartService.preview(pId, {
                    useMembership: previewMembershipIds.length > 0,
                    selectedMembershipId: isMembershipUsageDisabled ? undefined : selectedMembershipId,
                    selectedMembershipIds: previewMembershipIds,
                    selectedCouponId,
                });
                if (!isDisposed) {
                    setCartPreview(preview);
                }
            } catch (error) {
                console.error('Failed to load cart preview:', error);
            }
        };

        loadCartPreview();
        return () => {
            isDisposed = true;
        };
    }, [patientIdStr, cartItems, selectedMembershipId, selectedCouponId, isMembershipUsageDisabled]);


    // --- Handlers ---
    const handleOpenReservationHistory = async (visit: Visit) => {
        setSelectedReservationVisit(visit);
        setIsReservationHistoryModalOpen(true);
        setIsReservationHistoryLoading(true);
        setReservationHistoryError(null);
        try {
            const rows = await visitService.getAppointmentChanges(Number(visit.id));
            setReservationHistoryItems(Array.isArray(rows) ? rows : []);
        } catch (error: any) {
            console.error("Failed to fetch reservation history", error);
            const message =
                error?.response?.data?.message ||
                error?.message ||
                "예약 변경 이력을 불러오지 못했습니다.";
            setReservationHistoryItems([]);
            setReservationHistoryError(message);
        } finally {
            setIsReservationHistoryLoading(false);
        }
    };

    const handleCreateVisit = async (data: any) => {
        const targetPatientId = data.patientId || patient?.id;
        if (!targetPatientId) return;

        try {
            const visitPurposeLabel = String(data.visitPurpose || "").trim();
            const memoText = String(data.memo || "").trim();
            const composedMemo = visitPurposeLabel
                ? `[${visitPurposeLabel}] ${memoText}`.trim()
                : memoText;
            const newVisit = await visitService.createVisit({
                branchId: String(patient?.branchId || settings.activeBranchId || "guro"),
                patientId: targetPatientId,
                status: "wait",
                memo: composedMemo || undefined,
                room: data.room || "main_wait",
                doctorName: data.doctor || undefined,
                visitPurposeIds: data.visitPurposeId ? [data.visitPurposeId] : undefined,
                registerTime: new Date().toISOString(),
            });

            if (patient && patient.id === targetPatientId) {
                setVisits((prev) => [newVisit as any, ...prev]);
                await refreshChartData();
                setSelectedVisitId((newVisit as any).id);
            } else {
                showAlert({ message: "접수가 완료되었습니다", type: "success" });
            }

            setShowReceptionModal(false);
            setShowVisitCreationModal(false);
        } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || "Unknown error";
            showAlert({ message: `접수 생성 실패: ${msg}`, type: "error" });
        }
    };

    const handleReceptionSubmit = async (data: any) => {
        if (!patient) return;

        const todayStr = format(new Date(), "yyyy-MM-dd");
        const hasVisitToday = visits.some((v: any) => v.scheduledAt && String(v.scheduledAt).startsWith(todayStr));

        if (hasVisitToday) {
            if (
                !(await showConfirm({
                    message: "오늘 이미 접수된 내역이 있습니다.\n추가로 접수하시겠습니까?\n(확인 시 새로운 차트가 별도로 생성됩니다)",
                    type: "warning",
                }))
            ) {
                return;
            }
        }

        await handleCreateVisit({ ...data, patientId: patient!.id });
    };

    const handleDeleteVisit = async (chartId: number) => {
        if (!(await showConfirm({ message: "정말 이 내원기록을 삭제하시겠습니까?\n(복구 불가)", type: "error", confirmText: "삭제", cancelText: "닫기" }))) return;
        try {
            await visitService.deleteChart(chartId);
            setChartVisitsData((prev) => prev.filter((v) => v.id !== chartId));
            setSelectedVisitId((prev) => {
                if (prev !== chartId) return prev;
                const remaining = chartVisitsData.filter((v) => v.id !== chartId);
                return remaining.length > 0 ? (remaining[0]?.id ?? null) : null;
            });
        } catch (e) {
            console.error("Failed to delete chart", e);
            showAlert({ message: "삭제 실패", type: "error" });
        }
    };

    const handleDeleteTicket = async (ticketId: number) => {
        if (!(await showConfirm({ message: "정말 이 티켓 이력을 삭제하시겠습니까?\n(복구 불가)", type: "error", confirmText: "삭제", cancelText: "닫기" }))) return;
        try {
            await ticketService.deleteTicket(ticketId);
            setTickets((prev) => prev.filter((t) => t.id !== ticketId));
            setTicketHistoryByTicketId((prev) => {
                const next = { ...prev };
                delete next[ticketId];
                return next;
            });
            if (expandedTicketId === ticketId) {
                setExpandedTicketId(null);
            }
        } catch (e) {
            console.error("Failed to delete ticket", e);
            showAlert({ message: "티켓 삭제 실패", type: "error" });
        }
    };

    const handleUseTicket = async (ticket: any) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (selectedVisitDate && selectedVisitDate !== todayStr) {
            const allow = await showConfirm({
                message: `현재 차트는 오늘 날짜(${todayStr})가 아닙니다 (차트 날짜: ${selectedVisitDate}).\n그래도 티켓을 사용 처리하시겠습니까?`,
                type: "warning",
                confirmText: "사용",
                cancelText: "취소",
            });
            if (!allow) return;
        }

        const ticketDef = settings.tickets?.items?.find(
            (item: any) => item.name === ticket.itemName || String(item.id) === String(ticket.itemId)
        );

        const isPeriod = ticketDef?.usageUnit === "period";
        let allowCycleOverride = false;
        let allowDayTimeOverride = false;

        if (ticketDef) {
            const now = new Date();

            // 1. Day of Week Check (회수권/기간권 공통)
            if (ticketDef.allowedDays && ticketDef.allowedDays.length > 0) {
                if (!ticketDef.allowedDays.includes(now.getDay())) {
                    const allow = await showConfirm({
                        message: `오늘은 사용 가능한 요일이 아닙니다.\n그래도 사용하시겠습니까?`,
                        type: "warning",
                        confirmText: "사용",
                        cancelText: "취소",
                    });
                    if (!allow) return;
                    allowDayTimeOverride = true;
                }
            }

            // 2. Time Range Check (회수권/기간권 공통)
            if (ticketDef.allowedTimeRange && (ticketDef.allowedTimeRange.start || ticketDef.allowedTimeRange.end)) {
                const toMinutes = (s?: string) => {
                    if (!s) return null;
                    const [h, m] = s.split(":").map(Number);
                    if (!Number.isFinite(h)) return null;
                    return h * 60 + (Number.isFinite(m) ? m : 0);
                };
                const startMin = toMinutes(ticketDef.allowedTimeRange.start) ?? 0;
                const endMin = toMinutes(ticketDef.allowedTimeRange.end) ?? (24 * 60);
                const currentMin = now.getHours() * 60 + now.getMinutes();
                if (currentMin < startMin || currentMin >= endMin) {
                    const startLabel = ticketDef.allowedTimeRange.start ?? "00:00";
                    const endLabel = ticketDef.allowedTimeRange.end ?? "24:00";
                    const allow = await showConfirm({
                        message: `사용 가능한 시간대가 아닙니다.\n허용: ${startLabel} ~ ${endLabel}\n그래도 사용하시겠습니까?`,
                        type: "warning",
                        confirmText: "사용",
                        cancelText: "취소",
                    });
                    if (!allow) return;
                    allowDayTimeOverride = true;
                }
            }

            // 3. Minimum Interval Check (회수권/기간권 공통)
            if (ticketDef.minIntervalDays && ticketDef.minIntervalDays > 0 && ticket.lastUsedAt) {
                const lastUsed = new Date(ticket.lastUsedAt);
                const diffTime = Math.abs(Date.now() - lastUsed.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= ticketDef.minIntervalDays) {
                    const allow = await showConfirm({
                        message: `최소 주기(${ticketDef.minIntervalDays}일)가 경과하지 않았습니다.\n마지막 사용일: ${format(
                            lastUsed,
                            "yyyy-MM-dd"
                        )}\n그래도 사용하시겠습니까?`,
                        type: "warning",
                    });
                    if (!allow) return;
                    allowCycleOverride = true;
                }
            }

            // 4. Max Count Check (기간권 전용 — 회수권은 remainingCount 로 자동 차단)
            if (isPeriod && ticketDef.maxTotalCount && ticketDef.maxTotalCount > 0) {
                const currentUsage = ticket.usageCount || 0;
                if (currentUsage >= ticketDef.maxTotalCount) {
                    showAlert({ message: `최대 사용 횟수(${ticketDef.maxTotalCount}회)를 초과하여 사용할 수 없습니다.`, type: "warning" });
                    return;
                }
            }
        }

        if (!(await showConfirm({ message: `${ticket.itemName} 1회를 사용하시겠습니까?`, type: "info", confirmText: "사용", cancelText: "닫기" }))) return;

        try {
            const isPackage = ticketDef?.usageUnit === "package";
            const usageCountNow = Number(ticket.usageCount ?? ticket.UsageCount ?? 0);
            const nextRound = isPackage ? Math.max(1, usageCountNow + 1) : undefined;
            const matchedRound = isPackage && Array.isArray(ticketDef?.rounds)
                ? ticketDef.rounds.find((round: any) => Number(round?.round || 0) === nextRound)
                : null;
            const usedTreatments = Array.isArray(matchedRound?.treatments)
                ? matchedRound.treatments.map((name: any) => String(name || "").trim()).filter(Boolean)
                : undefined;

            await ticketService.useTicket(ticket.id, isPeriod, {
                usedRound: nextRound,
                usedTreatments,
                allowCycleOverride,
                allowDayTimeOverride,
                visitId: selectedVisit?.id,
            });

            setTickets((prev) =>
                prev.map((t) => {
                    if (t.id !== ticket.id) return t;
                    const newUsageCount = (t.usageCount || 0) + 1;
                    const newRemaining = typeof t.remainingCount === "number" ? Math.max(0, t.remainingCount - 1) : t.remainingCount;
                    return {
                        ...t,
                        usageCount: newUsageCount,
                        remainingCount: newRemaining,
                        lastUsedAt: new Date().toISOString(),
                    };
                })
            );

            if (expandedTicketId === ticket.id) {
                try {
                    const nextHistory = await ticketService.getHistory(ticket.id, Number(patientIdStr));
                    setTicketHistoryByTicketId((prev) => ({ ...prev, [ticket.id]: nextHistory || [] }));
                } catch (historyError) {
                    console.error("Failed to refresh ticket history:", historyError);
                }
            }

            // Auto todo (supports multiple tasks)
            try {
                if (patient) {
                    const configuredTasks = Array.isArray(ticketDef?.autoTodoTasks)
                        ? ticketDef.autoTodoTasks.map((v: any) => String(v || "").trim()).filter(Boolean)
                        : [];
                    const queueCategoryName = String(ticketDef?.queueCategoryName || "").trim();
                    const configuredProcedure = queueCategoryName || String(ticketDef?.autoTodoProcedureName || "").trim();
                    const todoLabelBase = configuredProcedure || ticket.itemName;
                    const isAutoTodoEnabled = ticketDef ? Boolean(ticketDef.autoTodoEnabled) : true;

                    let todoPayloads: Array<{ content: string; procedureName: string }> = [];
                    if (isAutoTodoEnabled) {
                        if (configuredTasks.length > 0) {
                            todoPayloads = configuredTasks.flatMap((taskTemplate: string) => {
                                const hasTreatmentToken = taskTemplate.includes("{treatment}");
                                const treatmentTargets = hasTreatmentToken && (usedTreatments || []).length > 0
                                    ? (usedTreatments || [])
                                    : [""];
                                return treatmentTargets.map((targetTreatment) => {
                                    const content = buildTicketTodoContent(todoLabelBase, taskTemplate, {
                                        round: nextRound,
                                        treatment: targetTreatment || usedTreatments?.[0] || ticket.itemName,
                                    });
                                    const procedureName =
                                        configuredProcedure ||
                                        targetTreatment ||
                                        taskTemplate.replaceAll("{treatment}", "").trim() ||
                                        ticket.itemName;
                                    return { content, procedureName };
                                });
                            }).filter((payload) => Boolean(payload.content));
                        } else if (isPackage && (usedTreatments || []).length > 0) {
                            todoPayloads = (usedTreatments || []).map((treatment) => ({
                                content: buildTicketTodoContent(todoLabelBase, ticketDef?.autoTodoTitleTemplate, {
                                    round: nextRound,
                                    treatment,
                                }),
                                procedureName: configuredProcedure || treatment || ticket.itemName,
                            }));
                        } else {
                            todoPayloads = [{
                                content: buildTicketTodoContent(todoLabelBase, ticketDef?.autoTodoTitleTemplate),
                                procedureName: configuredProcedure || ticket.itemName,
                            }];
                        }
                    }

                    if (todoPayloads.length > 0) {
                        const createdTodos = await Promise.all(
                            todoPayloads.map((payload) =>
                                procedureService.create(patient.id, {
                                    chartId: selectedVisit?.id || 0,
                                    content: payload.content,
                                    sourceType: "auto_ticket_usage",
                                    sourceTicketId: ticket.ticketDefId || ticket.itemId || ticket.id,
                                    procedureName: payload.procedureName,
                                    procedureKey: normalizeTodoProcedureKey(payload.procedureName),
                                })
                            )
                        );
                        setTodos((prev) => [...createdTodos.map((p: any) => ({
                            id: p.id, customerId: p.customerId, visitId: p.chartId,
                            content: p.name, isCompleted: false, status: "todo" as const,
                            createdAt: p.createdAt, creator: p.creator,
                        } as TodoItem)), ...prev]);
                    }
                }
            } catch (todoError) {
                console.error("Failed to create todo for ticket usage", todoError);
            }

            showAlert({ message: "티켓이 사용되었습니다.", type: "success" });

            try {
                if (patientIdStr) await loadPersistenceData(Number(patientIdStr));
            } catch {}
        } catch (e: any) {
            const errMsg = e?.response?.data?.message || e?.message || "Unknown Error";
            const warnPrefix = errMsg.startsWith("CYCLE_WARN|")
                ? "CYCLE_WARN|"
                : (errMsg.startsWith("DAYTIME_WARN|") ? "DAYTIME_WARN|" : null);

            if (warnPrefix) {
                const warnMessage = errMsg.replace(warnPrefix, "");
                const allow = await showConfirm({
                    message: `${warnMessage}\n그래도 사용하시겠습니까?`,
                    type: "warning",
                    confirmText: "사용",
                    cancelText: "취소",
                });
                if (allow) {
                    try {
                        const isPeriodRetry = ticketDef?.usageUnit === "period";
                        const usageCountNow = Number(ticket.usageCount ?? ticket.UsageCount ?? 0);
                        const isPackageRetry = ticketDef?.usageUnit === "package";
                        const nextRoundRetry = isPackageRetry ? Math.max(1, usageCountNow + 1) : undefined;
                        await ticketService.useTicket(ticket.id, isPeriodRetry, {
                            usedRound: nextRoundRetry,
                            allowCycleOverride: warnPrefix === "CYCLE_WARN|" ? true : allowCycleOverride,
                            allowDayTimeOverride: warnPrefix === "DAYTIME_WARN|" ? true : allowDayTimeOverride,
                            visitId: selectedVisit?.id,
                        });
                        setTickets((prev) =>
                            prev.map((t) => {
                                if (t.id !== ticket.id) return t;
                                const newUsageCount = (t.usageCount || 0) + 1;
                                const newRemaining = typeof t.remainingCount === "number" ? Math.max(0, t.remainingCount - 1) : t.remainingCount;
                                return { ...t, usageCount: newUsageCount, remainingCount: newRemaining, lastUsedAt: new Date().toISOString() };
                            })
                        );
                        showAlert({ message: "티켓이 사용되었습니다.", type: "success" });
                        try {
                            if (patientIdStr) await loadPersistenceData(Number(patientIdStr));
                        } catch {}
                    } catch (retryErr: any) {
                        showAlert({ message: "티켓 사용 실패: " + (retryErr?.response?.data?.message || retryErr?.message || "Unknown Error"), type: "error" });
                    }
                }
                return;
            }
            console.error("Failed to use ticket", e);
            showAlert({ message: "티켓 사용 실패: " + errMsg, type: "error" });
        }
    };

    const handleAddTicket = async (ticket: any) => {
        if (!patient) return;
        const ticketNumId = Number(ticket.id);
        const duplicate = cartItems.find((c) => Number(c.itemId) === ticketNumId && c.itemType !== "membership");
        if (duplicate) {
            const ok = await showConfirm({ message: `이미 추가된 티켓입니다: ${ticket.name}\n그래도 추가하시겠습니까?`, type: "warning", confirmText: "추가", cancelText: "취소" });
            if (!ok) return;
        }
        try {
            await cartService.addItem({
                patientId: patient.id,
                visitId: selectedVisitId ?? undefined,
                ticketId: Number(ticket.id),
                quantity: 1,
            });
            await refreshChartData();
            setSearchQuery("");
            setIsSearchOpen(false);
        } catch (e: any) {
            console.error(e);
            const msg = e?.response?.data?.message || e?.message || "Unknown error";
            showAlert({ message: `티켓 추가에 실패했습니다: ${msg}`, type: "error" });
        }
    };

    const handleAddMembership = async (membership: any) => {
        if (!patient) return;
        const membershipNumId = Number(membership.id);
        const duplicate = cartItems.find((c) => c.itemType === "membership" && Number(c.itemId) === membershipNumId);
        if (duplicate) {
            const ok = await showConfirm({ message: `이미 추가된 회원권입니다: ${membership.name}\n그래도 추가하시겠습니까?`, type: "warning", confirmText: "추가", cancelText: "취소" });
            if (!ok) return;
        }
        try {
            await cartService.addItem({
                patientId: patient.id,
                visitId: selectedVisitId ?? undefined,
                membershipTicketId: Number(membership.id),
                quantity: 1,
            });
            await refreshChartData();
            setSearchQuery("");
            setIsSearchOpen(false);
        } catch (e: any) {
            console.error(e);
            const msg = e?.response?.data?.message || e?.message || "Unknown error";
            showAlert({ message: `회원권 추가에 실패했습니다: ${msg}`, type: "error" });
        }
    };

    const handleUpdateQuantity = async (item: CartItem, delta: number) => {
        const newQty = item.quantity + delta;
        if (newQty < 1) return;
        if (!patientIdStr) return;
        const pId = Number(patientIdStr);
        if (!Number.isFinite(pId)) return;
        try {
            await cartService.updateItem(pId, item.id, newQty);
            setCartItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i)));
            setQuantityDraftByItemId((prev) => {
                if (!(item.id in prev)) return prev;
                const next = { ...prev };
                delete next[item.id];
                return next;
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleQuantityInputChange = (itemId: number, nextValue: string) => {
        if (!/^\d*$/.test(nextValue)) return;
        setQuantityDraftByItemId((prev) => ({ ...prev, [itemId]: nextValue }));
    };

    const clearQuantityDraft = (itemId: number) => {
        setQuantityDraftByItemId((prev) => {
            if (!(itemId in prev)) return prev;
            const next = { ...prev };
            delete next[itemId];
            return next;
        });
    };

    const handleCommitQuantityInput = async (item: CartItem) => {
        const rawDraft = quantityDraftByItemId[item.id];
        if (rawDraft == null) return;

        const parsed = Number(rawDraft.trim());
        const nextQty = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;

        if (nextQty === item.quantity) {
            clearQuantityDraft(item.id);
            return;
        }

        if (!patientIdStr) return;
        const pId = Number(patientIdStr);
        if (!Number.isFinite(pId)) return;

        try {
            await cartService.updateItem(pId, item.id, nextQty);
            setCartItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: nextQty } : i)));
            clearQuantityDraft(item.id);
        } catch (e) {
            console.error(e);
            setQuantityDraftByItemId((prev) => ({ ...prev, [item.id]: String(item.quantity) }));
        }
    };

    useEffect(() => {
        setQuantityDraftByItemId((prev) => {
            const validIds = new Set(cartItems.map((item) => item.id));
            let changed = false;
            const next: Record<number, string> = {};
            for (const [key, value] of Object.entries(prev)) {
                const id = Number(key);
                if (validIds.has(id)) {
                    next[id] = value;
                } else {
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [cartItems]);

    const handleRemoveCartItem = async (cartItemId: number) => {
        if (!(await showConfirm({ message: "삭제하시겠습니까?", type: "warning", confirmText: "삭제", cancelText: "닫기" }))) return;
        if (!patientIdStr) return;
        const pId = Number(patientIdStr);
        if (!Number.isFinite(pId)) return;
        try {
            await cartService.removeItem(pId, cartItemId);
            setCartItems((prev) => prev.filter((i) => i.id !== cartItemId));
            clearQuantityDraft(cartItemId);
        } catch (e) {
            console.error(e);
        }
    };

    const handleMembershipAutoCheckout = async () => {
        if (!patientIdStr) return;
        try {
            const pid = Number(patientIdStr);
            await cartService.checkout(pid, {
                visitId: selectedVisit?.id,
                useMembership: true,
                selectedMembershipId,
                selectedMembershipIds: prioritizedMembershipIds,
                usePoints,
                selectedCouponId,
                paymentLines: [{ amount: 0 }],
            });

            await loadPersistenceData(pid);
            showAlert({ message: "회원권으로 자동 결제가 완료되었습니다.", type: "success" });
        } catch (e: any) {
            console.error(e);
            showAlert({ message: "자동 결제 실패: " + (e?.message || "Unknown error"), type: "error" });
        }
    };

    const handleCheckoutClick = () => {
        const cashRequired = cartPreview?.totalCashRequired ?? remaining;
        if (cashRequired <= 0 && prioritizedMembershipIds.length > 0) {
            handleMembershipAutoCheckout();
        } else {
            setShowPaymentModal(true);
        }
    };

    const handleAddPayment = async (paymentData: any) => {
        if (!patientIdStr) return;
        try {
            const pid = Number(patientIdStr);
            const amount = typeof paymentData === 'number' ? paymentData : (paymentData?.amount || 0);
            const method = paymentData?.method || 'card';

            await cartService.checkout(pid, {
                visitId: selectedVisit?.id,
                useMembership: prioritizedMembershipIds.length > 0,
                selectedMembershipId,
                selectedMembershipIds: prioritizedMembershipIds,
                usePoints,
                selectedCouponId,
                method,
                paymentCategory: paymentData?.paymentCategory,
                paymentSubMethod: paymentData?.paymentSubMethod,
                paymentSubMethodLabel: paymentData?.paymentSubMethodLabel,
                paymentLines: paymentData?.paymentLines,
                taxFreeAmount: paymentData?.taxFreeAmount,
                paidAmount: amount,
                memo: paymentData?.memo,
                assignee: paymentData?.assignee,
            });

            await loadPersistenceData(pid);
            showAlert({ message: "수납 및 티켓 발급이 완료되었습니다.", type: "success" });
            setShowPaymentModal(false);
        } catch (e: any) {
            console.error(e);
            showAlert({ message: "수납 처리 실패: " + (e?.message || "Unknown error"), type: "error" });
        }
    };

    const buildRefundModalCheck = useCallback(async (record: PaymentRecord): Promise<RefundModalCheck> => {
        const masterId = record.paymentMasterId ?? record.id;
        const check = await paymentService.getRefundCheck(masterId);
        return {
            recordId: record.id,
            sourceAmount: Math.max(0, Number(check.sourceAmount ?? paymentService.calcActualPaidAmount(record))),
            autoUsedAmount: Math.max(0, Number(check.autoUsedAmount ?? 0)),
            penaltyAmount: Math.max(0, Number(check.penaltyAmount ?? 0)),
            estimatedRefund: Math.max(0, Number(check.estimatedRefund ?? 0)),
            canRefund: Boolean(check.canRefund),
            reason: check.reason,
            items: check.items,
        };
    }, []);

    const closeRefundModal = useCallback(() => {
        setRefundModal((prev) => (prev?.isSubmitting ? prev : null));
    }, []);

    const handleRefundPaymentRecord = async (record: PaymentRecord, itemName?: string, refundRate?: number, paymentDetailId?: number) => {
        if (!patientIdStr) return;
        const normalizedStatus = String(record?.status || "paid").trim().toLowerCase();
        if (normalizedStatus === "refunded" || normalizedStatus === "cancelled") {
            showAlert({ message: "이미 환불/취소 처리된 결제입니다.", type: "warning" });
            return;
        }

        const clientBlockReason = getRefundClientBlockReason(record);
        if (clientBlockReason) {
            showAlert({ message: clientBlockReason, type: "warning" });
            return;
        }

        try {
            const check = await buildRefundModalCheck(record);
            if (!check.canRefund) {
                showAlert({ message: check.reason || "사용 이력이 있어 환불할 수 없는 결제입니다.", type: "warning" });
                return;
            }
            if (check.sourceAmount <= 0) {
                showAlert({ message: "환불 기준 결제금액을 계산할 수 없습니다.", type: "error" });
                return;
            }
            setRefundModal({
                mode: "single",
                records: [record],
                checks: [check],
                responsibilityType: "customer",
                reason: "",
                manualUsedAmount: String(
                    itemName
                        ? (check.items?.find(it => it.itemName === itemName)?.usedAmountAtOriginalPrice ?? check.autoUsedAmount)
                        : check.autoUsedAmount
                ),
                blockedMessages: [],
                isSubmitting: false,
                refundItemName: itemName,
                refundPaymentDetailId: paymentDetailId ?? (record.items || []).find(it => it.itemName === itemName)?.paymentDetailId,
                refundRate: refundRate,
            });
        } catch (e: any) {
            console.error(e);
            showAlert({ message: "환불 정보 조회 실패: " + (e?.response?.data?.message || e?.message || "Unknown error"), type: "error" });
        }
    };

    const handleRefundPaymentGroup = async (records: PaymentRecord[]) => {
        if (!patientIdStr) return;
        const refundableRecords = (records || []).filter((record) => {
            const status = String(record?.status || "paid").trim().toLowerCase();
            return status !== "refunded" && status !== "cancelled";
        });

        if (refundableRecords.length === 0) {
            showAlert({ message: "환불 가능한 결제건이 없습니다.", type: "warning" });
            return;
        }

        try {
            const results = await Promise.all(
                refundableRecords.map(async (record) => {
                    const clientBlockReason = getRefundClientBlockReason(record);
                    if (clientBlockReason) {
                        return {
                            record,
                            check: {
                                recordId: record.id,
                                sourceAmount: Math.max(0, paymentService.calcActualPaidAmount(record)),
                                autoUsedAmount: 0,
                                canRefund: false,
                                reason: clientBlockReason,
                            } as RefundModalCheck,
                        };
                    }

                    try {
                        const check = await buildRefundModalCheck(record);
                        return { record, check };
                    } catch (error: any) {
                        return {
                            record,
                            check: {
                                recordId: record.id,
                                sourceAmount: Math.max(0, paymentService.calcActualPaidAmount(record)),
                                autoUsedAmount: 0,
                                canRefund: false,
                                reason: error?.response?.data?.message || error?.message || "조회 실패",
                            } as RefundModalCheck,
                        };
                    }
                })
            );

            const checks = results
                .filter(({ check }) => check.canRefund && check.sourceAmount > 0)
                .map(({ check }) => check);
            const availableRecords = results
                .filter(({ check }) => check.canRefund && check.sourceAmount > 0)
                .map(({ record }) => record);
            const blockedMessages = results
                .filter(({ check }) => !check.canRefund || check.sourceAmount <= 0)
                .map(({ record, check }) => `#${record.id}: ${check.reason || "환불 불가"}`);

            if (availableRecords.length === 0) {
                showAlert({ message: blockedMessages[0] || "환불 가능한 결제건이 없습니다.", type: "warning" });
                return;
            }

            setRefundModal({
                mode: "group",
                records: availableRecords,
                checks,
                responsibilityType: "customer",
                reason: "",
                manualUsedAmount: "",
                blockedMessages,
                isSubmitting: false,
            });
        } catch (e: any) {
            console.error(e);
            showAlert({ message: "묶음 환불 정보 조회 실패: " + (e?.response?.data?.message || e?.message || "Unknown error"), type: "error" });
        }
    };

    const handleConfirmRefundModal = async () => {
        if (!patientIdStr || !refundModal) return;

        const sourceAmountByRecordId = new Map(refundModal.checks.map((check) => [check.recordId, check]));
        if (refundModal.checks.length === 0) {
            showAlert({ message: "환불할 결제건이 없습니다.", type: "warning" });
            return;
        }

        if (refundModal.mode === "single") {
            if (refundModalPreviewAmount <= 0) {
                showAlert({ message: "계산 결과 환불금이 0원입니다. 환불변수/귀책을 확인해주세요.", type: "warning" });
                return;
            }
        }

        setRefundModal((prev) => (prev ? { ...prev, isSubmitting: true } : prev));

        try {
            if (refundModal.mode === "single") {
                const record = refundModal.records[0];
                if (!record) {
                    showAlert({ message: "환불할 결제건을 찾을 수 없습니다.", type: "warning" });
                    setRefundModal((prev) => (prev ? { ...prev, isSubmitting: false } : prev));
                    return;
                }
                setRefundingPaymentId(record.id);

                const matchedItem = (() => {
                    const check = refundModal.checks[0];
                    if (!check?.items) return null;
                    if (refundModal.refundPaymentDetailId) {
                        return check.items.find(it =>
                            (it.paymentDetailIds ?? [it.paymentDetailId]).includes(refundModal.refundPaymentDetailId!)
                        ) ?? null;
                    }
                    if (refundModal.refundItemName) {
                        return check.items.find(it => it.itemName === refundModal.refundItemName) ?? null;
                    }
                    return null;
                })();
                const ticketRootId = matchedItem?.rootId;

                const masterId = record.paymentMasterId ?? record.id;
                const refundAmount = refundModalPreviewAmount;

                const isMembershipItem = matchedItem?.itemType === "membership";

                if (ticketRootId && refundAmount > 0 && isMembershipItem) {
                    const result = await paymentService.processMembershipRefund({
                        paymentMasterId: masterId,
                        membershipRootId: ticketRootId,
                        refundAmount,
                        responsibilityType: refundModal.responsibilityType,
                        reason: refundModal.reason.trim() || undefined,
                    });
                    await loadPersistenceData(Number(patientIdStr));
                    setRefundModal(null);
                    showAlert({
                        message: [
                            "회원권 환불 처리되었습니다.",
                            `환불 지급액: ${result.totalRefunded.toLocaleString()}원`,
                            `환불 수단: ${result.details.map(d => `${d.paymentType} ${d.refundAmount.toLocaleString()}원`).join(", ")}`,
                        ].join("\n"),
                        type: "info",
                    });
                } else if (ticketRootId && refundAmount > 0) {
                    const result = await paymentService.processTicketRefund({
                        paymentMasterId: masterId,
                        ticketRootId,
                        refundAmount,
                        responsibilityType: refundModal.responsibilityType,
                        reason: refundModal.reason.trim() || undefined,
                    });
                    await loadPersistenceData(Number(patientIdStr));
                    setRefundModal(null);
                    showAlert({
                        message: [
                            "환불 처리되었습니다.",
                            `환불 지급액: ${result.totalRefunded.toLocaleString()}원`,
                            `환불 수단: ${result.details.map(d => `${d.paymentType} ${d.refundAmount.toLocaleString()}원`).join(", ")}`,
                        ].join("\n"),
                        type: "info",
                    });
                } else {
                    const result = await paymentService.refundPaymentRecord(record.id, {
                        reason: refundModal.reason.trim() || undefined,
                        responsibilityType: refundModal.responsibilityType,
                        manualUsedAmount,
                    });
                    await loadPersistenceData(Number(patientIdStr));
                    setRefundModal(null);
                    showAlert({
                        message: [
                            "환불 처리되었습니다.",
                            `결제금액: ${result.sourceAmount.toLocaleString()}원`,
                            `사용 차감액: ${result.usedAmount.toLocaleString()}원`,
                            `위약금: ${result.penaltyAmount.toLocaleString()}원`,
                            `환불 지급액: ${result.finalRefundAmount.toLocaleString()}원`,
                        ].join("\n"),
                        type: "info",
                    });
                }
                return;
            }

            let successCount = 0;
            const failedMessages: string[] = [];

            for (const record of refundModal.records) {
                try {
                    setRefundingPaymentId(record.id);
                    const check = sourceAmountByRecordId.get(record.id);
                    if (!check?.canRefund) {
                        failedMessages.push(`#${record.id}: ${check?.reason || "환불 불가"}`);
                        continue;
                    }

                    await paymentService.refundPaymentRecord(record.id, {
                        reason: refundModal.reason.trim() || undefined,
                        responsibilityType: refundModal.responsibilityType,
                    });
                    successCount += 1;
                } catch (e: any) {
                    const message = e?.response?.data?.message || e?.message || "Unknown error";
                    failedMessages.push(`#${record.id}: ${message}`);
                } finally {
                    setRefundingPaymentId((prev) => (prev === record.id ? null : prev));
                }
            }

            await loadPersistenceData(Number(patientIdStr));
            setRefundModal(null);

            const summaryLines = [
                `묶음 환불 결과: 성공 ${successCount}건 / 실패 ${failedMessages.length}건`,
            ];
            if (failedMessages.length > 0) {
                summaryLines.push("", ...failedMessages.slice(0, 6));
                if (failedMessages.length > 6) {
                    summaryLines.push(`...외 ${failedMessages.length - 6}건`);
                }
            }
            showAlert({ message: summaryLines.join("\n"), type: "info" });
        } catch (e: any) {
            console.error(e);
            showAlert({ message: "환불 처리 실패: " + (e?.response?.data?.message || e?.message || "Unknown error"), type: "error" });
            setRefundModal((prev) => (prev ? { ...prev, isSubmitting: false } : prev));
        } finally {
            if (refundModal.mode === "single") {
                const record = refundModal.records[0];
                if (record) {
                    setRefundingPaymentId((prev) => (prev === record.id ? null : prev));
                }
            }
        }
    };

    const handleAddTodo = async () => {
        if (!todoInput.trim() || !patient) return;
        if (!selectedVisit?.id) {
            showAlert({ message: "할일을 등록할 차트를 먼저 선택해 주세요.", type: "warning" });
            return;
        }
        try {
            const proc = await procedureService.create(patient.id, {
                chartId: selectedVisit.id,
                content: todoInput,
                procedureName: todoInput,
            });
            setTodos((prev) => [{
                id: proc.id,
                customerId: proc.customerId,
                visitId: proc.chartId,
                content: proc.name,
                isCompleted: false,
                status: "todo",
                createdAt: proc.createdAt,
                creator: proc.creator,
            } as any, ...prev]);
            setTodoInput("");
        } catch (e: any) {
            console.error("[Procedure] Failed to create:", e);
            showAlert({ message: "할일 등록 실패: " + (e?.response?.data?.message || e?.message), type: "error" });
        }
    };

    const handleAssignTodoUser = async (todoId: number, userId: number | null, userName: string | null) => {
        try {
            await procedureService.assignUser(patient?.id || 0, todoId, userId, userName);
            setTodos((prev) => prev.map((t) =>
                t.id === todoId ? { ...t, assigneeUserId: userId ?? undefined, assignee: userName ?? undefined } : t
            ));
            setAssigningTodoId(null);
        } catch (e) {
            console.error(e);
        }
    };

    const handleRemoveTodo = async (todoId: number) => {
        try {
            await procedureService.delete(patient?.id || 0, todoId);
            setTodos((prev) => prev.filter((t) => t.id !== todoId));
        } catch (e) {
            console.error(e);
        }
    };

    const handleToggleTodo = async (todo: TodoItem) => {
        try {
            const currentStatus = (todo as any).status || (todo.isCompleted ? "done" : "todo");
            const nextStatus = currentStatus === "todo" ? "doing" : currentStatus === "doing" ? "done" : "todo";
            const now = new Date().toISOString();
            setTodos((prev) => prev.map((t) => (t.id === todo.id ? {
                ...t,
                isCompleted: nextStatus === "done",
                status: nextStatus,
                startedAt: nextStatus === "doing" ? now : nextStatus === "done" ? (t as any).startedAt : undefined,
                completedAt: nextStatus === "done" ? now : undefined,
            } : t)));
            await procedureService.updateStatus(patient?.id || 0, todo.id);
        } catch (e) {
            console.error(e);
            if (patient) loadPersistenceData(patient.id);
        }
    };

    const handleRemoveRecord = async (recordId: number) => {
        if (!(await showConfirm({ message: "정말 이 기록을 삭제하시겠습니까?", type: "warning", confirmText: "삭제", cancelText: "닫기" }))) return;
        try {
            await patientRecordService.delete(recordId, patient?.id);
            if (patient) await refreshChartData();
        } catch (e) {
            console.error("Failed to delete record", e);
            showAlert({ message: "기록 삭제에 실패했습니다.", type: "error" });
        }
    };

    const handleAddRecord = async () => {
        if (!recordInput.trim() || !patient) return;
        try {
            const tagName = "메모";
            const newRecord = await patientRecordService.create({
                patientId: patient.id,
                recordType: "memo",
                tag: tagName,
                content: recordInput,
                isPinned: false,
            } as any);

            setPatientRecords((prev) => [newRecord, ...prev]);
            setRecordInput("");
        } catch (e) {
            console.error(e);
            showAlert({ message: "기록 저장 실패", type: "error" });
        }
    };

    const handleToggleRecordPinned = async (record: PatientRecordData) => {
        const nextPinned = !Boolean(record?.isPinned);
        setPatientRecords((prev) =>
            prev.map((item) => (item.id === record.id ? { ...item, isPinned: nextPinned } : item))
        );
        try {
            await patientRecordService.setPinned(record.id, nextPinned, Number(patientIdStr));
        } catch (error) {
            console.error("Failed to update record pin", error);
            setPatientRecords((prev) =>
                prev.map((item) => (item.id === record.id ? { ...item, isPinned: Boolean(record?.isPinned) } : item))
            );
            showAlert({ message: "기록 고정 상태 변경에 실패했습니다.", type: "error" });
        }
    };

    const sectionToChartField = useMemo(() => {
        const map: Record<string, string> = {};
        memoSections.forEach((section, idx) => {
            map[section.id] = `chart${idx + 1}`;
        });
        return map;
    }, [memoSections]);

    const handleSaveConsultation = async (field: string, value: string) => {
        if (!selectedVisitId) return;
        try {
            const chartField = sectionToChartField[field];
            const consultationKey = chartField || field;
            const v = chartVisitsData.find((vv: any) => vv.id === selectedVisitId) || visits.find((vv) => vv.id === selectedVisitId);
            if (!v) return;
            const newConsultation = { ...((v as any).consultation || {}), [consultationKey]: value };
            setChartVisitsData((prev: any[]) => prev.map((vv: any) => (vv.id === selectedVisitId ? { ...vv, [consultationKey]: value, consultation: newConsultation } : vv)));
            setVisits((prev) => prev.map((vv) => (vv.id === selectedVisitId ? { ...vv, [consultationKey]: value, consultation: newConsultation } : vv)));
            delete dirtyFieldsRef.current[`chart_${field}`];
            if (field === "counselorId" || field === "doctorId" || field === "doctorCounselorId") {
                await visitService.updateVisit(selectedVisitId, { [field]: value ? Number(value) : 0 } as any);
            } else if (chartField) {
                await visitService.updateVisit(selectedVisitId, { [chartField]: value } as any);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveMedicalRecord = async (value: string) => {
        if (!selectedVisitId) return;
        try {
            setVisits((prev) => prev.map((v) => (v.id === selectedVisitId ? { ...v, medicalRecord: value } : v)));
            delete dirtyFieldsRef.current['medicalRecord'];
            await visitService.updateVisit(selectedVisitId, { medicalRecord: value } as any);
        } catch (e) {
            console.error(e);
        }
    };

    const flushDirtyFields = useCallback(() => {
        const entries = Object.entries(dirtyFieldsRef.current);
        if (entries.length === 0) return;
        dirtyFieldsRef.current = {};
        for (const [key, { visitId, value }] of entries) {
            if (key === 'medicalRecord') {
                visitService.updateVisit(visitId, { medicalRecord: value } as any).catch(() => {});
            } else if (key.startsWith('chart_')) {
                const field = key.replace('chart_', '');
                const chartField = sectionToChartField[field] || field;
                visitService.updateVisit(visitId, { [chartField]: value } as any).catch(() => {});
            }
        }
    }, [sectionToChartField]);

    const flushDirtyFieldsRef = useRef(flushDirtyFields);
    useEffect(() => {
        flushDirtyFieldsRef.current = flushDirtyFields;
    }, [flushDirtyFields]);

    const handlePrintChartRecord = async () => {
        if (!selectedVisit || !patient) return;

        const dirty = dirtyFieldsRef.current;

        if (!isReadOnly) {
            const savePromises: Promise<any>[] = [];
            for (const [key, { visitId, value }] of Object.entries(dirty)) {
                if (key === 'medicalRecord') {
                    savePromises.push(visitService.updateVisit(visitId, { medicalRecord: value } as any));
                } else if (key.startsWith('chart_')) {
                    const field = key.replace('chart_', '');
                    const chartField = sectionToChartField[field] || field;
                    savePromises.push(visitService.updateVisit(visitId, { [chartField]: value } as any));
                }
            }
            if (savePromises.length > 0) {
                await Promise.all(savePromises);
                dirtyFieldsRef.current = {};
            }
        }

        const pc = settings.chartConfig?.printConfig || [];
        const isPrintEnabled = (key: string) => {
            const found = pc.find((item: any) => item.key === key);
            return found ? found.enabled : true;
        };

        const sections: PrintSection[] = [];

        memoSections.forEach((section) => {
            if (!isPrintEnabled(section.id)) return;
            const field = sectionToChartField[section.id] || section.id;
            const dirtyKey = `chart_${section.id}`;
            const value = dirty[dirtyKey]?.value
                ?? (selectedVisit.consultation as any)?.[field]
                ?? (selectedVisit as any)?.[field]
                ?? "";
            if (value.trim()) {
                sections.push({ label: section.label, content: value });
            }
        });

        if (isPrintEnabled("todo") && visibleTodos.length > 0) {
            const todoLines = visibleTodos.map((t) => `${t.isCompleted ? "✓" : "○"} ${t.content}`).join("\n");
            sections.push({ label: "할일", content: todoLines });
        }

        if (sections.length === 0) {
            showAlert({ message: "인쇄할 내용이 없습니다.", type: "warning" });
            return;
        }

        const visitDate = parseScheduledAtLocal(selectedVisit.scheduledAt);
        const formattedDate = format(visitDate, "yyyy-MM-dd HH:mm:ss");
        const doctorLabel = (() => {
            const docId = String((selectedVisit as any)?.doctorId || (selectedVisit?.consultation as any)?.doctorId || "");
            if (!docId) return "미지정";
            return doctorMembers.find((m) => m.id === docId)?.name || selectedDoctorCounselorLabel;
        })();

        const rawBirth = (patient as any).birthDate
            || (selectedVisit as any)?.customerBirthDate
            || "";
        const birthDisplay = rawBirth ? String(rawBirth).substring(0, 10) : "";
        const patientAge = rawBirth ? differenceInYears(new Date(), new Date(rawBirth)) : "";
        const birthWithAge = birthDisplay && patientAge !== ""
            ? `${birthDisplay} (${patientAge}세)`
            : birthDisplay || undefined;
        const staffParts: string[] = [];
        if (isPrintEnabled("counselor")) staffParts.push(`상담:${selectedCounselorLabel}`);
        if (isPrintEnabled("doctorCounselor")) staffParts.push(`원장상담:${selectedDoctorCounselorLabel}`);
        const header = staffParts.length > 0 ? staffParts.join("  ") : undefined;

        await printService.printChart({
            header,
            patientName: patient.name,
            chartNo: (patient as any).chartNo || String(patient.id),
            birthDate: birthWithAge,
            gender: patient.gender,
            visitDate: formattedDate,
            doctor: isPrintEnabled("doctor") ? doctorLabel : undefined,
            sections,
        });
    };

    const handleUpdateVisitRoom = async (roomId: string) => {
        if (!selectedVisitId) return;
        try {
            setVisits((prev) => prev.map((v) => (v.id === selectedVisitId ? { ...v, room: roomId } : v)));
            await visitService.updateVisit(selectedVisitId, { room: roomId } as any);
            setIsLocationDropdownOpen(false);
        } catch (e) {
            console.error(e);
            showAlert({ message: "대기실 변경 실패", type: "error" });
        }
    };

    const handleManualSave = async () => {
        if (!selectedVisit) return;
        try {
            const dirtyKeys = Object.keys(dirtyFieldsRef.current);
            if (dirtyKeys.length > 0) {
                for (const key of dirtyKeys) {
                    const value = dirtyFieldsRef.current[key];
                    if (key === "medicalRecord") {
                        await handleSaveMedicalRecord(value);
                    } else if (key.startsWith("chart_")) {
                        await handleSaveConsultation(key.replace("chart_", ""), value);
                    }
                }
            }
            showAlert({ message: "저장되었습니다.", type: "success" });
        } catch (e) {
            console.error(e);
            showAlert({ message: "저장 실패", type: "error" });
        }
    };



    // --- Early returns ---
    if (loading && !patient) return <div className="flex items-center justify-center h-screen">로딩중..</div>;

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <div className="text-red-500 font-bold text-lg">오류 발생</div>
                <div className="text-gray-600">{error}</div>
                <div className="text-xs text-gray-400 bg-gray-100 p-2 rounded max-w-md break-all">{debugLog}</div>
                <button
                    onClick={refreshChartData}
                    className="px-4 py-2 bg-[#D27A8C] text-white rounded-lg hover:bg-[#8B3F50] shadow-sm"
                >
                    다시 시도
                </button>
                <button onClick={() => navigate("/app/chart")} className="text-sm underline text-gray-400">
                    목록으로
                </button>
            </div>
        );
    }

    if (!patient) return null;

    const age = patient.birthDate ? differenceInYears(new Date(), new Date(patient.birthDate)) : 0;
    const refundModalMatchedItem = (() => {
        if (!refundModal || refundModal.mode !== "single" || !refundModal.refundItemName) return null;
        const check = refundModal.checks[0];
        if (!check?.items) return null;
        if (refundModal.refundPaymentDetailId) {
            return check.items.find(it =>
                (it.paymentDetailIds ?? [it.paymentDetailId]).includes(refundModal.refundPaymentDetailId!)
            ) ?? null;
        }
        return check.items.find(it => it.itemName === refundModal.refundItemName) ?? null;
    })();

    const refundModalSourceAmount = refundModalMatchedItem
        ? refundModalMatchedItem.paidAmount
        : (refundModal?.checks.reduce((sum, check) => sum + Math.max(0, check.sourceAmount), 0) ?? 0);
    const refundModalRate = refundModal?.refundRate ?? 0;
    const refundModalUsedCount = refundModalMatchedItem?.usedCount ?? 0;
    const refundModalUsedAmount = Math.round(refundModalSourceAmount * refundModalRate * refundModalUsedCount);
    const refundModalPenaltyAmount = (() => {
        if (!refundModal || refundModal.responsibilityType !== "customer") return 0;
        if (refundModalMatchedItem) return refundModalMatchedItem.penaltyAmount;
        return refundModal.checks.reduce((sum, check) => sum + Math.max(0, check.penaltyAmount ?? 0), 0);
    })();
    const refundModalPreviewAmount = Math.max(0, refundModalSourceAmount - refundModalUsedAmount - refundModalPenaltyAmount);

    return (
        <div className="flex flex-col h-screen bg-[#FAF3F5] overflow-hidden text-sm" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
            {/* 1. Header */}
            <div
                className="min-h-16 flex items-center justify-between flex-wrap gap-y-2 px-4 sm:px-6 py-2 shrink-0 z-20"
                style={{
                    background: "linear-gradient(135deg, #FFFFFF 0%, #FCF7F8 50%, #FCEBEF 100%)",
                    borderBottom: "1px solid #F8DCE2",
                    boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 18px rgba(226, 107, 124, 0.08)",
                }}
            >
                <div className="flex items-center gap-3 sm:gap-4 flex-wrap gap-y-1.5">
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{
                            background: "linear-gradient(135deg, #FCEBEF 0%, #F8DCE2 100%)",
                            border: "1px solid #F5C7D1",
                            boxShadow: "0 2px 6px rgba(226, 107, 124, 0.12), inset 0 1px 0 rgba(255,255,255,0.7)",
                        }}
                    >
                        <User className="w-[18px] h-[18px]" style={{ color: "#8B3F50" }} />
                    </div>

                    <div className="flex items-baseline gap-3">
                        <span
                            className="text-[11px] font-mono font-semibold tracking-wider px-2 py-0.5 rounded-md"
                            style={{
                                color: "#8B3F50",
                                background: "rgba(244, 158, 175, 0.14)",
                                border: "1px solid rgba(244, 158, 175, 0.28)",
                            }}
                        >
                            #{patient.id}
                        </span>
                        <span
                            className="text-[19px] font-bold tracking-[-0.3px] leading-none"
                            style={{ color: "#2A1F22" }}
                        >
                            {patient.name}
                        </span>
                        <span className="text-[13px] font-medium" style={{ color: "#7C6066" }}>
                            {patient.sex === "M" ? "남" : "여"} · {age}세 · {(patient.birthDate || "").replace(/-/g, ".")}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 ml-3">
                        {remaining > 0 ? (
                            <span
                                className="px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.2px] inline-flex items-center gap-1.5"
                                style={{
                                    background: "linear-gradient(135deg, #FFF1F0 0%, #FFE4E1 100%)",
                                    color: "#C53030",
                                    border: "1px solid #FCC8C2",
                                    boxShadow: "0 1px 2px rgba(197, 48, 48, 0.08)",
                                }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#C53030]" />
                                미수납
                            </span>
                        ) : (
                            <span
                                className="px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.2px] inline-flex items-center gap-1.5"
                                style={{
                                    background: "linear-gradient(135deg, #F0FAF4 0%, #DDF4E4 100%)",
                                    color: "#1F7A3D",
                                    border: "1px solid #B6E0C0",
                                    boxShadow: "0 1px 2px rgba(31, 122, 61, 0.08)",
                                }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A3D]" />
                                수납완료
                            </span>
                        )}
                        <span
                            className="px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.2px] inline-flex items-center gap-1.5"
                            style={{
                                background: "linear-gradient(135deg, #FFFFFF 0%, #FCF7F8 100%)",
                                color: "#5C2A35",
                                border: "1px solid #F5C7D1",
                                boxShadow: "0 1px 3px rgba(226, 107, 124, 0.10)",
                            }}
                        >
                            <CreditCard className="w-3 h-3" style={{ color: "#D27A8C" }} />
                            누적 {Math.floor(totalPayment / 10000).toLocaleString()}만원
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">{/* 우측 상단 뱃지/버튼 영역 */}</div>
            </div>

            {/* Main Grid */}
            <div ref={gridRef} className="flex flex-1 overflow-hidden">
                {/* [Column 1] Left: Visits */}
                <div
                    className={`bg-white border-r border-[#F8DCE2] flex flex-col shrink-0 ${isMobile && activeMobileColumn !== "visits" ? "hidden" : ""}`}
                    style={{ width: isMobile ? "100%" : (colWidths[0] ?? 280) }}
                >
                    <div
                        className="flex items-center justify-between px-4 h-12 border-b border-[#F8DCE2]"
                        style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FCF7F8 100%)" }}
                    >
                        <div className="flex items-center gap-2">
                            <span className="w-1 h-4 rounded-full" style={{ background: "linear-gradient(180deg, #D27A8C 0%, #F49EAF 100%)" }} />
                            <span className="font-bold text-[13px] tracking-[-0.2px]" style={{ color: "#5C2A35" }}>내원이력</span>
                            <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                                style={{
                                    color: "#8B3F50",
                                    background: "rgba(244, 158, 175, 0.14)",
                                    border: "1px solid rgba(244, 158, 175, 0.28)",
                                }}
                            >
                                {chartVisits.length}
                            </span>
                        </div>
                        <div className="flex gap-1.5"></div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {chartVisits.map((v) => {
                            const date = parseScheduledAtLocal(v.scheduledAt);
                            const isExpanded = visitViewMode === "detail" || expandedVisitIds.includes(v.id);
                            const medicalRecordPreview = String((v as any).medicalRecord || "").trim();
                            const visitTodos = getTodosForVisit(v);

                            return (
                                <div
                                    key={v.id}
                                    onClick={() => setSelectedVisitId(v.id)}
                                    className={`cursor-pointer transition-all duration-200 ease-in-out relative group flex flex-col mx-2 my-1 rounded-xl ${
                                        selectedVisitId === v.id
                                            ? "border border-[#F5C7D1] shadow-[0_6px_18px_rgba(226,107,124,0.12)]"
                                            : "hover:bg-[#FCF7F8] hover:shadow-[0_4px_12px_rgba(226,107,124,0.06)] border border-transparent"
                                    }`}
                                    style={selectedVisitId === v.id ? { background: "linear-gradient(135deg, #FFFFFF 0%, #FCEBEF 100%)" } : undefined}
                                >
                                    {selectedVisitId === v.id && (
                                        <div
                                            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                                            style={{ background: "linear-gradient(180deg, #D27A8C 0%, #F49EAF 100%)" }}
                                        />
                                    )}

                                    <div
                                        className="p-3 flex items-center gap-2"
                                        onClick={(e) => {
                                            toggleVisitExpand(v.id);
                                            e.stopPropagation();
                                            setSelectedVisitId(v.id);
                                        }}
                                    >
                                        <ChevronRight
                                            className={`w-3 h-3 text-[#616161] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                        />
                                        <div className="font-semibold text-[#5C2A35] text-sm flex items-center gap-2">
                                            {format(date, "yyyy-MM-dd", { locale: ko })}
                                            <span className="text-xs font-normal text-[#616161]">
                                                {formatDistanceToNow(date, { addSuffix: true, locale: ko })}
                                            </span>
                                        </div>


                                        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        </div>
                                    </div>

                                    {!isExpanded && (
                                        <div className="px-3 pb-2.5 pl-8 text-xs text-[#616161] flex justify-between">
                                            <div className="flex items-center gap-1 min-w-0">
                                                <Stethoscope className="w-3 h-3 shrink-0" />
                                                <span className="truncate max-w-[170px]">
                                                    {medicalRecordPreview || "진료기록 없음"}
                                                </span>
                                            </div>
                                            {v.memo && <span className="truncate max-w-[120px]">{v.memo}</span>}
                                        </div>
                                    )}

                                    {isExpanded && (
                                        <div className="px-3 pb-3 pl-8 space-y-3">
                                            {historyMemoSections.map((section, sectionIndex) => {
                                                const chartKey = sectionToChartField[section.id] || section.id;
                                                const rawValue = (v as any)?.consultation?.[chartKey] || (v as any)?.[chartKey];
                                                const fallbackValue = sectionIndex === 0 ? v.memo : "";
                                                const sectionText = String(rawValue ?? fallbackValue ?? "").trim();
                                                if (!sectionText) return null;
                                                return (
                                                    <div key={`${v.id}-${section.id}`} className="rounded-lg border border-teal-200 bg-teal-50/50">
                                                        <div className="px-2 py-1.5 text-xs font-semibold text-teal-800 border-b border-teal-200 flex items-center gap-1">
                                                            <Edit3 className="w-3 h-3" />
                                                            {section.label}
                                                        </div>
                                                        <div className="px-2 py-2 text-xs whitespace-pre-wrap text-teal-900">{sectionText}</div>
                                                    </div>
                                                );
                                            })}

                                            <div className="rounded-lg border border-[#D27A8C]/20 bg-[#D27A8C]/5">
                                                <div className="px-2 py-1.5 text-xs font-semibold text-[#D27A8C] border-b border-[#D27A8C]/20 flex items-center gap-1">
                                                    <FileText className="w-3 h-3" />
                                                    진료기록
                                                </div>
                                                <div className="px-2 py-2 text-xs whitespace-pre-wrap text-[#242424]">
                                                    {(v as any).medicalRecord
                                                        ? String((v as any).medicalRecord)
                                                        : "진료기록 없음"}
                                                </div>
                                            </div>

                                            {tickets.some((t) => isSameDate(t.createdAt, v.scheduledAt)) && (
                                                <div className="space-y-1">
                                                    {tickets
                                                        .filter((t) => isSameDate(t.createdAt, v.scheduledAt))
                                                        .map((t) => (
                                                            <div key={t.id} className="flex justify-between text-xs items-center">
                                                                <div className="flex items-center gap-1 text-gray-600">
                                                                    <Gift className="w-3 h-3 text-gray-400" /> {t.itemName}
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}

                                            {visitTodos.length > 0 && (
                                                <div className="space-y-1">
                                                    {visitTodos.map((t) => (
                                                            <div key={t.id} className="flex items-center gap-1 text-xs text-gray-500">
                                                                <CheckCircle className="w-3 h-3" />
                                                                <span className={t.isCompleted ? "line-through" : ""}>{t.content}</span>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div
                        className="p-2.5 border-t border-[#F8DCE2]"
                        style={{ background: "linear-gradient(180deg, #FCF7F8 0%, #FFFFFF 100%)" }}
                    >
                        <button
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-white text-[12px] font-bold tracking-[0.2px] rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                background: isReadOnly
                                    ? "linear-gradient(135deg, #E5B5C0 0%, #D4A5B0 100%)"
                                    : "linear-gradient(135deg, #D27A8C 0%, #C9485B 100%)",
                                boxShadow: isReadOnly
                                    ? "none"
                                    : "0 4px 14px rgba(226, 107, 124, 0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
                            }}
                            onMouseEnter={(e) => {
                                if (!isReadOnly) {
                                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(226, 107, 124, 0.38), inset 0 1px 0 rgba(255,255,255,0.22)";
                                    e.currentTarget.style.transform = "translateY(-1px)";
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isReadOnly) {
                                    e.currentTarget.style.boxShadow = "0 4px 14px rgba(226, 107, 124, 0.28), inset 0 1px 0 rgba(255,255,255,0.18)";
                                    e.currentTarget.style.transform = "translateY(0)";
                                }
                            }}
                            onClick={() => !isReadOnly && setShowReceptionModal(true)}
                            disabled={isReadOnly}
                        >
                            <Plus className="w-3.5 h-3.5" /> 새차트
                        </button>
                    </div>
                </div>

                {/* Separator 0-1 */}
                {!isMobile && (
                    <div
                        className="w-1 shrink-0 cursor-col-resize hover:bg-[#D27A8C]/30 active:bg-[#D27A8C]/50 transition-colors"
                        onMouseDown={(e) => onSepMouseDown(0, e)}
                    />
                )}

                {/* [Column 2] Center Left: Charting */}
                <div
                    className={`flex flex-col border-r border-[#F8DCE2] bg-white overflow-visible ${isMobile && activeMobileColumn !== "chart" ? "hidden" : ""}`}
                    style={{ width: isMobile ? "100%" : (colWidths[1] ?? '40%') }}
                >
                    {selectedVisit ? (
                        <>
                            {/* Visit Header */}
                            <div
                                className="min-h-12 border-b border-[#F8DCE2] flex items-center justify-between flex-wrap gap-y-1.5 px-4 py-1.5 overflow-visible"
                                style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FCF7F8 100%)" }}
                            >
                                <div className="flex items-center gap-2 text-sm font-semibold min-w-0 flex-wrap gap-y-1.5">
                                    <span className="w-1 h-4 rounded-full shrink-0" style={{ background: "linear-gradient(180deg, #D27A8C 0%, #F49EAF 100%)" }} />
                                    <span className="text-[15px] whitespace-nowrap font-bold tracking-[-0.2px]" style={{ color: "#2A1F22" }}>
                                        {(() => {
                                            const d2 = parseScheduledAtLocal(selectedVisit.scheduledAt);
                                            return format(d2, "yyyy.MM.dd (E)", { locale: ko });
                                        })()}
                                    </span>
                                    <span className="text-[#616161] text-sm font-normal">
                                        {(() => {
                                            const d2 = parseScheduledAtLocal(selectedVisit.scheduledAt);
                                            return format(d2, "HH:mm");
                                        })()}
                                    </span>

                                    {/* Counselor/Doctor Dropdowns */}
                                    <div className="flex items-center gap-2 ml-2 flex-wrap gap-y-1.5">
                                        <div className="relative" ref={counselorDropdownRef}>
                                            <button
                                                type="button"
                                                disabled={isReadOnly}
                                                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#F8DCE2] bg-white px-2.5 text-xs font-semibold text-[#242424] shadow-sm transition whitespace-nowrap ${isReadOnly ? "opacity-50 cursor-not-allowed" : "hover:border-[#D27A8C]/30 hover:bg-[#D27A8C]/5"}`}
                                                onClick={() => {
                                                    if (isReadOnly) return;
                                                    setIsDoctorDropdownOpen(false);
                                                    setIsCounselorDropdownOpen((prev) => !prev);
                                                }}
                                            >
                                                <span className="text-[11px] text-gray-500 font-normal">상담</span>
                                                <span className="max-w-[64px] truncate">{selectedCounselorLabel}</span>
                                                <ChevronDown
                                                    className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                                                        isCounselorDropdownOpen ? "rotate-180" : ""
                                                    }`}
                                                />
                                            </button>
                                            {isCounselorDropdownOpen && (
                                                <div className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[170px] rounded-xl border border-[#F8DCE2] bg-white p-1 shadow-lg">
                                                    <button
                                                        type="button"
                                                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                                                            !selectedCounselorId
                                                                ? "bg-[#D27A8C]/10 text-[#D27A8C]"
                                                                : "text-[#616161] hover:bg-[#FCF7F8]"
                                                        }`}
                                                        onClick={() => {
                                                            void handleSaveConsultation("counselorId", "");
                                                            setIsCounselorDropdownOpen(false);
                                                        }}
                                                    >
                                                        <span>미지정</span>
                                                        {!selectedCounselorId && <Check className="h-3.5 w-3.5" />}
                                                    </button>
                                                    {counselorMembers.map((member) => {
                                                        const isSelected = selectedCounselorId === member.id;
                                                        return (
                                                            <button
                                                                key={`counselor-${member.id}`}
                                                                type="button"
                                                                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                                                                    isSelected
                                                                        ? "bg-[#D27A8C]/10 text-[#D27A8C]"
                                                                        : "text-[#616161] hover:bg-[#FCF7F8]"
                                                                }`}
                                                                onClick={() => {
                                                                    void handleSaveConsultation("counselorId", member.id);
                                                                    setIsCounselorDropdownOpen(false);
                                                                }}
                                                            >
                                                                <span className="truncate pr-2">{member.name}</span>
                                                                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <div className="relative" ref={doctorDropdownRef}>
                                            <button
                                                type="button"
                                                disabled={isReadOnly}
                                                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#F8DCE2] bg-white px-2.5 text-xs font-semibold text-[#242424] shadow-sm transition whitespace-nowrap ${isReadOnly ? "opacity-50 cursor-not-allowed" : "hover:border-[#D27A8C]/30 hover:bg-[#D27A8C]/5"}`}
                                                onClick={() => {
                                                    if (isReadOnly) return;
                                                    setIsCounselorDropdownOpen(false);
                                                    setIsDoctorDropdownOpen((prev) => !prev);
                                                }}
                                            >
                                                <span className="text-[11px] text-gray-500 font-normal">원장</span>
                                                <span className="max-w-[64px] truncate">{selectedDoctorCounselorLabel}</span>
                                                <ChevronDown
                                                    className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                                                        isDoctorDropdownOpen ? "rotate-180" : ""
                                                    }`}
                                                />
                                            </button>
                                            {isDoctorDropdownOpen && (
                                                <div className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[170px] rounded-xl border border-[#F8DCE2] bg-white p-1 shadow-lg">
                                                    <button
                                                        type="button"
                                                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                                                            !selectedDoctorCounselorId
                                                                ? "bg-[#D27A8C]/10 text-[#D27A8C]"
                                                                : "text-[#616161] hover:bg-[#FCF7F8]"
                                                        }`}
                                                        onClick={() => {
                                                            void handleSaveConsultation("doctorCounselorId", "");
                                                            setIsDoctorDropdownOpen(false);
                                                        }}
                                                    >
                                                        <span>미지정</span>
                                                        {!selectedDoctorCounselorId && <Check className="h-3.5 w-3.5" />}
                                                    </button>
                                                    {doctorMembers.map((member) => {
                                                        const isSelected = selectedDoctorCounselorId === member.id;
                                                        return (
                                                            <button
                                                                key={`doctor-${member.id}`}
                                                                type="button"
                                                                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                                                                    isSelected
                                                                        ? "bg-[#D27A8C]/10 text-[#D27A8C]"
                                                                        : "text-[#616161] hover:bg-[#FCF7F8]"
                                                                }`}
                                                                onClick={() => {
                                                                    void handleSaveConsultation("doctorCounselorId", member.id);
                                                                    setIsDoctorDropdownOpen(false);
                                                                }}
                                                            >
                                                                <span className="truncate pr-2">{member.name}</span>
                                                                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={handlePrintChartRecord}
                                        className="px-2 py-1 border rounded text-xs flex items-center gap-1 hover:bg-gray-50 whitespace-nowrap"
                                        title="차트 인쇄"
                                    >
                                        <Printer className="w-3 h-3" /> 인쇄
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4">
                                {/* Print Preview Card */}
                                <div className="mb-4 border border-[#F8DCE2] rounded-2xl bg-[#FCF7F8] overflow-hidden">
                                    <div
                                        className="px-4 py-2 border-b border-[#F8DCE2] bg-[#FCF7F8] flex items-center justify-between cursor-pointer select-none hover:bg-[#FCEBEF]/60 transition-colors"
                                        onClick={() => setIsPrintPreviewCollapsed(prev => !prev)}
                                    >
                                        <span className="text-xs font-semibold text-[#5C2A35] flex items-center gap-1">
                                            {isPrintPreviewCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            인쇄 미리보기
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const existing = settings.chartConfig?.printConfig || [];
                                                const defaultKeys = [
                                                    { key: "counselor", label: "상담" },
                                                    { key: "doctorCounselor", label: "원장상담" },
                                                    { key: "doctor", label: "담당의" },
                                                    ...memoSections.map((s) => ({ key: s.id, label: s.label })),
                                                    { key: "todo", label: "할일" },
                                                ];
                                                const draft: Record<string, boolean> = {};
                                                defaultKeys.forEach(({ key }) => {
                                                    const found = existing.find((item: any) => item.key === key);
                                                    draft[key] = found ? found.enabled : true;
                                                });
                                                setPrintConfigDraft(draft);
                                                setIsPrintSettingsOpen(true);
                                            }}
                                            className="rounded-lg p-1 text-[#616161] hover:text-[#5C2A35] hover:bg-[#FCEBEF] transition-all duration-200"
                                            title="인쇄 설정"
                                        >
                                            <Settings className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    {!isPrintPreviewCollapsed && (
                                    <div className="px-4 py-3 bg-white text-[13px] leading-relaxed font-mono whitespace-pre-wrap text-[#242424]">
                                        {(() => {
                                            const pc = settings.chartConfig?.printConfig || [];
                                            const isPE = (key: string) => { const f = pc.find((i: any) => i.key === key); return f ? f.enabled : true; };
                                            const visitDate = parseScheduledAtLocal(selectedVisit.scheduledAt);
                                            const formattedDate = format(visitDate, "yyyy-MM-dd HH:mm:ss");
                                            const dirty = dirtyFieldsRef.current;
                                            const chartLines: string[] = [];
                                            memoSections.forEach((section) => {
                                                if (!isPE(section.id)) return;
                                                const field = sectionToChartField[section.id] || section.id;
                                                const dirtyKey = `chart_${section.id}`;
                                                const value = String(dirty[dirtyKey]?.value ?? (selectedVisit.consultation as any)?.[field] ?? (selectedVisit as any)?.[field] ?? "").trim();
                                                if (value) chartLines.push(`[${section.label}] ${value}`);
                                            });
                                            if (isPE("todo") && visibleTodos.length > 0) {
                                                chartLines.push(`[할일] ${visibleTodos.map((t) => `${t.isCompleted ? "✓" : "○"} ${t.content}`).join(", ")}`);
                                            }
                                            const doctorLabel = (() => {
                                                const docId = String((selectedVisit as any)?.doctorId || (selectedVisit?.consultation as any)?.doctorId || "");
                                                if (!docId) return "미지정";
                                                return doctorMembers.find((m) => m.id === docId)?.name || selectedDoctorCounselorLabel;
                                            })();
                                            const staffParts: string[] = [];
                                            if (isPE("counselor")) staffParts.push(`상담:${selectedCounselorLabel}`);
                                            if (isPE("doctorCounselor")) staffParts.push(`원장상담:${selectedDoctorCounselorLabel}`);
                                            if (isPE("doctor")) staffParts.push(`담당의:${doctorLabel}`);
                                            return (
                                                <>
                                                    <div className="font-bold">{patient.name} {formattedDate}</div>
                                                    {staffParts.length > 0 && <div className="text-[#616161]">{staffParts.join("  ")}</div>}
                                                    {chartLines.length > 0 ? (
                                                        <div className="mt-2 border-t border-[#FCEBEF] pt-2">{chartLines.join("\n")}</div>
                                                    ) : (
                                                        <div className="mt-2 text-[#9E9E9E] italic">차트 내용이 없습니다.</div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                    )}
                                </div>

                                {/* Consultation 3-Col Grid */}
                                <div className="grid grid-cols-3 border border-[#F8DCE2] rounded-2xl min-h-[300px] mb-4 divide-x divide-[#F8DCE2] bg-white overflow-hidden">
                                    {memoSections.map((section, idx) => (
                                        <div key={`${selectedVisit.id}-${section.id}`} className="flex flex-col">
                                            <div className="h-9 px-3 border-b border-[#F8DCE2] bg-[#FCF7F8] flex items-center justify-between font-semibold text-[#5C2A35] text-sm">
                                                <span>{section.label}</span>
                                                {idx === memoSections.length - 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={handleOpenMemoSectionSettings}
                                                        className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                                        title="차트 메모 항목 설정"
                                                    >
                                                        <Settings className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                            {canViewMedicalRecord ? (
                                            <SmartTextarea
                                                key={`${selectedVisit.id}-${section.id}-${chartDataVersion}`}
                                                className={`flex-1 p-3 text-sm resize-none outline-none border-none focus:ring-0 ${(isReadOnly || !canEditMedicalRecord) ? "!bg-gray-200 text-gray-500 cursor-not-allowed" : ""}`}
                                                placeholder={`${section.label} 내용`}
                                                defaultValue={(selectedVisit.consultation as any)?.[sectionToChartField[section.id] || section.id] || (selectedVisit as any)?.[sectionToChartField[section.id] || section.id] || ""}
                                                onChange={(e) => { if (!isReadOnly && canEditMedicalRecord) dirtyFieldsRef.current[`chart_${section.id}`] = { visitId: selectedVisit.id, value: e.target.value }; }}
                                                onBlur={(e) => !isReadOnly && canEditMedicalRecord && handleSaveConsultation(section.id, e.target.value)}
                                                readOnly={isReadOnly || !canEditMedicalRecord}
                                            />
                                            ) : (
                                            <div className="flex-1 flex items-center justify-center text-sm text-[#616161]">권한이 없으므로 정보를 표시 할 수 없습니다.</div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Medical Record */}
                                <div className="border border-[#F8DCE2] rounded-2xl min-h-[350px] flex flex-col bg-white overflow-hidden">
                                    <div className="h-9 px-3 border-b border-[#F8DCE2] bg-[#FCF7F8] flex items-center justify-between font-semibold text-[#5C2A35] text-sm">
                                        <div className="flex items-center gap-2">
                                            진료기록
                                        </div>
                                        <ImageIcon className="w-4 h-4 text-[#616161] hover:text-[#D27A8C] cursor-pointer transition-colors" />
                                    </div>
                                    {canViewMedicalRecord ? (
                                    <SmartTextarea
                                        key={`med-${selectedVisit.id}-${chartDataVersion}`}
                                        className={`flex-1 p-3 text-sm resize-none outline-none border-none focus:ring-0 ${(isReadOnly || !canEditMedicalRecord) ? "!bg-gray-200 text-gray-500 cursor-not-allowed" : ""}`}
                                        placeholder="진료 기록 작성..."
                                        defaultValue={(selectedVisit as any).medicalRecord || ""}
                                        onChange={(e) => { if (!isReadOnly && canEditMedicalRecord) dirtyFieldsRef.current['medicalRecord'] = { visitId: selectedVisit.id, value: e.target.value }; }}
                                        onBlur={(e) => !isReadOnly && canEditMedicalRecord && handleSaveMedicalRecord(e.target.value)}
                                        readOnly={isReadOnly || !canEditMedicalRecord}
                                    />
                                    ) : (
                                    <div className="flex-1 flex items-center justify-center text-sm text-[#616161]">권한이 없으므로 정보를 표시 할 수 없습니다.</div>
                                    )}
                                </div>

                                <div className="mt-4 border border-[#F8DCE2] rounded-2xl p-3 bg-white">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-semibold text-sm text-[#5C2A35]">문서발급</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsDocumentModalOpen(true)}
                                            className="flex-1 py-2 border border-[#F8DCE2] rounded-lg text-xs font-semibold text-[#242424] bg-white hover:bg-[#D27A8C]/5 hover:border-[#D27A8C]/30 flex items-center justify-center gap-1.5 transition-colors"
                                        >
                                            <FileText className="w-3.5 h-3.5" /> 서류 발급
                                        </button>

                                    </div>
                                </div>
                            </div>

                            {/* Center Footer - Action Bar */}
                            <div className="border-t border-[#F8DCE2] bg-[#FCF7F8] px-4 py-2 flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-2">
                                    {isLockedByMe && (
                                        <button
                                            onClick={handleUnlockChart}
                                            disabled={isLockBusy}
                                            className="px-2.5 py-1 border border-red-300 rounded-lg text-xs font-semibold text-red-600 bg-red-50 flex items-center gap-1 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Unlock className="w-3 h-3" /> {isLockBusy ? "처리중..." : "잠금해제"}
                                        </button>
                                    )}
                                    {!isLockedByMe && !lockingUserId && (
                                        <button
                                            onClick={handleLockChart}
                                            disabled={isLockBusy}
                                            className="px-2.5 py-1 border border-red-300 rounded-lg text-xs font-semibold text-red-600 bg-red-50 flex items-center gap-1 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Lock className="w-3 h-3" /> {isLockBusy ? "처리중..." : "차트수정"}
                                        </button>
                                    )}
                                    {isReadOnly && lockingUserName && (
                                        <>
                                            <div className="flex items-center gap-1.5 text-[13px] text-red-600">
                                                <Lock className="w-3.5 h-3.5" />
                                                <span className="font-bold">{lockingUserName}님 수정 중</span>
                                            </div>
                                            {canForceUnlock && (
                                            <button
                                                onClick={handleForceUnlockChart}
                                                className="px-2.5 py-1 border border-red-300 rounded-lg text-xs font-semibold text-red-600 bg-red-50 flex items-center gap-1 hover:bg-red-100 transition-colors"
                                            >
                                                강제 잠금해제
                                            </button>
                                            )}
                                        </>
                                    )}
                                    {isReadOnly && !lockingUserName && !isLockedByMe && (
                                        <div className="flex items-center text-[13px] text-red-600">
                                            <span className="font-bold">읽기 전용 (수정불가)</span>
                                        </div>
                                    )}
                                </div>
                                <div className="relative" ref={locationDropdownRef}>
                                    <button
                                        onClick={() => !isReadOnly && setIsLocationDropdownOpen(!isLocationDropdownOpen)}
                                        disabled={isReadOnly}
                                        className={`px-4 min-h-[40px] py-2 border border-[#F8DCE2] rounded-lg text-xs font-medium text-[#242424] bg-white flex items-center gap-1.5 transition-all duration-200 ease-in-out ${isReadOnly ? "opacity-50 cursor-not-allowed" : "hover:bg-[#D27A8C]/5 hover:border-[#D27A8C]/30"}`}
                                    >
                                        {selectedVisit?.room
                                            ? waitLocations.find((l) => l.id === selectedVisit.room)?.label || selectedVisit.room
                                            : "대기실 선택"}
                                        <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                    {isLocationDropdownOpen && !isReadOnly && (
                                        <div className="absolute bottom-full mb-1 left-0 w-48 bg-white border border-[#F8DCE2] rounded-xl shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                                            {waitLocations.map((loc) => (
                                                <button
                                                    key={loc.id}
                                                    onClick={() => handleUpdateVisitRoom(loc.id)}
                                                    className="w-full text-left px-4 py-2 text-xs hover:bg-[#D27A8C]/5 text-[#242424] flex justify-between items-center transition-colors"
                                                >
                                                    {loc.label}
                                                    {selectedVisit?.room === loc.id && <Check className="w-3 h-3 text-[#D27A8C]" />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleManualSave}
                                    disabled={isReadOnly}
                                    className="px-5 min-h-[40px] py-2 font-bold rounded-xl text-[12px] tracking-[0.2px] flex items-center gap-1.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                                    style={{
                                        background: isReadOnly
                                            ? "linear-gradient(135deg, #E5B5C0 0%, #D4A5B0 100%)"
                                            : "linear-gradient(135deg, #D27A8C 0%, #C9485B 100%)",
                                        boxShadow: isReadOnly ? "none" : "0 4px 14px rgba(226, 107, 124, 0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isReadOnly) {
                                            e.currentTarget.style.boxShadow = "0 6px 20px rgba(226, 107, 124, 0.38), inset 0 1px 0 rgba(255,255,255,0.22)";
                                            e.currentTarget.style.transform = "translateY(-1px)";
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isReadOnly) {
                                            e.currentTarget.style.boxShadow = "0 4px 14px rgba(226, 107, 124, 0.28), inset 0 1px 0 rgba(255,255,255,0.18)";
                                            e.currentTarget.style.transform = "translateY(0)";
                                        }
                                    }}
                                >
                                    <Save className="w-3.5 h-3.5" /> 저장하기
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-[#616161] gap-4">
                            <span className="text-base">차트를 선택해주세요</span>
                            {chartVisits.length === 0 && (
                                <button
                                    onClick={() => setShowReceptionModal(true)}
                                    className="px-5 py-2.5 bg-[#D27A8C] text-white rounded-lg font-semibold hover:bg-[#8B3F50] transition-colors shadow-md"
                                >
                                    오늘의 차트 작성하기
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Separator 1-2 */}
                {!isMobile && (
                    <div
                        className="w-1 shrink-0 cursor-col-resize hover:bg-[#D27A8C]/30 active:bg-[#D27A8C]/50 transition-colors"
                        onMouseDown={(e) => onSepMouseDown(1, e)}
                    />
                )}

                {/* [Column 3] Center Right: Orders/Payment */}
                <div
                    className={`flex flex-col border-r border-[#F8DCE2] bg-white overflow-hidden ${isMobile && activeMobileColumn !== "ticket" ? "hidden" : ""}`}
                    style={{ width: isMobile ? "100%" : (colWidths[2] ?? '30%') }}
                >
                    <div
                        className="h-12 border-b border-[#F8DCE2] flex items-center justify-between px-4"
                        style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FCF7F8 100%)" }}
                    >
                        <div className="flex items-center gap-2">
                            <span className="w-1 h-4 rounded-full" style={{ background: "linear-gradient(180deg, #D27A8C 0%, #F49EAF 100%)" }} />
                            <span className="font-bold text-[14px] tracking-[-0.2px]" style={{ color: "#5C2A35" }}>티켓 구매</span>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-start overflow-y-auto p-3 bg-white">
                        {/* Search */}
                        <div className="relative mb-3 group shrink-0" ref={searchRef}>
                            <input
                                className="w-full h-11 px-4 rounded-xl border outline-none text-[14px] placeholder-[#B89BA0] transition-all duration-200"
                                style={{
                                    background: "linear-gradient(180deg, #FCF7F8 0%, #FFFFFF 100%)",
                                    borderColor: "#F8DCE2",
                                    boxShadow: "inset 0 1px 2px rgba(226, 107, 124, 0.04)",
                                }}
                                placeholder="오더 검색 (Ctrl+Shift+5)"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setIsSearchOpen(true);
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = "#D27A8C";
                                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(244, 158, 175, 0.18), inset 0 1px 2px rgba(226, 107, 124, 0.04)";
                                    setIsSearchOpen(true);
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = "#F8DCE2";
                                    e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(226, 107, 124, 0.04)";
                                }}
                            />
                            <div className="absolute right-0 top-2 flex gap-1.5">
                                <button className="p-1 rounded-lg hover:bg-[#D27A8C]/10 text-[#9E9E9E] hover:text-[#D27A8C] transition-colors">
                                    <Gift className="w-4 h-4" />
                                </button>
                                <button className="p-1 rounded-lg hover:bg-[#D27A8C]/10 text-[#9E9E9E] hover:text-[#D27A8C] transition-colors">
                                    <CreditCard className="w-4 h-4" />
                                </button>
                                <button className="p-1 rounded-lg hover:bg-[#D27A8C]/10 text-[#9E9E9E] hover:text-[#D27A8C] transition-colors">
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>

                            {(isSearchOpen || searchQuery) && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#F8DCE2] rounded-xl shadow-lg z-20 max-h-[400px] flex flex-col overflow-hidden">
                                    <div className="bg-[#FCF7F8] flex border-b border-[#F8DCE2] justify-between items-center">
                                        <div className="flex overflow-x-auto no-scrollbar">
                                            {[
                                                { id: "all", label: "전체" },
                                                { id: "ticket", label: "티켓" },
                                                { id: "membership", label: "회원권" },
                                            ].map((tab) => {
                                                const active = searchTab === (tab.id as any);
                                                return (
                                                    <div
                                                        key={tab.id}
                                                        onClick={() => setSearchTab(tab.id as any)}
                                                        className={`px-3 py-2 text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${active ? "text-[#D27A8C] border-b-2 border-[#D27A8C]" : "text-[#616161] hover:text-[#D27A8C] hover:bg-[#D27A8C]/5"
                                                            }`}
                                                    >
                                                        {tab.label}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div
                                            className="px-3 py-2 cursor-pointer text-gray-400 hover:text-gray-600"
                                            onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }}
                                        >
                                            <X className="w-4 h-4" />
                                        </div>
                                    </div>

                                    <div className="overflow-y-auto max-h-[300px] p-2">
                                        {/* Tickets */}
                                        {(searchTab === "all" || searchTab === "ticket") && (() => {
                                            const TICKET_DROPDOWN_LIMIT = 50;
                                            const visibleTickets = ticketSearchItems.slice(0, TICKET_DROPDOWN_LIMIT);
                                            const overflowCount = Math.max(0, ticketSearchItems.length - TICKET_DROPDOWN_LIMIT);
                                            return (
                                            <div className="mb-2">
                                                <div className="text-[12px] items-center text-gray-400 mb-1 px-2 flex gap-1">
                                                    <MessageSquare className="w-3 h-3" /> 티켓 명칭으로 검색해보세요
                                                </div>

                                                {visibleTickets.map((t: any) => {
                                                    const queueWaitClass =
                                                        t.queueWaitMinutes >= 70
                                                            ? "border-rose-200 bg-rose-50 text-rose-700"
                                                            : t.queueWaitMinutes >= 40
                                                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                                                : "border-emerald-200 bg-emerald-50 text-emerald-700";

                                                    return (
                                                        <div
                                                            key={t.id}
                                                            className="rounded-lg p-2.5 text-[13px] transition-colors hover:bg-[#D27A8C]/5 cursor-pointer group"
                                                            onClick={() => !isReadOnly && handleAddTicket(t)}
                                                            style={isReadOnly ? { pointerEvents: "none", opacity: 0.5 } : undefined}
                                                        >
                                                            <div className="flex min-w-0 items-center gap-1.5">
                                                                <Gift className="w-3 h-3 text-[#D27A8C] shrink-0" />
                                                                <span className="font-semibold text-[#242424] truncate flex-1 min-w-0">{t.name}</span>
                                                            </div>
                                                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
                                                                <span className="bg-[#D27A8C]/10 text-[#D27A8C] px-1.5 rounded-md font-semibold">
                                                                    {t.usageUnit === "session" ? "횟수권" : "기간권"}
                                                                </span>
                                                                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-cyan-700">
                                                                    대기 {t.queueTodoCount}건
                                                                </span>
                                                                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                                                                    진행 {t.queueDoingCount}건
                                                                </span>
                                                                <span className={`rounded-full border px-1.5 py-0.5 ${queueWaitClass}`}>
                                                                    예상 {t.queueWaitMinutes}분
                                                                </span>
                                                                <span className="ml-auto flex items-center gap-1.5">
                                                                    {t.eventPrice != null && t.eventPrice < (t.originalPrice || t.price) ? (
                                                                        <>
                                                                            <span className="text-[#9E9E9E] line-through text-[11px]">{(t.originalPrice || t.price || 0).toLocaleString()}</span>
                                                                            <span className="font-bold text-[#E74856]">{(t.eventPrice || 0).toLocaleString()}원</span>
                                                                        </>
                                                                    ) : (
                                                                        <span className="font-bold text-[#D27A8C]">{(t.originalPrice || t.price || 0).toLocaleString()}원</span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {ticketSearchItems.length === 0 && (
                                                    <div className="px-2 py-4 text-center text-[13px] text-gray-400">
                                                        조건에 맞는 티켓이 없습니다.
                                                    </div>
                                                )}
                                                {overflowCount > 0 && (
                                                    <div className="mt-1 px-2 py-2 text-center text-[11px] font-medium" style={{ color: "#8B3F50", background: "rgba(244, 158, 175, 0.10)", border: "1px dashed rgba(244, 158, 175, 0.35)", borderRadius: 8 }}>
                                                        +{overflowCount.toLocaleString()}개 더 있음 — 검색어를 입력해 좁혀주세요
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })()}

                                        {/* Memberships */}
                                        {(searchTab === "all" || searchTab === "membership") && (
                                            <div className="mb-2">
                                                <div className="text-[12px] items-center text-gray-400 mb-1 px-2 flex gap-1">
                                                    <MessageSquare className="w-3 h-3" /> 회원권 명칭으로 검색해보세요
                                                </div>

                                                {settings?.tickets?.memberships
                                                    ?.filter((m: any) => {
                                                        if (!m.enabled) return false;
                                                        if (searchQuery && !String(m.name || "").includes(searchQuery)) return false;
                                                        return true;
                                                    })
                                                    .map((m: any) => (
                                                        <div
                                                            key={m.id}
                                                            className={`p-2.5 flex justify-between text-[13px] rounded-lg transition-colors group ${isReadOnly ? "opacity-50 cursor-not-allowed" : "hover:bg-violet-50 cursor-pointer"}`}
                                                            onClick={() => !isReadOnly && handleAddMembership(m)}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <TicketIcon className="w-3 h-3 text-violet-600" />
                                                                <span className="font-semibold text-[#242424]">{m.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="bg-violet-100 text-violet-700 px-1.5 rounded-md text-[12px] font-semibold">회원권</span>
                                                                {m.eventPrice != null && m.eventPrice < (m.amount || 0) ? (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-[#9E9E9E] line-through text-[12px]">{((m.amount || 0) / 10000).toLocaleString()}만원</span>
                                                                        <span className="font-bold text-[#E74856]">{((m.eventPrice || 0) / 10000).toLocaleString()}만원</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="font-bold text-violet-700">{((m.amount || 0) / 10000).toLocaleString()}만원</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Cart Items */}
                        <div className="space-y-1.5 mb-3 shrink-0 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {[...cartItems].reverse().map((item) => {
                                const hasEvent = item.eventPrice != null && item.eventPrice < item.originalPrice;
                                return (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-2 text-[12px] p-2.5 bg-white hover:bg-[#FCF7F8] rounded-lg border border-[#F8DCE2] shadow-sm group transition-colors"
                                    >
                                        <span className={`font-bold px-1.5 py-0.5 rounded-md text-[12px] shrink-0 ${item.itemType === "membership" ? "bg-violet-100 text-violet-700" : "bg-[#D27A8C]/10 text-[#D27A8C]"}`}>
                                            {item.itemType === "membership" ? "회원권" : "티켓"}
                                        </span>

                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <span className="text-gray-800 font-bold text-[13px] break-keep leading-tight">{item.itemName}</span>
                                            <div className="flex items-center gap-2 text-[12px]">
                                                {hasEvent ? (
                                                    <>
                                                        <span className="text-gray-400 line-through">정상가 {(item.originalPrice || 0).toLocaleString()}원</span>
                                                        <span className="text-red-500 font-bold">이벤트가 {(item.eventPrice || 0).toLocaleString()}원</span>
                                                    </>
                                                ) : (
                                                    <span className="text-gray-500">{(item.originalPrice || item.unitPrice || 0).toLocaleString()}원</span>
                                                )}
                                            </div>
                                        </div>

                                        {!isReadOnly && (
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                <button
                                                    onClick={() => handleUpdateQuantity(item, -1)}
                                                    disabled={item.quantity <= 1}
                                                    className="w-6 h-6 flex items-center justify-center rounded border border-[#F8DCE2] text-[#616161] hover:bg-[#FCEBEF] disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold transition-colors"
                                                >
                                                    −
                                                </button>
                                                <span className="w-6 text-center text-xs font-bold text-[#242424]">{item.quantity}</span>
                                                <button
                                                    onClick={() => handleUpdateQuantity(item, 1)}
                                                    className="w-6 h-6 flex items-center justify-center rounded border border-[#F8DCE2] text-[#616161] hover:bg-[#FCEBEF] text-xs font-bold transition-colors"
                                                >
                                                    +
                                                </button>
                                                <X className="w-4 h-4 text-gray-300 cursor-pointer hover:text-red-500 shrink-0 ml-1" onClick={() => handleRemoveCartItem(item.id)} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {cartItems.length === 0 && <div className="text-center text-gray-300 py-2 text-[13px]">처방 내역이 없습니다</div>}
                        </div>

                        {/* Todo */}
                        <div className="border border-[#F8DCE2] rounded-2xl p-3 bg-white mb-4">
                            <div className="font-semibold text-[15px] mb-2 text-[#5C2A35]">할일</div>
                            <div className="bg-[#FCF7F8] rounded-lg p-2 mb-2 border border-[#FCEBEF]">
                                <input
                                    className="w-full bg-transparent text-[13px] outline-none placeholder-[#9E9E9E]"
                                    placeholder="할일 메모 (Shift+Enter: 줄바꿈)"
                                    value={todoInput}
                                    onChange={(e) => setTodoInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAddTodo();
                                        }
                                    }}
                                />
                            </div>
                            <div className="space-y-1 max-h-[150px] overflow-y-auto">
                                {visibleTodos.map((todo, idx) => {
                                    const todoStatus = (todo as any).status || (todo.isCompleted ? "done" : "todo");
                                    const moveTodo = (direction: -1 | 1) => {
                                        const targetIdx = idx + direction;
                                        if (targetIdx < 0 || targetIdx >= visibleTodos.length) return;
                                        const otherId = visibleTodos[targetIdx].id;
                                        setTodos((prev) => {
                                            const next = [...prev];
                                            const a = next.findIndex((t) => t.id === todo.id);
                                            const b = next.findIndex((t) => t.id === otherId);
                                            if (a < 0 || b < 0) return prev;
                                            [next[a], next[b]] = [next[b], next[a]];
                                            return next;
                                        });
                                    };
                                    return (
                                    <div key={todo.id} className="flex items-center gap-2 group text-[13px] text-gray-600 hover:bg-gray-50 p-1 rounded relative">
                                        <svg
                                            className="w-3.5 h-3.5 cursor-pointer flex-shrink-0"
                                            viewBox="0 0 16 16"
                                            onClick={() => handleToggleTodo(todo)}
                                            title={todoStatus === "todo" ? "시작" : todoStatus === "doing" ? "완료" : "초기화"}
                                        >
                                            <circle cx="8" cy="8" r="7" fill="none" stroke={todoStatus === "todo" ? "#D1D5DB" : todoStatus === "doing" ? "#D27A8C" : "#10B981"} strokeWidth="1.5" />
                                            {todoStatus === "doing" && (
                                                <path d="M8 1 A7 7 0 0 1 8 15 Z" fill="#D27A8C" />
                                            )}
                                            {todoStatus === "done" && (
                                                <circle cx="8" cy="8" r="5.5" fill="#10B981" />
                                            )}
                                        </svg>
                                        <span className={`flex-1 min-w-0 truncate ${todoStatus === "done" ? "line-through text-gray-400" : ""}`}>{todo.content}</span>
                                        {todoStatus === "doing" && (todo as any).startedAt && (
                                            <span className="text-[11px] text-[#D27A8C] flex-shrink-0">{format(new Date((todo as any).startedAt), "HH:mm:ss")} ~</span>
                                        )}
                                        {todoStatus === "done" && (todo as any).startedAt && (todo as any).completedAt && (
                                            <span className="text-[11px] text-emerald-600 flex-shrink-0">
                                                {Math.round((new Date((todo as any).completedAt).getTime() - new Date((todo as any).startedAt).getTime()) / 60000)}분
                                            </span>
                                        )}
                                        <div className="relative flex-shrink-0">
                                            <button
                                                data-assign-todo={todo.id}
                                                onClick={() => setAssigningTodoId(assigningTodoId === todo.id ? null : todo.id)}
                                                className={`w-5 h-5 flex items-center justify-center rounded-full transition-colors ${
                                                    todo.assignee ? "bg-[#D27A8C]/15 text-[#D27A8C]" : "text-gray-300 hover:text-[#D27A8C] hover:bg-[#D27A8C]/10"
                                                }`}
                                                title={todo.assignee || "담당자 지정"}
                                            >
                                                <User className="w-3 h-3" />
                                            </button>
                                            {assigningTodoId === todo.id && (
                                                <>
                                                <div className="fixed inset-0 z-[9998]" onClick={() => setAssigningTodoId(null)} />
                                                <div
                                                    className="fixed z-[9999] w-48 max-h-52 overflow-y-auto bg-white border border-[#F8DCE2] rounded-lg shadow-lg py-1"
                                                    style={{
                                                        top: (() => {
                                                            const btn = document.querySelector(`[data-assign-todo="${todo.id}"]`);
                                                            if (!btn) return 0;
                                                            const rect = btn.getBoundingClientRect();
                                                            return rect.bottom + 4;
                                                        })(),
                                                        left: (() => {
                                                            const btn = document.querySelector(`[data-assign-todo="${todo.id}"]`);
                                                            if (!btn) return 0;
                                                            const rect = btn.getBoundingClientRect();
                                                            return Math.max(4, rect.right - 192);
                                                        })(),
                                                    }}
                                                >
                                                    {departmentUserGroups.map((group) => (
                                                        <div key={group.deptName}>
                                                            <div className="px-3 py-1 text-[11px] font-bold text-[#5C2A35] bg-[#FCF7F8]">{group.deptName}</div>
                                                            {group.users.map((u) => (
                                                                <button
                                                                    key={u.id}
                                                                    className={`w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#D27A8C]/10 transition-colors ${
                                                                        todo.assigneeUserId === u.id ? "text-[#D27A8C] font-bold bg-[#D27A8C]/5" : "text-gray-700"
                                                                    }`}
                                                                    onClick={() => handleAssignTodoUser(todo.id, u.id, u.name)}
                                                                >
                                                                    {u.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                                </>
                                            )}
                                        </div>
                                        {todo.assignee && (
                                            <span className="text-[11px] text-[#D27A8C] font-semibold flex-shrink-0">{todo.assignee}</span>
                                        )}
                                        <button
                                            type="button"
                                            disabled={idx === 0}
                                            onClick={() => moveTodo(-1)}
                                            className="text-gray-300 hover:text-[#D27A8C] disabled:opacity-20 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 flex-shrink-0 text-[14px] leading-none px-0.5"
                                            title="위로"
                                        >▲</button>
                                        <button
                                            type="button"
                                            disabled={idx === visibleTodos.length - 1}
                                            onClick={() => moveTodo(1)}
                                            className="text-gray-300 hover:text-[#D27A8C] disabled:opacity-20 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 flex-shrink-0 text-[14px] leading-none px-0.5"
                                            title="아래로"
                                        >▼</button>
                                        <Trash
                                            className="w-3 h-3 text-gray-300 cursor-pointer hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0"
                                            onClick={() => handleRemoveTodo(todo.id)}
                                        />
                                    </div>
                                    );
                                })}
                            </div>
                            <button onClick={handleAddTodo} className="w-full mt-2 py-1.5 bg-[#D27A8C]/10 hover:bg-[#D27A8C]/20 text-[13px] text-[#D27A8C] font-semibold rounded-lg transition-colors">
                                등록
                            </button>
                        </div>

                        {/* Payment Summary */}
                        <div className="mt-auto border-t border-[#F8DCE2] bg-[#FCF7F8] p-3 space-y-2.5">
                            <div className="flex justify-between items-center">
                                <span className="text-[14px] font-semibold text-[#5C2A35]">수납내역</span>
                                {remaining > 0 ? (
                                    <span className="bg-[#E74856] text-white px-2.5 py-0.5 rounded-full text-[12px] font-bold shadow-sm">미수납</span>
                                ) : (
                                    <span className="bg-[#92C353] text-white px-2.5 py-0.5 rounded-full text-[12px] font-bold shadow-sm">완료</span>
                                )}
                            </div>

                            {/* Membership Balance Selector */}
                            {membershipBalances.length > 0 && (
                                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-2.5 shadow-sm">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[13px] font-semibold text-violet-800">우선 차감 회원권</span>
                                        <span className="text-[13px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                                            {totalMembershipBalance.toLocaleString()}원
                                        </span>
                                    </div>
                                    <select
                                        className="w-full text-[13px] border border-violet-200 rounded-lg px-2.5 py-2 bg-white focus:ring-2 focus:ring-[#D27A8C]/30 focus:border-[#D27A8C] outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={isReadOnly}
                                        value={selectedMembershipId ?? ""}
                                        onChange={(e) => {
                                            const nextValue = String(e.target.value || "").trim();
                                            if (!nextValue) {
                                                setIsMembershipUsageDisabled(true);
                                                setSelectedMembershipId(undefined);
                                                return;
                                            }
                                            setIsMembershipUsageDisabled(false);
                                            setSelectedMembershipId(Number(nextValue));
                                        }}
                                    >
                                        <option value="">회원권 미사용</option>
                                        {membershipBalances.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {m.name} (현금:{(m.cashBalance ?? m.balance).toLocaleString()}원{(m.pointBalance ?? 0) > 0 ? ` / P:${(m.pointBalance ?? 0).toLocaleString()}` : ""}, {m.discountPercent}% 할인)
                                            </option>
                                        ))}
                                    </select>
                                    {!isMembershipUsageDisabled && selectedMembershipId && membershipBalances.length > 1 && (
                                        <div className="mt-1 text-[12px] text-purple-500">
                                            선택 회원권부터 차감 후 다음 회원권으로 자동 차감
                                        </div>
                                    )}
                                    {!isMembershipUsageDisabled && (
                                        <label className="mt-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-violet-800 cursor-pointer select-none">
                                            <span>포인트 사용</span>
                                            <input
                                                type="checkbox"
                                                checked={usePoints}
                                                disabled={isReadOnly}
                                                onChange={(e) => setUsePoints(e.target.checked)}
                                                className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                                            />
                                        </label>
                                    )}
                                </div>
                            )}

                            {/* Coupon Selector */}
                            {enabledCoupons.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 shadow-sm">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[13px] font-semibold text-amber-800">적용 쿠폰</span>
                                    </div>
                                    <div className="relative" ref={couponDropdownRef}>
                                        <button
                                            type="button"
                                            disabled={isReadOnly}
                                            className={`w-full flex items-center justify-between rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-left text-[13px] text-gray-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${isReadOnly ? "opacity-50 cursor-not-allowed" : "hover:border-amber-300"}`}
                                            onClick={() => !isReadOnly && setIsCouponDropdownOpen((prev) => !prev)}
                                        >
                                            <span className="truncate pr-2">{selectedCouponLabel}</span>
                                            <ChevronDown
                                                className={`h-3.5 w-3.5 shrink-0 text-amber-500 transition-transform ${isCouponDropdownOpen ? "rotate-180" : ""}`}
                                            />
                                        </button>

                                        {isCouponDropdownOpen && (
                                            <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-amber-100 bg-white p-1 shadow-lg">
                                                <button
                                                    type="button"
                                                    className={`w-full flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                                                        !selectedCouponId
                                                            ? "bg-amber-50 text-amber-700"
                                                            : "text-gray-700 hover:bg-gray-50"
                                                    }`}
                                                    onClick={() => {
                                                        setSelectedCouponId(undefined);
                                                        setIsCouponDropdownOpen(false);
                                                    }}
                                                >
                                                    <span>쿠폰 미적용</span>
                                                    {!selectedCouponId && <Check className="h-3.5 w-3.5" />}
                                                </button>
                                                {enabledCoupons.map((coupon: any) => {
                                                    const couponId = String(coupon.id);
                                                    const isSelected = String(selectedCouponId || "") === couponId;
                                                    return (
                                                        <button
                                                            key={couponId}
                                                            type="button"
                                                            className={`w-full flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                                                                isSelected
                                                                    ? "bg-amber-50 text-amber-700"
                                                                    : "text-gray-700 hover:bg-gray-50"
                                                            }`}
                                                            onClick={() => {
                                                                setSelectedCouponId(couponId);
                                                                setIsCouponDropdownOpen(false);
                                                            }}
                                                        >
                                                            <span className="truncate pr-2">
                                                                {coupon.label} ({Number(coupon.discountPercent || 0)}% 할인)
                                                            </span>
                                                            {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* === 상품합계 카드 === */}
                            <div className="rounded-2xl border border-[#F8DCE2] bg-white overflow-hidden">
                                <div className="flex justify-between items-center px-3 py-2.5 bg-[#FCF7F8] border-b border-[#F8DCE2]">
                                    <span className="text-[13px] font-semibold text-[#5C2A35]">상품합계</span>
                                    <span className="text-[13px] font-bold text-[#5C2A35]">{(cartPreview?.treatmentTotal || totalAmount || 0).toLocaleString()}원</span>
                                </div>
                                {cartPreview?.treatmentItems && cartPreview.treatmentItems.length > 0 && (
                                    <div className="px-3 py-1.5 divide-y divide-[#eeeeee]">
                                        <div className="pb-1 text-[12px] text-[#616161] font-medium">
                                            티켓 {cartItems.filter(i => i.itemType !== "membership").length}건
                                        </div>
                                        {cartPreview.treatmentItems.map((t, idx) => (
                                            <div key={`treat-${idx}`} className="flex justify-between items-center py-1">
                                                <span className="text-[12px] text-[#616161] truncate pr-3 cursor-help" title={t.name}>{t.name}</span>
                                                <span className="text-[12px] font-semibold text-[#242424] shrink-0 tabular-nums">{(t.eventPrice || t.originalPrice || 0).toLocaleString()}원</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* === 할인합계 카드 === */}
                            {(cartPreview?.totalDiscountAmount || 0) > 0 && (
                                <div className="rounded-2xl border border-[#E74856]/30 bg-white overflow-hidden">
                                    <div className="flex justify-between items-center px-3 py-2.5 bg-[#E74856]/8 border-b border-[#E74856]/20">
                                        <span className="text-[13px] font-semibold text-[#E74856]">할인합계</span>
                                        <span className="text-[13px] font-bold text-[#E74856]">-{(cartPreview?.totalDiscountAmount || 0).toLocaleString()}원</span>
                                    </div>
                                    <div className="px-3 py-1.5 space-y-1">
                                        {(cartPreview?.couponDiscountAmount || 0) > 0 && (
                                            <details className="group">
                                                <summary className="flex justify-between items-center py-1 cursor-pointer list-none">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                                                        <span className="text-[12px] font-medium text-amber-700">쿠폰할인</span>
                                                        <span className="text-[12px] text-amber-500">({cartPreview?.couponDiscountPercent || 0}%)</span>
                                                    </div>
                                                    <span className="text-[12px] font-semibold text-amber-600 tabular-nums">-{cartPreview?.couponDiscountAmount?.toLocaleString()}원</span>
                                                </summary>
                                                <div className="ml-3 pl-2 border-l-2 border-amber-200 py-1 text-[12px] text-amber-600 space-y-0.5">
                                                    <div>{cartPreview?.selectedCouponLabel || "쿠폰"}</div>
                                                    <div className="text-amber-500">{(cartPreview?.treatmentTotal || 0).toLocaleString()}원 x {cartPreview?.couponDiscountPercent || 0}% = {(cartPreview?.couponDiscountAmount || 0).toLocaleString()}원</div>
                                                </div>
                                            </details>
                                        )}

                                        {cartPreview?.membershipAllocations && cartPreview.membershipAllocations.length > 0 && (
                                            <>
                                                {cartPreview.membershipAllocations.map((alloc, idx) => (
                                                    <details key={`alloc-${idx}`} className="group">
                                                        <summary className="flex justify-between items-center py-1 cursor-pointer list-none">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0"></span>
                                                                <span className="text-[12px] font-medium text-purple-700 truncate">{alloc.name}</span>
                                                                <span className="text-[12px] text-purple-400">({alloc.discountPercent}%)</span>
                                                            </div>
                                                            <span className="text-[12px] font-semibold text-purple-600 shrink-0 tabular-nums">-{alloc.discountAmount.toLocaleString()}원</span>
                                                        </summary>
                                                        <div className="ml-3 pl-2 border-l-2 border-purple-200 py-1 text-[12px] text-purple-600 space-y-0.5">
                                                            <div>담당구간 {alloc.discountBaseAmount.toLocaleString()}원</div>
                                                            <div className="text-purple-500">차감 {alloc.deductedAmount.toLocaleString()}원 = {alloc.discountBaseAmount.toLocaleString()} x {(100 - alloc.discountPercent)}%</div>
                                                            <div className="text-purple-500">할인혜택 {alloc.discountAmount.toLocaleString()}원</div>
                                                        </div>
                                                    </details>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* === 최종결제금액 === */}
                            <div
                                className="rounded-2xl border border-[#D27A8C] bg-[#FCEBEF] px-3 py-2 cursor-pointer select-none transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(226,107,124,0.08)]"
                                onClick={() => setIsFinalAmountExpanded(prev => !prev)}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="text-[13px] font-bold text-[#D27A8C] flex items-center gap-1">
                                        최종결제금액
                                        {isFinalAmountExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </span>
                                    <span className="text-[14px] font-extrabold text-[#5C2A35] tabular-nums">{(cartPreview?.totalCashRequired ?? remaining ?? 0).toLocaleString()}원</span>
                                </div>
                                {isFinalAmountExpanded && (
                                    <div className="mt-1.5 space-y-1 border-t border-[#D27A8C]/20 pt-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[12px] font-medium text-[#D27A8C]">회원권차감금액</span>
                                            <span className="text-[12px] font-bold text-[#D27A8C] tabular-nums">-{(cartPreview?.balanceDeduction ?? 0).toLocaleString()}원</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[12px] font-medium text-[#5C2A35]">결제금액</span>
                                            <span className="text-[12px] font-bold text-[#5C2A35] tabular-nums">{(cartPreview?.totalCashRequired ?? remaining ?? 0).toLocaleString()}원</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* === 수납완료 === */}
                            <div className="rounded-2xl border border-[#92C353]/40 bg-[#92C353]/8 px-3 py-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[12px] font-semibold text-[#498205]">{selectedVisitDate ? "당일 수납완료" : "수납완료"}</span>
                                    <span className="text-[12px] font-bold text-[#498205] tabular-nums">{(paidAmount || 0).toLocaleString()}원</span>
                                </div>
                            </div>

                            {/* === 당일 이력 카드 === */}
                            <div className="rounded-2xl border border-[#F8DCE2] bg-white overflow-hidden">
                                <div className="px-2 py-2 bg-[#FCF7F8] border-b border-[#F8DCE2]">
                                    <div className="flex gap-1">
                                        {([
                                            { key: "purchase_refund" as const, label: "구매·환불", items: [...dailyPurchaseItems, ...dailyRefundItems] },
                                            { key: "usage" as const, label: "사용", items: dailyUsageItems },
                                        ]).map((tab) => {
                                            const active = dailySummaryTab === tab.key;
                                            return (
                                                <button
                                                    key={tab.key}
                                                    onClick={() => setDailySummaryTab(tab.key)}
                                                    className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-all duration-200 ${
                                                        active
                                                            ? "bg-[#D27A8C] text-white shadow-[0_2px_8px_rgba(226,107,124,0.2)]"
                                                            : "text-[#616161] hover:bg-[#FCEBEF]"
                                                    }`}
                                                >
                                                    {tab.label} <span className={`font-bold ${active ? "text-indigo-200" : "text-[#D27A8C]"}`}>{tab.items.length}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="px-2 py-1.5">
                                    {(() => {
                                        const sortByTime = (a: any, b: any) => {
                                            const ta = new Date(a?.occurredAt || a?.paidAt || 0).getTime();
                                            const tb = new Date(b?.occurredAt || b?.paidAt || 0).getTime();
                                            return tb - ta;
                                        };
                                        const visibleItems = dailySummaryTab === "purchase_refund"
                                            ? [...dailyPurchaseItems, ...dailyRefundItems].sort(sortByTime)
                                            : dailyUsageItems;
                                        if (visibleItems.length === 0) {
                                            return (
                                                <div className="text-center text-[12px] text-[#9E9E9E] py-3">
                                                    {dailySummaryTab === "purchase_refund" ? "당일 구매·환불 이력이 없습니다." : "당일 사용 이력이 없습니다."}
                                                </div>
                                            );
                                        }

                                        const groupByItem = dailySummaryTab === "purchase_refund";
                                        const itemGrouped = (() => {
                                            if (!groupByItem) return null;
                                            const map = new Map<string, typeof visibleItems>();
                                            for (const item of visibleItems) {
                                                const isDeduction = (item.sourceType === "membership_deduction");
                                                const key = isDeduction ? `deduction-${item.id}` : (item.itemName || "기타").trim();
                                                const list = map.get(key) || [];
                                                list.push(item);
                                                map.set(key, list);
                                            }
                                            return Array.from(map.entries()).map(([key, items]) => ({
                                                key,
                                                itemName: items.find(i => i.sourceType !== "refund" && i.sourceType !== "ticket_refund")?.itemName || items[0]?.itemName || key,
                                                items: items.sort((a, b) => new Date(a.occurredAt || 0).getTime() - new Date(b.occurredAt || 0).getTime()),
                                                hasPurchase: items.some(i => i.sourceType === "ticket_new" || i.sourceType === "membership_new"),
                                                hasRefund: items.some(i => i.sourceType === "refund" || i.sourceType === "ticket_refund"),
                                            }));
                                        })();

                                        if (itemGrouped) {
                                            return (
                                                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
                                                    {itemGrouped.map((group) => (
                                                        <div key={group.key} className="rounded-lg border border-[#FCEBEF] bg-[#FCF7F8] overflow-hidden">
                                                            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#FCEBEF]/40">
                                                                <span className="text-[12px] font-bold text-[#5C2A35] truncate" title={group.itemName}>{group.itemName}</span>
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    {group.hasPurchase && <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">구매</span>}
                                                                    {group.hasRefund && <span className="rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[9px] font-bold text-red-600">환불</span>}
                                                                </div>
                                                            </div>
                                                            <div className="divide-y divide-[#FCEBEF]">
                                                                {group.items.map((item) => {
                                                                    const badgeClassName =
                                                                        USAGE_SUMMARY_SOURCE_STYLES[item.sourceType] ||
                                                                        "border-slate-200 bg-white text-slate-600";
                                                                    return (
                                                                        <div key={item.id} className="px-2.5 py-1.5 hover:bg-[#FCEBEF]/30 transition-colors">
                                                                            <div className="flex items-start justify-between gap-2">
                                                                                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                                                                                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${badgeClassName}`}>
                                                                                        {item.sourceLabel || "결제"}
                                                                                    </span>
                                                                                    <span className="text-[10px] text-[#616161]">{formatUsageSummaryTime(item.occurredAt)}</span>
                                                                                </div>
                                                                                {item.sourceType !== "ticket_usage" && (item.sourceType === "refund" || item.sourceType === "ticket_refund" ? (
                                                                                    <div className="shrink-0 text-right">
                                                                                        {item.paidAmount != null && (
                                                                                            <span className="text-[10px] text-[#616161] tabular-nums mr-1.5">수납 {Math.max(0, Number(item.paidAmount || 0)).toLocaleString()}원</span>
                                                                                        )}
                                                                                        <span className="text-[11px] font-bold text-red-500 tabular-nums">환불 -{Math.max(0, Number(item.amount || 0)).toLocaleString()}원</span>
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#242424]">
                                                                                        {Math.max(0, Number(item.amount || 0)).toLocaleString()}원
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                            {item.sourceType === "ticket_new" && item.originalPrice != null && (
                                                                                <div className="mt-0.5 flex items-center gap-2 text-[10px] pl-1">
                                                                                    <span className="text-[#616161]">정상가 {item.originalPrice.toLocaleString()}원</span>
                                                                                    {item.eventPrice != null && item.eventPrice < item.originalPrice && (
                                                                                        <span className="text-red-500 font-bold">이벤트가 {item.eventPrice.toLocaleString()}원</span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                            {(item.sourceType === "refund" || item.sourceType === "ticket_refund") && (item as any).refundDetails?.length > 0 && (
                                                                                <div className="mt-1">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); setExpandedRefundId(prev => prev === item.id ? null : item.id); }}
                                                                                        className="text-[10px] font-bold text-[#D27A8C]"
                                                                                    >
                                                                                        {expandedRefundId === item.id ? "접기 ▲" : "상세펼치기 ▼"}
                                                                                    </button>
                                                                                    {expandedRefundId === item.id && (
                                                                                        <div className="mt-1 rounded-[6px] px-2 py-1.5 space-y-0.5 bg-[#FFF3F3] border border-[#FFCDD2]">
                                                                                            {((item as any).refundDetails as Array<{ paymentType: string; amount: number }>).map((detail, idx) => (
                                                                                                <div key={idx} className="flex items-center justify-between text-[10px]">
                                                                                                    <span className="text-[#616161]">{detail.paymentType}</span>
                                                                                                    <span className="font-bold tabular-nums text-[#E53935]">{detail.amount.toLocaleString()}원</span>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
                                                {visibleItems.map((item) => {
                                                    const badgeClassName =
                                                        USAGE_SUMMARY_SOURCE_STYLES[item.sourceType] ||
                                                        "border-slate-200 bg-white text-slate-600";
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className="rounded-lg border border-[#FCEBEF] bg-[#FCF7F8] px-2.5 py-1.5 hover:bg-[#FCEBEF]/50 transition-colors"
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1 flex flex-col gap-1">
                                                                    <span className={`self-start rounded-full border px-1.5 py-0.5 text-[11px] font-bold shrink-0 ${badgeClassName}`}>
                                                                        {item.sourceLabel || "결제"}
                                                                    </span>
                                                                    <span className="text-[12px] font-semibold text-[#242424] break-words" title={item.itemName}>
                                                                        {item.itemName}
                                                                    </span>
                                                                </div>
                                                                {item.sourceType !== "ticket_usage" && (item.sourceType === "refund" || item.sourceType === "ticket_refund" ? (
                                                                    <div className="shrink-0 text-right">
                                                                        {item.paidAmount != null && (
                                                                            <div className="text-[11px] text-[#616161] tabular-nums">수납 {Math.max(0, Number(item.paidAmount || 0)).toLocaleString()}원</div>
                                                                        )}
                                                                        <div className="text-[12px] font-bold text-red-500 tabular-nums">환불 -{Math.max(0, Number(item.amount || 0)).toLocaleString()}원</div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#242424]">
                                                                        {Math.max(0, Number(item.amount || 0)).toLocaleString()}원
                                                                    </span>
                                                                ))}
                                                                {item.sourceType === "ticket_usage" && (
                                                                    <span className="shrink-0 text-[11px] font-bold text-[#D27A8C] tabular-nums">
                                                                        {item.usedRound ?? item.quantity}회차{item.totalCount ? `/${item.totalCount}회` : ""}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {item.sourceType === "ticket_new" && item.originalPrice != null && (
                                                                <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                                                                    <span className="text-[#616161]">정상가 {item.originalPrice.toLocaleString()}원</span>
                                                                    {item.eventPrice != null && item.eventPrice < item.originalPrice && (
                                                                        <span className="text-red-500 font-bold">이벤트가 {item.eventPrice.toLocaleString()}원</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {item.sourceType === "membership_new" && (
                                                                <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                                                                    {item.originalPrice != null && <span className="text-[#616161]">정가 {item.originalPrice.toLocaleString()}원</span>}
                                                                    {(item.bonusPoint ?? 0) > 0 && <span className="text-[#D27A8C] font-bold">+{item.bonusPoint?.toLocaleString()}P 적립</span>}
                                                                </div>
                                                            )}
                                                            {item.sourceType === "ticket_usage" && (
                                                                <div className="mt-0.5 text-[10px] text-[#616161]">
                                                                    {item.ticketType === "period" && item.expireDate && (
                                                                        <span>기간: ~{item.expireDate}</span>
                                                                    )}
                                                                    {item.ticketType === "package" && item.usedTreatments && (
                                                                        <span>{item.usedTreatments}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {item.sourceType === "membership_deduction" && (
                                                                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                                                                    <div className="text-[#616161]">차감금액: <span className="font-bold text-rose-600">{(item.usedCashAmount ?? 0).toLocaleString()}원</span></div>
                                                                    <div className="text-[#616161]">차감포인트: <span className="font-bold text-rose-600">{(item.usedPointAmount ?? 0).toLocaleString()}P</span></div>
                                                                    <div className="text-[#616161]">잔여금액: <span className="font-bold text-[#242424]">{(item.remainingCashAmount ?? 0).toLocaleString()}원</span></div>
                                                                    <div className="text-[#616161]">잔여포인트: <span className="font-bold text-[#D27A8C]">{(item.remainingPointAmount ?? 0).toLocaleString()}P</span></div>
                                                                </div>
                                                            )}
                                                            {(item.sourceType === "refund" || item.sourceType === "ticket_refund") && (item as any).refundDetails?.length > 0 && (
                                                                <div className="mt-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); setExpandedRefundId(prev => prev === item.id ? null : item.id); }}
                                                                        className="text-[10px] font-bold transition-all duration-200"
                                                                        style={{ color: "#D27A8C" }}
                                                                    >
                                                                        {expandedRefundId === item.id ? "접기 ▲" : "상세펼치기 ▼"}
                                                                    </button>
                                                                    {expandedRefundId === item.id && (
                                                                        <div className="mt-1 rounded-[6px] px-2 py-1.5 space-y-0.5" style={{ backgroundColor: "#FFF3F3", border: "1px solid #FFCDD2" }}>
                                                                            {((item as any).refundDetails as Array<{ paymentType: string; amount: number }>).map((detail, idx) => (
                                                                                <div key={idx} className="flex items-center justify-between text-[10px]">
                                                                                    <span style={{ color: "#616161" }}>{detail.paymentType}</span>
                                                                                    <span className="font-bold tabular-nums" style={{ color: "#E53935" }}>{detail.amount.toLocaleString()}원</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="mt-0.5 text-[10px] text-[#616161] pl-0.5">
                                                                {formatUsageSummaryTime(item.occurredAt)}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            <button
                                onClick={handleCheckoutClick}
                                disabled={cartItems.length === 0 || isReadOnly || !canEditPayment}
                                className={`w-full min-h-[40px] py-2.5 font-medium rounded-lg text-[13px] flex items-center justify-center gap-1.5 transition-all duration-200 ease-in-out ${cartItems.length === 0 || isReadOnly || !canEditPayment
                                    ? "bg-[#e0e0e0] text-[#616161] cursor-not-allowed"
                                    : "bg-[#D27A8C] hover:bg-[#8B3F50] active:bg-[#5C2A35] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)] hover:shadow-[0_6px_16px_rgba(226,107,124,0.25)]"
                                    }`}
                            >
                                <CreditCard className="w-3.5 h-3.5" /> 수납 추가
                            </button>

                        </div>
                    </div>
                </div>

                {/* Separator 2-3 */}
                {!isMobile && (
                    <div
                        className="w-1 shrink-0 cursor-col-resize hover:bg-[#D27A8C]/30 active:bg-[#D27A8C]/50 transition-colors"
                        onMouseDown={(e) => onSepMouseDown(2, e)}
                    />
                )}

                {/* [Column 4] Right Sidebar */}
                <div
                    className={`border-l border-[#F8DCE2] bg-white flex flex-col shrink-0 ${isMobile && activeMobileColumn !== "sidebar" ? "hidden" : ""}`}
                    style={{ width: isMobile ? "100%" : (colWidths[3] ?? 336) }}
                >
                    {/* Tabs */}
                    <div className="border-b border-[#F8DCE2] bg-[#FCF7F8] px-1.5 py-1.5">
                        {(() => {
                            const rightSidebarTabs = [
                                { id: "record", label: "환자기록", count: patientRecords.length },
                                { id: "reservation", label: "예약기록", count: customerReservations.length },
                                { id: "membership", label: "회원권", count: memberships.length },
                                { id: "ticket", label: "티켓 이력", count: tickets.filter((t) => !t.isRefunded && ((getTicketRemaining(t) ?? 1) > 0 || getTicketRemaining(t) === null)).length },
                                { id: "consent", label: "동의서", count: undefined },
                                { id: "refund", label: "결제/환불", count: paymentRecords.reduce((sum, r) => sum + (r.items || []).filter(it => {
                                    const s = String((it as any).status || r.status || "paid").trim().toLowerCase();
                                    if (s === "refunded" || s === "cancelled") return false;
                                    const isRePayment = ((it as any).paymentDetails ?? []).some(
                                        (pd: any) => pd?.memo && String(pd.memo).startsWith("위약금 재결제")
                                    );
                                    if (isRePayment) return false;
                                    return true;
                                }).length, 0) },
                            ];

                            return (
                                <div className="grid grid-cols-3 gap-1">
                        {rightSidebarTabs.map((tab) => {
                            const active = activeRightSidebarTab === (tab.id as any);
                            const colors = RIGHT_SIDEBAR_TAB_COLORS[tab.id] || { bg: "#F5F5F5", color: "#616161", activeBg: "#616161", border: "#E0E0E0" };
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveRightSidebarTab(tab.id as any)}
                                    className="group relative flex min-h-[28px] w-full items-center justify-between gap-1 rounded-[6px] px-2 py-1 text-left transition-all duration-200"
                                    style={{
                                        backgroundColor: active ? colors.activeBg : "#FFFFFF",
                                        border: `1px solid ${active ? colors.activeBg : "#FCEBEF"}`,
                                        boxShadow: active ? "0 2px 8px rgba(226,107,124,0.12)" : "none",
                                    }}
                                    onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = colors.bg; e.currentTarget.style.borderColor = colors.border; } }}
                                    onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = "#FFFFFF"; e.currentTarget.style.borderColor = "#FCEBEF"; } }}
                                >
                                    <span className="text-[12px] font-bold tracking-[0.1px] truncate" style={{ color: active ? "#FFFFFF" : colors.color }}>
                                        {tab.label}
                                    </span>
                                    {typeof tab.count === "number" && (
                                        <span className="shrink-0 rounded-full px-1.5 py-px text-[11px] font-extrabold tabular-nums" style={{
                                            backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.bg,
                                            color: active ? "#FFFFFF" : colors.color,
                                        }}>
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                                </div>
                            );
                        })()}
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 bg-white">
                        {/* Records */}
                        {activeRightSidebarTab === "record" && !canViewMemo && (
                            <div className="flex items-center justify-center py-10 text-sm text-[#616161]">권한이 없으므로 정보를 표시 할 수 없습니다.</div>
                        )}
                        {activeRightSidebarTab === "record" && canViewMemo && (
                            <div className="space-y-4">
                                {canEditMemo && (
                                <div className="flex items-center gap-2 mb-2">
                                    <input
                                        className="flex-1 bg-[#FCF7F8] border border-[#F8DCE2] rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-1 focus:ring-[#D27A8C]/20 transition-all"
                                        placeholder="메모 입력..."
                                        value={recordInput}
                                        onChange={(e) => setRecordInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleAddRecord();
                                            }
                                        }}
                                    />
                                    <button onClick={handleAddRecord} className="p-1.5 bg-[#D27A8C] text-white rounded-lg hover:bg-[#8B3F50] shadow-sm transition-colors">
                                        <Plus className="w-3 h-3" />
                                    </button>
                                </div>
                                )}

                                <div className="space-y-3">
                                    {sortedPatientRecords.length === 0 ? (
                                        <div className="text-center text-gray-400 text-[13px] py-4">기록이 없습니다.</div>
                                    ) : (
                                        sortedPatientRecords.map((rec) => (
                                            <div
                                                key={rec.id}
                                                className={`border rounded shadow-sm p-2 group relative ${
                                                    rec.isPinned
                                                        ? "bg-amber-50/40 border-amber-200"
                                                        : "bg-white"
                                                }`}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-[15px] text-gray-400">
                                                        {format(new Date(rec.createdAt), "yyyy-MM-dd HH:mm", { locale: ko })}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            className={`p-0.5 rounded transition ${
                                                                rec.isPinned
                                                                    ? "text-amber-500 hover:text-amber-600"
                                                                    : "text-gray-300 hover:text-amber-500 opacity-0 group-hover:opacity-100"
                                                            }`}
                                                            onClick={() => handleToggleRecordPinned(rec)}
                                                            title={rec.isPinned ? "고정 해제" : "기록 고정"}
                                                        >
                                                            <Pin className="w-3 h-3" />
                                                        </button>
                                                        <span className="text-[15px] font-bold text-[#D27A8C] bg-[#D27A8C]/10 px-1 rounded">
                                                            {rec.createdByName}
                                                        </span>
                                                        {!isReadOnly && (
                                                            <Trash
                                                                className="w-3 h-3 text-gray-300 cursor-pointer hover:text-red-500 opacity-0 group-hover:opacity-100"
                                                                onClick={() => handleRemoveRecord(rec.id)}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{rec.content}</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Reservation */}
                        {activeRightSidebarTab === "reservation" && (
                            <div className="space-y-3">
                                <div className="relative mb-1">
                                    <input
                                        type="text"
                                        value={reservationSearch}
                                        onChange={(e) => setReservationSearch(e.target.value)}
                                        placeholder="카테고리, 메모, 방문목적 검색..."
                                        className="w-full h-9 rounded-xl border border-[#F8DCE2] bg-white pl-8 pr-8 text-[12px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                    />
                                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C9A0A8]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                    {reservationSearch && (
                                        <button type="button" onClick={() => setReservationSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-full text-[#C9A0A8] hover:bg-[#FCEBEF] hover:text-[#8B3F50]">
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                                {customerReservations.length === 0 ? (
                                    <div className="text-center py-6 text-[13px]" style={{ color: "#616161" }}>예약 기록이 없습니다.</div>
                                ) : (
                                    customerReservations
                                        .filter((rsv: any) => {
                                            if (!reservationSearch.trim()) return true;
                                            const q = reservationSearch.trim().toLowerCase();
                                            const cat = String(rsv.reservCategoryName || "").toLowerCase();
                                            const memo = String(rsv.reservationMemo || "").toLowerCase();
                                            const purposes = (rsv.visitPurposes || []).map((vp: any) => String(vp.name || vp || "").toLowerCase()).join(" ");
                                            const dateStr = new Date(rsv.reservDateTime || rsv.reservDate).toLocaleDateString("ko-KR");
                                            return cat.includes(q) || memo.includes(q) || purposes.includes(q) || dateStr.includes(q);
                                        })
                                        .sort((a: any, b: any) => new Date(b.reservDateTime || b.reservDate).getTime() - new Date(a.reservDateTime || a.reservDate).getTime())
                                        .map((rsv: any) => {
                                            const rsvDate = new Date(rsv.reservDateTime || rsv.reservDate);
                                            const isCheckedIn = Boolean(rsv.isCheckedIn);
                                            const isFuture = rsvDate.getTime() > Date.now();
                                            return (
                                                <div key={rsv.id} className="rounded-[12px] border overflow-hidden transition-all duration-200 hover:shadow-[0_4px_12px_rgba(226,107,124,0.08)]" style={{ borderColor: "#F8DCE2" }}>
                                                    <div className="px-3 py-2.5 flex items-center justify-between" style={{ backgroundColor: "#FCF7F8", borderBottom: "1px solid #FCEBEF" }}>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[13px] font-bold" style={{ color: "#5C2A35" }}>
                                                                {format(rsvDate, "yyyy-MM-dd HH:mm", { locale: ko })}
                                                            </span>
                                                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{
                                                                backgroundColor: isCheckedIn ? "#E8F5E9" : isFuture ? "#FCEBEF" : "#FFF8E1",
                                                                color: isCheckedIn ? "#2E7D32" : isFuture ? "#D27A8C" : "#F57F17",
                                                                border: `1px solid ${isCheckedIn ? "#A5D6A7" : isFuture ? "#F8DCE2" : "#FFE082"}`,
                                                            }}>
                                                                {isCheckedIn ? "접수완료" : isFuture ? "예약대기" : "미접수"}
                                                            </span>
                                                        </div>
                                                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{
                                                            backgroundColor: rsv.reservType === "FIRST_VISIT" ? "#E3F2FD" : "#EDE7F6",
                                                            color: rsv.reservType === "FIRST_VISIT" ? "#1565C0" : "#6A1B9A",
                                                            border: `1px solid ${rsv.reservType === "FIRST_VISIT" ? "#90CAF9" : "#CE93D8"}`,
                                                        }}>
                                                            {rsv.reservType === "FIRST_VISIT" ? "초진" : "재진"}
                                                        </span>
                                                    </div>
                                                    <div className="px-3 py-2 space-y-1" style={{ backgroundColor: "#FFFFFF" }}>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold" style={{ backgroundColor: "#FCEBEF", color: "#D27A8C" }}>
                                                                {rsv.reservCategoryName || "미분류"}
                                                            </span>
                                                        </div>
                                                        {rsv.visitPurposes?.length > 0 && (
                                                            <div className="text-[11px]" style={{ color: "#616161" }}>
                                                                방문목적: {rsv.visitPurposes.map((vp: any) => vp.name || vp).join(", ")}
                                                            </div>
                                                        )}
                                                        {rsv.reservationMemo && (
                                                            <div className="text-[11px] rounded-[6px] px-2 py-1 mt-1" style={{ backgroundColor: "#FAF3F5", color: "#616161", border: "1px solid #FCEBEF" }}>
                                                                {rsv.reservationMemo}
                                                            </div>
                                                        )}
                                                        <button
                                                            onClick={() => setChangeHistoryReservId(rsv.id)}
                                                            className="mt-1.5 text-[10px] font-medium text-[#D27A8C] hover:underline"
                                                        >
                                                            수정이력 보기
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                )}
                            </div>
                        )}


                        {/* Ticket History */}
                        {activeRightSidebarTab === "ticket" && (
                            <div className="space-y-2">
                                {/* Pending Cart Tickets Section */}
                                {cartItems.filter(c => c.itemType === "ticket").length > 0 && (
                                    <div className="mb-3">
                                        <div className="text-[15px] font-bold text-orange-600 mb-2 flex items-center gap-1">
                                            <TicketIcon className="w-3 h-3" /> 결제 대기 중
                                        </div>
                                        <div className="space-y-2">
                                            {cartItems
                                                .filter(c => c.itemType === "ticket")
                                                .map((cartTicket) => (
                                                    <div key={`cart-${cartTicket.id}`} className="border border-orange-200 rounded bg-orange-50 p-2 text-[13px]">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="font-bold text-gray-700">{cartTicket.itemName}</span>
                                                            <span className="px-1.5 py-0.5 rounded text-[15px] font-bold bg-orange-100 text-orange-600">
                                                                결제대기
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-gray-500">
                                                            <span>수량: {cartTicket.quantity}개</span>
                                                            <span className="font-bold text-orange-600">{(cartTicket.unitPrice * cartTicket.quantity).toLocaleString()}원</span>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}

                                <div className="relative mb-2">
                                    <input
                                        type="text"
                                        value={ticketSearch}
                                        onChange={(e) => setTicketSearch(e.target.value)}
                                        placeholder="티켓명 검색 (예: 첫 시술, 윤곽, 토닝 ...)"
                                        className="w-full h-9 rounded-xl border border-[#F8DCE2] bg-white pl-8 pr-8 text-[12px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                    />
                                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C9A0A8]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <circle cx="11" cy="11" r="7" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    {ticketSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setTicketSearch("")}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-full text-[#C9A0A8] hover:bg-[#FCEBEF] hover:text-[#8B3F50]"
                                            title="검색어 지우기"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>

                                {(() => {
                                    const q = ticketSearch.trim().toLowerCase();
                                    const matchSearch = (t: typeof tickets[number]) =>
                                        !q || (t.itemName || "").toLowerCase().includes(q);
                                    const activeCount = tickets.filter((t) => !t.isRefunded && ((getTicketRemaining(t) ?? 1) > 0 || getTicketRemaining(t) === null) && matchSearch(t)).length;
                                    const completedCount = tickets.filter((t) => !t.isRefunded && getTicketRemaining(t) === 0 && matchSearch(t)).length;
                                    const refundedCount = tickets.filter((t) => t.isRefunded && matchSearch(t)).length;
                                    return (
                                        <div className="flex border border-[#F8DCE2] rounded-xl mb-2 overflow-hidden">
                                            <button
                                                className={`flex-1 py-1.5 text-[13px] font-semibold transition-colors ${ticketTab === "active" ? "bg-[#D27A8C]/10 text-[#D27A8C]" : "text-[#616161] hover:bg-[#FCF7F8]"}`}
                                                onClick={() => setTicketTab("active")}
                                            >
                                                사용가능 ({activeCount})
                                            </button>
                                            <button
                                                className={`flex-1 py-1.5 text-[13px] font-semibold transition-colors ${ticketTab === "completed" ? "bg-[#FCF7F8] text-[#242424]" : "text-[#616161] hover:bg-[#FCF7F8]"}`}
                                                onClick={() => setTicketTab("completed")}
                                            >
                                                사용완료 ({completedCount})
                                            </button>
                                            <button
                                                className={`flex-1 py-1.5 text-[13px] font-semibold transition-colors ${ticketTab === "refunded" ? "bg-rose-50 text-rose-600" : "text-[#616161] hover:bg-[#FCF7F8]"}`}
                                                onClick={() => setTicketTab("refunded")}
                                            >
                                                환불 ({refundedCount})
                                            </button>
                                        </div>
                                    );
                                })()}

                                <div className="space-y-2">
                                    {tickets
                                        .filter((t) => {
                                            if (ticketTab === "refunded") return !!t.isRefunded;
                                            if (t.isRefunded) return false;
                                            if (ticketTab === "active") return (getTicketRemaining(t) ?? 1) > 0 || getTicketRemaining(t) === null;
                                            return getTicketRemaining(t) === 0;
                                        })
                                        .filter((t) => !ticketSearch.trim() || (t.itemName || "").toLowerCase().includes(ticketSearch.trim().toLowerCase()))
                                        .map((t) => {
                                            const remain = getTicketRemaining(t);
                                            const used = getTicketUsed(t);
                                            const isTicketHistoryOpen = expandedTicketId === t.id;
                                            const isTicketHistoryLoading = ticketHistoryLoadingId === t.id;
                                            const ticketHistory = ticketHistoryByTicketId[t.id] || [];
                                            const statusText = t.isRefunded ? "환불됨" : remain === 0 ? "완료" : "사용가능";
                                            const statusClass = t.isRefunded
                                                ? "bg-rose-100 text-rose-600"
                                                : remain === 0
                                                    ? "bg-gray-100 text-gray-600"
                                                    : "bg-[#D27A8C]/15 text-[#D27A8C]";

                                            return (
                                                <div key={t.id} className={`border rounded-2xl p-2.5 text-[13px] transition-all duration-200 ease-in-out group ${t.isRefunded ? "border-rose-200 bg-rose-50/30" : "border-[#F8DCE2] bg-white hover:border-[#D27A8C]/30 hover:shadow-[0_4px_12px_rgba(226,107,124,0.08)]"}`}>
                                                    <div className="flex justify-between items-start gap-2 mb-1">
                                                        <span className={`font-semibold flex-1 min-w-0 break-words ${t.isRefunded ? "text-slate-400 line-through" : "text-[#242424]"}`}>{t.itemName}</span>
                                                        <span className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-bold tracking-[0.1px] ${statusClass}`}>{statusText}</span>
                                                    </div>

                                                    <div className="flex justify-between items-center text-gray-500 mb-1">
                                                        <span>
                                                            남은횟수:{" "}
                                                            <span className="text-[#D27A8C] font-bold">
                                                                {remain !== null ? `${remain}회` : "무제한"}
                                                            </span>
                                                        </span>
                                                        <span>{used}회 사용</span>
                                                    </div>

                                                    <div className="flex justify-between items-center text-[12px] text-gray-400 mb-2">
                                                        <span>
                                                            마지막 사용:{" "}
                                                            <span className="text-gray-600">
                                                                {t.lastUsedDate ? format(new Date(t.lastUsedDate), "yyyy-MM-dd", { locale: ko }) : "-"}
                                                            </span>
                                                        </span>
                                                        {t.minIntervalDays != null && t.minIntervalDays > 0 && (
                                                            <span>
                                                                다음 가능일:{" "}
                                                                <span className={(() => {
                                                                    if (!t.lastUsedDate) return "text-gray-600";
                                                                    const next = new Date(t.lastUsedDate);
                                                                    next.setDate(next.getDate() + (t.minIntervalDays || 0));
                                                                    return next > new Date() ? "text-red-500 font-semibold" : "text-emerald-600";
                                                                })()}>
                                                                    {t.lastUsedDate
                                                                        ? (() => {
                                                                            const next = new Date(t.lastUsedDate);
                                                                            next.setDate(next.getDate() + (t.minIntervalDays || 0));
                                                                            return format(next, "yyyy-MM-dd", { locale: ko });
                                                                        })()
                                                                        : "-"}
                                                                </span>
                                                            </span>
                                                        )}
                                                    </div>

                                                    {remain !== 0 && !isReadOnly && (
                                                        <div className="flex gap-1 mt-2">
                                                            <button
                                                                onClick={() => handleUseTicket(t)}
                                                                className="flex-1 bg-[#D27A8C] text-white rounded-lg py-1 hover:bg-[#8B3F50] font-bold text-[15px]"
                                                            >
                                                                사용하기
                                                            </button>
                                                        </div>
                                                    )}

                                                    <button
                                                        onClick={() => handleToggleTicketHistory(t.id)}
                                                        className="mt-2 w-full rounded-lg border border-[#F8DCE2] bg-[#FCF7F8] py-1 text-[15px] font-semibold text-[#616161] hover:bg-[#D27A8C]/5 hover:border-[#D27A8C]/30 transition-colors"
                                                    >
                                                        사용 이력 {isTicketHistoryOpen ? "접기" : "열기"}
                                                    </button>

                                                    {isTicketHistoryOpen && (
                                                        <div className="mt-2 space-y-1.5 rounded border border-slate-100 bg-slate-50/80 p-1.5">
                                                            {isTicketHistoryLoading ? (
                                                                <div className="py-2 text-center text-[14px] text-slate-400">이력 불러오는 중...</div>
                                                            ) : ticketHistory.length === 0 ? (
                                                                <div className="py-2 text-center text-[14px] text-slate-400">사용 이력이 없습니다.</div>
                                                            ) : (
                                                                ticketHistory.map((historyItem) => {
                                                                    const usedTreatments = parseUsedTreatments(historyItem.usedTreatmentsJson);
                                                                    const roundLabel = typeof historyItem.usedRound === "number" && historyItem.usedRound > 0
                                                                        ? `${historyItem.usedRound}회차`
                                                                        : "";
                                                                    const treatmentLabel = usedTreatments.length > 0
                                                                        ? usedTreatments.join(" + ")
                                                                        : "";
                                                                    const defaultLabel = historyItem.historyType === "NEW" ? "신규구매" : historyItem.historyType === "REFUND" ? "환불" : "사용";
                                                                    const usageLabel = roundLabel && treatmentLabel
                                                                        ? `${roundLabel} - ${treatmentLabel}`
                                                                        : (roundLabel || treatmentLabel || defaultLabel);
                                                                    const borderColor = historyItem.historyType === "NEW" ? "border-l-emerald-400" : historyItem.historyType === "REFUND" ? "border-l-red-400" : "border-l-blue-400";

                                                                    return (
                                                                        <div
                                                                            key={`ticket-history-${t.id}-${historyItem.id}`}
                                                                            className={`rounded bg-white px-2.5 py-2 text-[14px] border-l-2 ${borderColor} ${historyItem.isCancelled ? "opacity-60" : ""}`}
                                                                        >
                                                                            <div className="flex items-start justify-between gap-2">
                                                                                <div className="min-w-0">
                                                                                    <div className={`font-bold text-slate-700 ${historyItem.isCancelled ? "line-through" : ""}`}>
                                                                                        {usageLabel}
                                                                                        {historyItem.isCancelled && <span className="ml-1 text-red-500">(취소)</span>}
                                                                                    </div>
                                                                                    <div className="text-slate-500">
                                                                                        {format(new Date(historyItem.usedAt), "MM.dd HH:mm", { locale: ko })}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    <div className={`font-bold ${historyItem.isCancelled ? "line-through text-slate-400" : historyItem.historyType === "REFUND" ? "text-red-500" : historyItem.historyType === "NEW" ? "text-emerald-600" : "text-slate-700"}`}>
                                                                                        {historyItem.historyType === "NEW" ? "구매" : historyItem.historyType === "REFUND" ? "환불" : `-${historyItem.quantityUsed}회`}
                                                                                    </div>
                                                                                    <div className="text-slate-500">
                                                                                        잔여: {historyItem.remainingAfter}/{historyItem.maxUseCount}회
                                                                                    </div>
                                                                                    {/* 환불(REFUND) / 구매(NEW) 이력은 취소 불가 (이미 돈까지 환불 처리됨, 신규 구매는 결제 환불 흐름으로) */}
                                                                                    {!historyItem.isCancelled && historyItem.historyType !== "NEW" && historyItem.historyType !== "REFUND" && !isReadOnly && (
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                void handleCancelTicketHistory(t.id, historyItem.id);
                                                                                            }}
                                                                                            className="mt-1 rounded border border-gray-200 px-2 py-0.5 text-[15px] font-semibold text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                                                                        >
                                                                                            취소
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                    {tickets.length === 0 && cartItems.filter(c => c.itemType === "ticket").length === 0 && <div className="text-center text-gray-400 py-4 text-[13px]">구매한 티켓이 없습니다.</div>}
                                </div>
                            </div>
                        )}

                        {/* Membership Logs */}
                        {activeRightSidebarTab === "membership" && (
                            <div className="space-y-3">
                                <div className="relative mb-1">
                                    <input
                                        type="text"
                                        value={membershipSearch}
                                        onChange={(e) => setMembershipSearch(e.target.value)}
                                        placeholder="회원권명 검색..."
                                        className="w-full h-9 rounded-xl border border-[#F8DCE2] bg-white pl-8 pr-8 text-[12px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                    />
                                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C9A0A8]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                    {membershipSearch && (
                                        <button type="button" onClick={() => setMembershipSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-full text-[#C9A0A8] hover:bg-[#FCEBEF] hover:text-[#8B3F50]">
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center rounded-[8px] bg-[#FAF3F5] p-0.5 gap-0.5">
                                    <button
                                        onClick={() => { setMembershipFilter('active'); setExpandedMembershipId(null); }}
                                        className={`flex-1 rounded-[6px] px-3 py-1.5 text-[13px] font-medium tracking-[0.1px] transition-all duration-200 ${membershipFilter === 'active' ? 'bg-white text-[#D27A8C] shadow-sm border border-[#F8DCE2]' : 'text-[#616161] border border-transparent hover:text-[#242424]'}`}
                                    >
                                        사용중 ({memberships.filter(m => m.status === 'active').length})
                                    </button>
                                    <button
                                        onClick={() => { setMembershipFilter('completed'); setExpandedMembershipId(null); }}
                                        className={`flex-1 rounded-[6px] px-3 py-1.5 text-[13px] font-medium tracking-[0.1px] transition-all duration-200 ${membershipFilter === 'completed' ? 'bg-white text-[#D27A8C] shadow-sm border border-[#F8DCE2]' : 'text-[#616161] border border-transparent hover:text-[#242424]'}`}
                                    >
                                        사용완료 ({memberships.filter(m => m.status !== 'active').length})
                                    </button>
                                </div>

                                {(() => {
                                    const filtered = memberships
                                        .filter(m => membershipFilter === 'active' ? m.status === 'active' : m.status !== 'active')
                                        .filter(m => {
                                            if (!membershipSearch.trim()) return true;
                                            return String(m.membershipName || "").toLowerCase().includes(membershipSearch.trim().toLowerCase());
                                        });
                                    if (filtered.length === 0) return (
                                        <div className="text-center text-[#616161] text-[13px] py-6">
                                            {membershipFilter === 'active' ? '사용중인 회원권이 없습니다.' : '사용완료 회원권이 없습니다.'}
                                        </div>
                                    );
                                    return filtered.map((m) => (
                                        <div
                                            key={m.id}
                                            className={`rounded-[12px] border bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(226,107,124,0.08)] ${m.status === 'active' ? 'border-[#F8DCE2]' : 'border-[#E0E0E0]'}`}
                                        >
                                            <div
                                                className={`flex items-center justify-between gap-2 px-4 py-3 border-b cursor-pointer select-none ${m.status === 'active' ? 'bg-[#FCF7F8] border-[#F8DCE2]' : 'bg-[#FAFAFA] border-[#E0E0E0]'}`}
                                                onClick={() => handleToggleMembershipHistory(m.id)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className={`text-[15px] font-bold leading-[1.2] truncate ${m.status === 'active' ? 'text-[#5C2A35]' : 'text-[#616161]'}`}>{m.membershipName}</span>
                                                    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium tracking-[0.1px] ${m.status === 'active' ? 'bg-[#FCEBEF] text-[#D27A8C]' : 'bg-[#F0F0F0] text-[#616161]'}`}>
                                                        {m.status === 'active' ? '사용중' : m.status === 'expired' ? '만료' : m.status === 'refunded' ? '환불' : '완료'}
                                                    </span>
                                                </div>
                                                <div className="shrink-0 text-[#616161]">
                                                    {expandedMembershipId === m.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                </div>
                                            </div>

                                            <div className={`px-4 py-3 space-y-3 ${m.status !== 'active' ? 'opacity-70' : ''}`}>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[13px] text-[#616161]">
                                                        {m.purchaseDate ? `${format(new Date(m.purchaseDate), "yyyy-MM-dd", { locale: ko })} 구매` : "구매일 미상"}
                                                    </span>
                                                    <span className="inline-flex items-center rounded-[8px] border border-[#F8DCE2] bg-[#FCEBEF] px-2 py-0.5 text-[12px] font-medium text-[#D27A8C]">
                                                        {m.discountPercent}% 할인
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="rounded-[8px] bg-[#FAF3F5] px-3 py-2 border-l-[3px] border-l-[#5C2A35]">
                                                        <div className="text-[12px] font-medium text-[#616161] tracking-[0.1px] mb-0.5">현금 잔액</div>
                                                        <div className="text-[16px] font-bold text-[#5C2A35] tabular-nums leading-[1.2]">
                                                            {((m as any).cashBalance ?? m.remainingBalance ?? m.amount).toLocaleString()}<span className="text-[13px] font-medium ml-0.5">원</span>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-[8px] bg-[#FAF3F5] px-3 py-2 border-l-[3px] border-l-[#F49EAF]">
                                                        <div className="text-[12px] font-medium text-[#616161] tracking-[0.1px] mb-0.5">포인트 잔액</div>
                                                        <div className="text-[16px] font-bold text-[#F49EAF] tabular-nums leading-[1.2]">
                                                            {((m as any).pointBalance ?? 0).toLocaleString()}<span className="text-[13px] font-medium ml-0.5">P</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {m.expiryDate && (
                                                    <div className="text-[13px] text-[#616161] text-right">
                                                        유효기간 {format(new Date(m.expiryDate), "yyyy-MM-dd", { locale: ko })}
                                                    </div>
                                                )}
                                            </div>

                                            {expandedMembershipId === m.id && (
                                                <div className="border-t border-[#F8DCE2] bg-[#FAF3F5] px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    <div className="text-[15px] font-semibold text-[#5C2A35] tracking-[0.1px] mb-2">사용/충전 이력</div>
                                                    {membershipHistory.length === 0 ? (
                                                        <div className="py-2 text-[14px] text-[#616161]">이력이 없습니다.</div>
                                                    ) : (
                                                        <div className="space-y-1.5">
                                                            {membershipHistory.map((h) => {
                                                                const isCharge = h.historyType === '신규' || h.historyType === 'NEW';
                                                                const isUse = h.historyType === 'USE';
                                                                const isRefund = h.historyType === 'REFUND' || h.historyType === '환불';
                                                                const borderColor = h.isCancelled ? 'opacity-50 border-[#E0E0E0]'
                                                                    : isCharge ? 'border-l-[3px] border-l-[#43A047] border-t-[#F8DCE2] border-r-[#F8DCE2] border-b-[#F8DCE2]'
                                                                    : isRefund ? 'border-l-[3px] border-l-amber-400 border-t-[#F8DCE2] border-r-[#F8DCE2] border-b-[#F8DCE2]'
                                                                    : 'border-l-[3px] border-l-rose-400 border-t-[#F8DCE2] border-r-[#F8DCE2] border-b-[#F8DCE2]';
                                                                const badgeStyle = h.isCancelled ? 'bg-[#F0F0F0] text-[#616161]'
                                                                    : isCharge ? 'bg-emerald-50 text-emerald-700'
                                                                    : isRefund ? 'bg-amber-50 text-amber-700'
                                                                    : 'bg-rose-50 text-rose-600';
                                                                return (
                                                                    <div
                                                                        key={h.id}
                                                                        className={`rounded-[8px] border bg-white p-2.5 transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(226,107,124,0.08)] ${borderColor}`}
                                                                    >
                                                                        {isRefund && !h.isCancelled && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setRefundDetailModalHistId(h.id)}
                                                                                className="float-right ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors"
                                                                                title="환불 상세 내역 보기"
                                                                            >
                                                                                상세
                                                                            </button>
                                                                        )}
                                                                        <div className="flex items-start justify-between gap-2">
                                                                            <div className="min-w-0 flex-1">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <span className={`inline-flex items-center rounded-[4px] px-1.5 py-px text-[12px] font-bold tracking-[0.1px] ${badgeStyle}`}>
                                                                                        {isCharge ? '충전' : isUse ? '차감' : isRefund ? '환불' : h.description}
                                                                                    </span>
                                                                                    {h.isCancelled && (
                                                                                        <span className="inline-flex rounded-[4px] bg-red-50 border border-red-200 px-1.5 py-px text-[12px] font-medium text-red-600">
                                                                                            취소됨
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {(isUse || isRefund) && (
                                                                                    h.ticketName ? (
                                                                                        <>
                                                                                            <div className="text-[14px] text-[#242424] font-semibold mt-1 break-words" title={h.ticketName}>
                                                                                                {isRefund && <span className="text-[11px] text-amber-700 font-bold mr-1">[티켓 환불]</span>}
                                                                                                {h.ticketName}
                                                                                            </div>
                                                                                            {isUse && h.ticketMaxUseCount != null && (
                                                                                                <div className="mt-0.5 text-[11px]">
                                                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-px text-emerald-700 font-bold">
                                                                                                        시술 진행 {h.ticketUsedCount ?? 0}/{h.ticketMaxUseCount}회
                                                                                                    </span>
                                                                                                    {(h.ticketRemainingCount ?? 0) === 0 && (
                                                                                                        <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-1.5 py-px text-slate-600 font-bold">
                                                                                                            사용완료
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                            )}
                                                                                            {isUse && h.ticketMaxUseCount == null && h.ticketUsedCount != null && (
                                                                                                <div className="mt-0.5 text-[11px]">
                                                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-px text-emerald-700 font-bold">
                                                                                                        시술 {h.ticketUsedCount}회 진행 (기간권)
                                                                                                    </span>
                                                                                                </div>
                                                                                            )}
                                                                                        </>
                                                                                    ) : isRefund ? (
                                                                                        <div className="text-[14px] text-[#242424] font-semibold mt-1">
                                                                                            <span className="text-[11px] text-amber-700 font-bold mr-1">[회원권 잔액 환불]</span>
                                                                                        </div>
                                                                                    ) : null
                                                                                )}
                                                                                <div className="text-[13px] text-[#616161] mt-1">
                                                                                    {format(new Date(h.usedAt), "MM.dd HH:mm", { locale: ko })}
                                                                                </div>
                                                                            </div>
                                                                            <div className="shrink-0 text-right space-y-0.5">
                                                                                {(h.usedCashAmount ?? h.usedAmount) > 0 && (
                                                                                    <div className={`text-[14px] font-bold tabular-nums ${h.isCancelled ? 'text-[#616161] line-through' : isCharge ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                                                        {isCharge ? '+' : '-'}{(h.usedCashAmount ?? h.usedAmount).toLocaleString()}<span className="text-[12px] font-medium ml-0.5">원</span>
                                                                                    </div>
                                                                                )}
                                                                                {(h.usedPointAmount ?? 0) > 0 && (
                                                                                    <div className={`text-[14px] font-bold tabular-nums ${h.isCancelled ? 'text-[#616161] line-through' : isCharge ? 'text-emerald-700' : 'text-[#D27A8C]'}`}>
                                                                                        {isCharge ? '+' : '-'}{(h.usedPointAmount ?? 0).toLocaleString()}<span className="text-[12px] font-medium ml-0.5">P</span>
                                                                                    </div>
                                                                                )}
                                                                                <div className="flex items-center justify-end gap-1.5 text-[12px] tabular-nums mt-0.5">
                                                                                    {(h.usedCashAmount ?? h.usedAmount) > 0 && (
                                                                                        <span className="text-[#5C2A35]">{(h.remainingCashBalance ?? h.remainingBalance).toLocaleString()}원</span>
                                                                                    )}
                                                                                    {(h.usedCashAmount ?? h.usedAmount) > 0 && (h.usedPointAmount ?? 0) > 0 && (
                                                                                        <span className="text-[#F8DCE2]">/</span>
                                                                                    )}
                                                                                    {(h.usedPointAmount ?? 0) > 0 && (
                                                                                        <span className="text-[#F49EAF]">{(h.remainingPointBalance ?? 0).toLocaleString()}P</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}

                        {/* Consent */}
                        {activeRightSidebarTab === "consent" && (
                            <div className="space-y-4">
                                <div className="relative mb-1">
                                    <input
                                        type="text"
                                        value={consentSearch}
                                        onChange={(e) => setConsentSearch(e.target.value)}
                                        placeholder="동의서명, 상태 검색..."
                                        className="w-full h-9 rounded-xl border border-[#F8DCE2] bg-white pl-8 pr-8 text-[12px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                    />
                                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C9A0A8]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                    {consentSearch && (
                                        <button type="button" onClick={() => setConsentSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-full text-[#C9A0A8] hover:bg-[#FCEBEF] hover:text-[#8B3F50]">
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                                <div className="rounded-xl border border-[#F8DCE2] bg-[#FCF7F8] overflow-hidden">
                                    <div className="px-4 py-3 border-b border-[#F8DCE2]">
                                        <div className="text-[13px] font-semibold text-[#5C2A35]">동의서 발송</div>
                                    </div>
                                    <div className="p-4">
                                        <button
                                            onClick={() => setIsConsentSendModalOpen(true)}
                                            className="w-full py-2.5 bg-[#D27A8C] hover:bg-[#8B3F50] text-white rounded-lg text-[13px] font-medium tracking-[0.1px] transition-all duration-200 flex items-center justify-center gap-1.5"
                                        >
                                            <Plus className="w-4 h-4" />
                                            새 동의서 요청
                                        </button>
                                    </div>
                                </div>

                                <ConsentHistoryList
                                    patientId={Number(patient.id)}
                                    branchId={String(settings.activeBranchId || "1")}
                                    searchQuery={consentSearch}
                                />
                            </div>
                        )}

                        {/* Refund */}
                        {activeRightSidebarTab === "refund" && (
                            <>
                            <div className="relative mb-2">
                                <input
                                    type="text"
                                    value={refundSearch}
                                    onChange={(e) => setRefundSearch(e.target.value)}
                                    placeholder="티켓명, 결제수단, 날짜 검색..."
                                    className="w-full h-9 rounded-xl border border-[#F8DCE2] bg-white pl-8 pr-8 text-[12px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                />
                                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C9A0A8]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                {refundSearch && (
                                    <button type="button" onClick={() => setRefundSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-full text-[#C9A0A8] hover:bg-[#FCEBEF] hover:text-[#8B3F50]">
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                            <RefundHistoryList
                                patientId={Number(patientIdStr)}
                                paymentRecords={paymentRecords}
                                tickets={tickets}
                                memberships={memberships}
                                refundingPaymentId={refundingPaymentId}
                                onRefund={canEditPayment ? handleRefundPaymentRecord : undefined}
                                onRefundGroup={canEditPayment ? handleRefundPaymentGroup : undefined}
                                onRefundCompleted={() => loadPersistenceData(Number(patientIdStr))}
                                isReadOnly={isReadOnly || !canEditPayment}
                                searchQuery={refundSearch}
                            />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {isMobile && (
                <div
                    className="shrink-0 grid grid-cols-4 border-t border-[#F8DCE2] bg-white"
                    style={{ boxShadow: "0 -4px 14px rgba(226,107,124,0.10)" }}
                >
                    {([
                        { key: "visits" as const, label: "내원이력", Icon: ClipboardList },
                        { key: "chart" as const, label: "차트", Icon: FileText },
                        { key: "ticket" as const, label: "티켓", Icon: TicketIcon },
                        { key: "sidebar" as const, label: "환자기록", Icon: User },
                    ]).map((tab) => {
                        const active = activeMobileColumn === tab.key;
                        const IconComp = tab.Icon;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveMobileColumn(tab.key)}
                                className="flex flex-col items-center justify-center gap-1 py-2 transition-all"
                                style={{
                                    background: active ? "linear-gradient(180deg, #FCEBEF 0%, #FFFFFF 100%)" : "transparent",
                                    borderTop: active ? "2px solid #D27A8C" : "2px solid transparent",
                                }}
                            >
                                <IconComp
                                    className="w-5 h-5"
                                    strokeWidth={active ? 2.4 : 1.8}
                                    style={{ color: active ? "#D27A8C" : "#7C6066" }}
                                />
                                <span
                                    className="text-[10px] font-bold tracking-[0.1px]"
                                    style={{ color: active ? "#8B3F50" : "#7C6066" }}
                                >
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            {/* Modals */}
            {isMemoSectionSettingsOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-3xl rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(226,107,124,0.18)]">
                        <div className="flex items-start justify-between px-7 pt-7 pb-4 border-b border-[#F8DCE2] bg-[#FCF7F8] rounded-t-2xl">
                            <div>
                                <div className="text-xl font-bold text-[#5C2A35] leading-none">차트 메모 항목명 설정</div>
                                <p className="mt-2 text-[12px] text-[#616161]">기본 3개 항목명을 병원에 맞게 변경하고 내원이력 노출 여부를 설정합니다.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsMemoSectionSettingsOpen(false)}
                                className="mt-1 rounded-lg p-1.5 text-[#616161] hover:text-[#5C2A35] hover:bg-[#FCEBEF] transition-all duration-200"
                                title="닫기"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-5 px-7 py-6">
                            {memoSections.map((section, idx) => (
                                <div key={`memo-setting-${section.id}`} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-base font-bold text-[#5C2A35]">{idx + 1}열 항목명</label>
                                        <label className="inline-flex items-center gap-2 text-[12px] text-[#616161]">
                                            <input
                                                type="checkbox"
                                                checked={memoSectionHistoryVisibilityDraft[section.id] !== false}
                                                onChange={(e) =>
                                                    setMemoSectionHistoryVisibilityDraft((prev) => ({
                                                        ...prev,
                                                        [section.id]: e.target.checked,
                                                    }))
                                                }
                                                className="h-4 w-4 rounded border-[#F8DCE2] text-[#D27A8C] focus:ring-[#FCEBEF]"
                                            />
                                            내원이력 노출
                                        </label>
                                    </div>
                                    <input
                                        value={memoSectionLabelDraft[section.id] ?? section.label}
                                        onChange={(e) =>
                                            setMemoSectionLabelDraft((prev) => ({
                                                ...prev,
                                                [section.id]: e.target.value,
                                            }))
                                        }
                                        className="w-full h-12 rounded-lg border border-[#F8DCE2] bg-[#FCEBEF]/30 px-4 text-base font-medium text-[#242424] outline-none focus:border-[#F49EAF] focus:ring-2 focus:ring-[#FCEBEF] transition-all duration-200"
                                        placeholder={`${idx + 1}열 항목명을 입력하세요`}
                                    />
                                </div>
                            ))}
                            <div className="rounded-lg border border-[#F8DCE2] bg-[#FCEBEF]/50 px-4 py-3 text-[10px] text-[#D27A8C]">
                                진료기록 카드는 항상 표시됩니다.
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 px-7 py-5 border-t border-[#F8DCE2]">
                            <button
                                type="button"
                                onClick={() => setIsMemoSectionSettingsOpen(false)}
                                className="min-h-[40px] rounded-lg border border-[#F8DCE2] bg-white px-6 text-[12px] font-medium text-[#616161] hover:bg-[#FCEBEF] transition-all duration-200"
                                disabled={memoSectionSaving}
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveMemoSectionSettings}
                                className="min-h-[40px] rounded-lg bg-[#D27A8C] px-6 text-[12px] font-medium text-white hover:bg-[#8B3F50] shadow-[0_4px_12px_rgba(226,107,124,0.18)] transition-all duration-200 disabled:opacity-50"
                                disabled={memoSectionSaving}
                            >
                                {memoSectionSaving ? "저장중..." : "저장"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isReservationHistoryModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4">
                    <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">예약 변경 이력</h3>
                                <div className="text-xs text-gray-500">예약 no. {selectedReservationVisit?.id || "-"}</div>
                            </div>
                            <button
                                onClick={() => setIsReservationHistoryModalOpen(false)}
                                className="p-2 text-gray-400 hover:bg-gray-100 rounded-full"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="max-h-[calc(80vh-80px)] overflow-y-auto p-4 space-y-3">
                            {isReservationHistoryLoading && (
                                <div className="py-10 text-center text-sm text-gray-500">이력을 불러오는 중입니다...</div>
                            )}

                            {!isReservationHistoryLoading && reservationHistoryError && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                                    {reservationHistoryError}
                                </div>
                            )}

                            {!isReservationHistoryLoading && !reservationHistoryError && reservationHistoryItems.length === 0 && (
                                <div className="py-10 text-center text-sm text-gray-500">변경 이력이 없습니다.</div>
                            )}

                            {!isReservationHistoryLoading && !reservationHistoryError && reservationHistoryItems.map((item) => {
                                const actionKey = String(item.actionType || "").toLowerCase();
                                const actionLabel = RESERVATION_ACTION_LABEL[actionKey] || item.actionType || "수정";
                                const actorRaw = String(item.changedBy || "").trim();
                                const actorLabel = !actorRaw || actorRaw.toLowerCase() === "system" ? "시스템" : actorRaw;

                                return (
                                    <div key={item.id} className="rounded-xl border border-gray-200 bg-gray-50/40 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className="rounded-full bg-[#D27A8C]/15 px-2 py-0.5 text-[10px] font-bold text-[#D27A8C]">
                                                    {actionLabel}
                                                </span>
                                                {item.isNoShow ? (
                                                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                                        노쇼
                                                    </span>
                                                ) : null}
                                            </div>
                                            <span className="text-xs text-gray-500">{formatHistoryDateTime(item.changedAt)}</span>
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500">변경자: {actorLabel}</div>

                                        {item.cancelReason && (
                                            <div className="mt-2 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-600">
                                                취소 사유: {item.cancelReason}
                                            </div>
                                        )}

                                        {item.changes?.length > 0 ? (
                                            <div className="mt-3 space-y-1.5">
                                                {item.changes.map((change, idx) => {
                                                    const fieldKey = normalizeHistoryFieldKey(change.field);
                                                    const fieldLabel = RESERVATION_FIELD_LABEL[fieldKey] || change.field;
                                                    const beforeText = formatReservationHistoryValue(
                                                        change.field,
                                                        change.before,
                                                        reservationCategoryNameById,
                                                        reservationMemberNameById
                                                    );
                                                    const afterText = formatReservationHistoryValue(
                                                        change.field,
                                                        change.after,
                                                        reservationCategoryNameById,
                                                        reservationMemberNameById
                                                    );

                                                    return (
                                                        <div key={`${item.id}-${change.field}-${idx}`} className="grid grid-cols-[92px_1fr] gap-2 text-xs">
                                                            <div className="pt-0.5 text-gray-500">{fieldLabel}</div>
                                                            <div className="space-y-0.5">
                                                                <div className="text-gray-400 line-through whitespace-pre-line break-words">{beforeText}</div>
                                                                <div className="font-medium text-gray-800 whitespace-pre-line break-words">{afterText}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="mt-2 text-xs text-gray-400">세부 변경 항목이 없습니다.</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {
                showReceptionModal && patient && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1500px] max-h-[85vh] flex flex-col overflow-hidden border border-[#F8DCE2]">
                            <ReceptionForm
                                patient={patient as any}
                                onClose={() => setShowReceptionModal(false)}
                                onConfirm={handleReceptionSubmit}
                                onQuickAction={async (data) => {
                                    if (!patient) return;
                                    const customerId = Number(patient.id || 0);
                                    if (!Number.isFinite(customerId) || customerId <= 0) {
                                        showAlert({ message: "빠른 차감 대상이 아닙니다.", type: "warning" });
                                        return;
                                    }
                                    try {
                                        const ownedTickets = await ticketService.getTickets(customerId);
                                        const branchId = String(settings.activeBranchId || "1");
                                        const dateISO = new Date().toISOString().slice(0, 10);
                                        const ticketDefs = settings.tickets?.items || [];
                                        const options = await fetchQuickTicketOptions(ownedTickets || [], ticketDefs, branchId, dateISO);
                                        if (options.length === 0) {
                                            showAlert({ message: "빠른 차감 대상이 아닙니다. (잔여 시술권 없음)", type: "warning" });
                                            return;
                                        }
                                        setQuickTicketPickerData({ tickets: options, receptionData: data });
                                    } catch (e) {
                                        console.error("ticket check failed", e);
                                        showAlert({ message: "시술권 조회에 실패했습니다.", type: "error" });
                                    }
                                }}
                            />
                        </div>
                    </div>
                )
            }

            {quickTicketPickerData && (
                <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/35 backdrop-blur-[1px] p-4">
                    <div className="w-full max-w-[620px] max-h-[80vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <div>
                                <div className="text-base font-bold text-slate-900">차감할 시술권 선택</div>
                                <div className="mt-0.5 text-xs text-slate-500">차감할 시술권을 선택해 주세요.</div>
                            </div>
                            <button type="button" onClick={() => setQuickTicketPickerData(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="닫기">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="max-h-[52vh] overflow-y-auto px-5 py-4 space-y-2.5">
                            {quickTicketPickerData.tickets.map((option: QuickTicketOption) => {
                                const allowOverride = canOverrideCycleBlock(option);
                                const disabled = option.remaining <= 0 || (option.cycleBlocked && !allowOverride);
                                const selected = (quickTicketPickerData._selectedIds || []).includes(option.ticketId);
                                return (
                                    <button
                                        key={`qt-${option.ticketId}`}
                                        type="button"
                                        disabled={quickTicketBusy || disabled}
                                        onClick={() => {
                                            if (disabled) return;
                                            setQuickTicketPickerData((prev: any) => {
                                                if (!prev) return prev;
                                                const ids: string[] = prev._selectedIds || [];
                                                const next = ids.includes(option.ticketId)
                                                    ? ids.filter((id: string) => id !== option.ticketId)
                                                    : [...ids, option.ticketId];
                                                return { ...prev, _selectedIds: next };
                                            });
                                        }}
                                        className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${disabled ? "cursor-not-allowed border-red-200 bg-red-50/50 text-slate-400 opacity-70" : selected ? "border-[#D27A8C] bg-[#FCEBEF] ring-1 ring-[#D27A8C]/30" : allowOverride ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${disabled ? "border-gray-300 bg-gray-200" : selected ? "border-[#D27A8C] bg-[#D27A8C] text-white" : "border-gray-300 bg-white"}`}>
                                                {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <TicketIcon className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate text-sm font-semibold">{option.ticketName}</span>
                                                    {option.isPeriod && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">주기권</span>}
                                                    {option.isPackage && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">패키지</span>}
                                                </div>
                                                <div className={`mt-1 text-[11px] leading-relaxed ${disabled ? "text-red-500 font-medium" : "text-slate-500"}`}>
                                                    {disabled ? `⛔ ${option.cycleBlockReason || "지금은 사용할 수 없습니다."}` : "선택하여 차감"}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="text-sm font-bold text-slate-800">잔여 {option.remaining}회</div>
                                                {option.nextAvailableAt && <div className="mt-1 text-[10px] text-amber-600">다음 가능: {option.nextAvailableAt}</div>}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50">
                            <button type="button" onClick={() => setQuickTicketPickerData(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">취소</button>
                            <button
                                type="button"
                                disabled={quickTicketBusy || !(quickTicketPickerData._selectedIds?.length)}
                                onClick={async () => {
                                    const selectedOptions = quickTicketPickerData.tickets.filter((o: QuickTicketOption) => (quickTicketPickerData._selectedIds || []).includes(o.ticketId));
                                    if (selectedOptions.length === 0) return;
                                    setQuickTicketBusy(true);
                                    try {
                                        await handleReceptionSubmit(quickTicketPickerData.receptionData);
                                        for (const option of selectedOptions) {
                                            await ticketService.useTicket(option.ticketId, option.isPeriod);
                                        }
                                        setQuickTicketPickerData(null);
                                        setShowReceptionModal(false);
                                        showAlert({ message: `${selectedOptions.length}건 차감 및 접수가 완료되었습니다.`, type: "success" });
                                        await refreshChartData();
                                    } catch (e: any) {
                                        console.error("quick ticket deduct failed", e);
                                        showAlert({ message: e?.response?.data?.message || e?.message || "처리에 실패했습니다.", type: "error" });
                                    } finally {
                                        setQuickTicketBusy(false);
                                    }
                                }}
                                className="rounded-lg bg-[#D27A8C] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#8B3F50] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                차감하기 ({quickTicketPickerData._selectedIds?.length || 0}건)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PatientSearchModal
                isOpen={showVisitCreationModal}
                onClose={() => setShowVisitCreationModal(false)}
                onSelectPatient={(p: any) => {
                    handleCreateVisit({ patientId: p.id });
                }}
            />

            {
                showPaymentModal && (
                    <AddPaymentModal
                        isOpen={showPaymentModal}
                        onClose={() => setShowPaymentModal(false)}
                        onAddPayment={handleAddPayment}
                        totalAmount={Math.max(0, cartPreview?.totalCashRequired ?? remaining)}
                    />
                )
            }

            <ReservationChangeHistoryModal
                isOpen={changeHistoryReservId !== null}
                reservationId={changeHistoryReservId ?? 0}
                onClose={() => setChangeHistoryReservId(null)}
            />

            {patient && (
                <ConsentSendModal
                    isOpen={isConsentSendModalOpen}
                    onClose={() => {
                        setIsConsentSendModalOpen(false);
                        if (activeRightSidebarTab === "consent") {
                            setActiveRightSidebarTab("record");
                            setTimeout(() => setActiveRightSidebarTab("consent"), 100);
                        }
                    }}
                    patient={patient}
                    branchId={settings.activeBranchId || "1"}
                    templates={consentTemplates}
                />
            )}

            {patient && (
                <DocumentIssuanceModal
                    isOpen={isDocumentModalOpen}
                    onClose={() => setIsDocumentModalOpen(false)}
                    patient={patient}
                    visits={visits}
                    paymentRecords={paymentRecords}
                    hospital={settings.hospital}
                />
            )}

            <RefundDetailModal
                open={refundDetailModalHistId !== null}
                membershipHistId={refundDetailModalHistId}
                onClose={() => setRefundDetailModalHistId(null)}
            />

            {refundModal && (
                <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(92,42,53,0.18)" }}>
                    <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-[16px] border bg-white" style={{ borderColor: "#F8DCE2", boxShadow: "0 30px 80px rgba(226,107,124,0.18)" }}>
                        <div className="px-6 py-5 border-b" style={{ backgroundColor: "#FCF7F8", borderColor: "#FCEBEF" }}>
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-[18px] font-bold leading-[1.2]" style={{ color: "#5C2A35" }}>
                                        {refundModal.mode === "group" ? "묶음 환불 설정" : "개별 환불 설정"}
                                    </h3>
                                    {refundModal.mode === "group" && (
                                        <p className="mt-1 text-[13px] font-medium" style={{ color: "#616161" }}>
                                            {`${refundModal.records.length}건의 결제건을 한 번에 환불합니다.`}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={closeRefundModal}
                                    disabled={refundModal.isSubmitting}
                                    className="rounded-[8px] p-2 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                                    style={{ color: "#616161" }}
                                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#FCEBEF"; e.currentTarget.style.color = "#5C2A35"; }}
                                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#616161"; }}
                                    title="닫기"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-0 md:grid-cols-[1.15fr_0.85fr]">
                            <div className="space-y-5 px-6 py-5">
                                <div>
                                    <div className="mb-2 text-[13px] font-bold" style={{ color: "#5C2A35" }}>환불 기준</div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {[
                                            {
                                                value: "customer" as RefundResponsibilityType,
                                                title: "위약금/정상가 차감",
                                                description: "결제금액 기준 10% 위약금을 차감합니다.",
                                            },
                                            {
                                                value: "hospital" as RefundResponsibilityType,
                                                title: "n/1 차감",
                                                description: "위약금 없이 사용분만 차감합니다.",
                                            },
                                        ].map((option) => {
                                            const active = refundModal.responsibilityType === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() =>
                                                        setRefundModal((prev) => prev ? { ...prev, responsibilityType: option.value } : prev)
                                                    }
                                                    disabled={refundModal.isSubmitting}
                                                    className="rounded-[12px] border px-4 py-3 text-left transition-all duration-200"
                                                    style={{
                                                        borderColor: active ? "#D27A8C" : "#F8DCE2",
                                                        backgroundColor: active ? "#FCEBEF" : "#FFFFFF",
                                                        boxShadow: active ? "0 0 0 2px rgba(226,107,124,0.15)" : "none",
                                                    }}
                                                    onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = "#FCF7F8"; e.currentTarget.style.borderColor = "#E5B5C0"; } }}
                                                    onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = "#FFFFFF"; e.currentTarget.style.borderColor = "#F8DCE2"; } }}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="text-[14px] font-bold" style={{ color: "#242424" }}>{option.title}</div>
                                                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border" style={{
                                                            borderColor: active ? "#D27A8C" : "#F8DCE2",
                                                            backgroundColor: active ? "#D27A8C" : "transparent",
                                                        }}>
                                                            {active ? <Check className="h-3.5 w-3.5" style={{ color: "#FFFFFF" }} /> : null}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#616161" }}>{option.description}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {refundModal.mode === "single" && (
                                    <div>
                                        <label className="mb-2 block text-[13px] font-bold" style={{ color: "#5C2A35" }}>사용 차감액</label>
                                        <div className="rounded-[12px] border px-4 py-3" style={{ borderColor: "#F8DCE2", backgroundColor: "#FAF3F5" }}>
                                            <div className="mb-2 text-[11px] font-semibold" style={{ color: "#616161" }}>
                                                자동 계산값 {(refundModalMatchedItem?.usedAmountAtOriginalPrice ?? refundModal.checks[0]?.autoUsedAmount ?? 0).toLocaleString()}원
                                            </div>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={refundModal.manualUsedAmount}
                                                onChange={(e) =>
                                                    setRefundModal((prev) => prev ? { ...prev, manualUsedAmount: e.target.value } : prev)
                                                }
                                                disabled={refundModal.isSubmitting}
                                                placeholder="자동 계산값 그대로 사용하려면 그대로 두세요"
                                                className="h-[40px] w-full rounded-[8px] border px-4 text-[13px] font-semibold outline-none transition-all duration-200"
                                                style={{ borderColor: "#F8DCE2", backgroundColor: "#FFFFFF", color: "#242424" }}
                                                onFocus={e => { e.currentTarget.style.borderColor = "#F49EAF"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(244,158,175,0.12)"; }}
                                                onBlur={e => { e.currentTarget.style.borderColor = "#F8DCE2"; e.currentTarget.style.boxShadow = "none"; }}
                                            />
                                            <div className="mt-1.5 text-[10px] leading-relaxed" style={{ color: "#616161" }}>
                                                {refundModalMatchedItem?.itemType === "membership"
                                                    ? "이용한 시술의 단품 정가 합계입니다. 직접 수정할 수 있습니다."
                                                    : "정상가 기준 사용 차감액을 직접 수정할 수 있습니다."
                                                }
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="mb-2 block text-[13px] font-bold" style={{ color: "#5C2A35" }}>환불 사유</label>
                                    <textarea
                                        value={refundModal.reason}
                                        onChange={(e) =>
                                            setRefundModal((prev) => prev ? { ...prev, reason: e.target.value } : prev)
                                        }
                                        disabled={refundModal.isSubmitting}
                                        rows={3}
                                        placeholder="환불 사유를 입력하세요. 비워둬도 진행은 가능합니다."
                                        className="w-full rounded-[12px] border px-4 py-3 text-[13px] outline-none transition-all duration-200"
                                        style={{ borderColor: "#F8DCE2", backgroundColor: "#FFFFFF", color: "#242424" }}
                                        onFocus={e => { e.currentTarget.style.borderColor = "#F49EAF"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(244,158,175,0.12)"; }}
                                        onBlur={e => { e.currentTarget.style.borderColor = "#F8DCE2"; e.currentTarget.style.boxShadow = "none"; }}
                                    />
                                </div>

                                <div>
                                    <div className="mb-2 text-[13px] font-bold" style={{ color: "#5C2A35" }}>
                                        환불 대상 결제건 {refundModal.records.length}건
                                    </div>
                                    <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                                        {refundModal.records.map((record) => (
                                            <div key={`refund-modal-record-${record.id}`} className="rounded-[12px] border overflow-hidden" style={{ borderColor: "#F8DCE2" }}>
                                                {(record.items || []).filter(item => {
                                                    if (refundModal.refundPaymentDetailId) return (item as any).paymentDetailId === refundModal.refundPaymentDetailId;
                                                    if (refundModal.refundItemName) return item.itemName === refundModal.refundItemName;
                                                    return true;
                                                }).map((item, itemIdx) => {
                                                    const basePrice = item.eventPrice ?? item.originalPrice;
                                                    const discounted = item.discountedPrice;
                                                    const discountAmt = (basePrice != null && discounted != null && basePrice !== discounted) ? basePrice - discounted : 0;
                                                    const finalAmount = (item.paymentDetails && item.paymentDetails.length > 0)
                                                        ? item.paymentDetails.reduce((sum, pd) => sum + pd.amount, 0)
                                                        : discounted ?? item.eventPrice ?? item.originalPrice ?? item.totalPrice;

                                                    const paymentChipColors: Record<string, { bg: string; color: string; border: string }> = {
                                                        MEMBERSHIP_CASH: { bg: "#EDE7F6", color: "#6A1B9A", border: "#CE93D8" },
                                                        MEMBERSHIP_POINT: { bg: "#F3E5F5", color: "#7B1FA2", border: "#CE93D8" },
                                                        CARD: { bg: "#E3F2FD", color: "#1565C0", border: "#90CAF9" },
                                                        CASH: { bg: "#E8F5E9", color: "#2E7D32", border: "#A5D6A7" },
                                                        BANKING: { bg: "#FFF8E1", color: "#F57F17", border: "#FFE082" },
                                                        PAY: { bg: "#E0F7FA", color: "#00838F", border: "#80DEEA" },
                                                    };
                                                    const grouped = new Map<string, { amount: number; cfg: { bg: string; color: string; border: string }; label: string }>();
                                                    for (const pd of (item.paymentDetails || [])) {
                                                        const cfg = paymentChipColors[pd.paymentType] || { bg: "#F5F5F5", color: "#616161", border: "#E0E0E0" };
                                                        const label = pd.paymentType === "MEMBERSHIP_CASH" ? "회원권(현금)"
                                                            : pd.paymentType === "MEMBERSHIP_POINT" ? "회원권(포인트)"
                                                            : pd.paymentType === "CARD" ? `카드${pd.cardCompany ? `(${pd.cardCompany})` : ""}`
                                                            : pd.paymentType === "CASH" ? "현금"
                                                            : pd.paymentType === "BANKING" ? "이체"
                                                            : pd.paymentType === "PAY" ? (pd.paymentSubMethodLabel || "간편결제")
                                                            : pd.paymentType;
                                                        const key = `${pd.paymentType}_${label}`;
                                                        const existing = grouped.get(key);
                                                        if (existing) existing.amount += pd.amount;
                                                        else grouped.set(key, { amount: pd.amount, cfg, label });
                                                    }

                                                    return (
                                                        <div key={`refund-item-${record.id}-${itemIdx}`} className="px-3 py-2.5" style={{ borderBottom: itemIdx < (record.items || []).length - 1 ? "1px solid #FCEBEF" : "none" }}>
                                                            <div className="text-[13px] font-bold" style={{ color: "#5C2A35" }}>{item.itemName}</div>
                                                            <div className="mt-1.5 rounded-[8px] px-2.5 py-1.5 space-y-0.5" style={{ backgroundColor: "#FAF3F5" }}>
                                                                {item.originalPrice != null && (
                                                                    <div className="flex justify-between text-[11px]">
                                                                        <span style={{ color: "#616161" }}>정가</span>
                                                                        <span className="tabular-nums font-medium" style={{ color: "#242424" }}>{item.originalPrice.toLocaleString()}원</span>
                                                                    </div>
                                                                )}
                                                                {item.eventPrice != null && item.eventPrice !== item.originalPrice && (
                                                                    <div className="flex justify-between text-[11px]">
                                                                        <span style={{ color: "#616161" }}>이벤트가</span>
                                                                        <span className="tabular-nums font-medium" style={{ color: "#242424" }}>{item.eventPrice.toLocaleString()}원</span>
                                                                    </div>
                                                                )}
                                                                {discountAmt > 0 && (
                                                                    <div className="flex justify-between text-[11px]">
                                                                        <span style={{ color: "#E53935" }}>할인금액{item.discountPercent ? ` (${item.discountPercent}%)` : ""}</span>
                                                                        <span className="tabular-nums font-bold" style={{ color: "#E53935" }}>-{discountAmt.toLocaleString()}원</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {grouped.size > 0 && (
                                                                <div className="mt-1.5">
                                                                    <div className="text-[10px] font-semibold mb-1" style={{ color: "#616161" }}>결제수단</div>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {Array.from(grouped.entries()).map(([key, { amount, cfg, label }]) => (
                                                                            <div key={key} className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1" style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
                                                                                <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{label}</span>
                                                                                <span className="text-[10px] font-extrabold tabular-nums" style={{ color: cfg.color }}>{amount.toLocaleString()}원</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between items-center mt-1.5 pt-1.5" style={{ borderTop: "1px solid #FCEBEF" }}>
                                                                <span className="text-[12px] font-semibold" style={{ color: "#242424" }}>최종구매가</span>
                                                                <span className="text-[14px] font-extrabold tabular-nums" style={{ color: "#5C2A35" }}>{(finalAmount ?? 0).toLocaleString()}원</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {refundModal.blockedMessages.length > 0 && (
                                    <div className="rounded-[12px] border px-4 py-3" style={{ borderColor: "#FFE082", backgroundColor: "#FFF8E1" }}>
                                        <div className="text-[13px] font-bold" style={{ color: "#F57F17" }}>제외된 결제건</div>
                                        <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed" style={{ color: "#F57F17" }}>
                                            {refundModal.blockedMessages.slice(0, 4).map((message, index) => (
                                                <div key={`refund-blocked-${index}`}>{message}</div>
                                            ))}
                                            {refundModal.blockedMessages.length > 4 && (
                                                <div>외 {refundModal.blockedMessages.length - 4}건</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t px-6 py-5 md:border-l md:border-t-0" style={{ borderColor: "#FCEBEF", backgroundColor: "#FAF3F5" }}>
                                <div className="rounded-[12px] overflow-hidden" style={{ border: "1px solid #F8DCE2" }}>
                                    <div className="px-4 py-2.5" style={{ backgroundColor: "#FCF7F8", borderBottom: "1px solid #FCEBEF" }}>
                                        <div className="text-[13px] font-bold" style={{ color: "#5C2A35" }}>환불 미리보기</div>
                                    </div>

                                    <div className="px-4 py-3" style={{ backgroundColor: "#FFFFFF" }}>
                                        <div className="space-y-2">
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-[12px] font-medium" style={{ color: "#616161" }}>결제금액</span>
                                                <span className="text-[14px] font-bold tabular-nums" style={{ color: "#242424" }}>{refundModalSourceAmount.toLocaleString()}원</span>
                                            </div>
                                            <div className="flex items-baseline justify-between">
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-[12px] font-medium" style={{ color: "#616161" }}>사용 차감액</span>
                                                    {refundModalMatchedItem && (
                                                        <span className="text-[10px]" style={{ color: "#BDBDBD" }}>
                                                            {refundModalMatchedItem.itemType === "membership"
                                                                ? `단품정가합계 (${refundModalMatchedItem.usedCount}건)`
                                                                : `${refundModalSourceAmount.toLocaleString()}×${refundModalRate}×${refundModalUsedCount}`
                                                            }
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[14px] font-bold tabular-nums" style={{ color: refundModalUsedAmount > 0 ? "#F57F17" : "#242424" }}>
                                                    {refundModalUsedAmount > 0 ? "-" : ""}{refundModalUsedAmount.toLocaleString()}원
                                                </span>
                                            </div>
                                            <div className="flex items-baseline justify-between">
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-[12px] font-medium" style={{ color: "#616161" }}>위약금</span>
                                                    {refundModal.responsibilityType === "customer" && (
                                                        <span className="text-[10px]" style={{ color: "#BDBDBD" }}>
                                                            {((refundModalMatchedItem?.penaltyRate ?? 0.10) * 100).toFixed(1)}%
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[14px] font-bold tabular-nums" style={{ color: refundModalPenaltyAmount > 0 ? "#E53935" : "#242424" }}>
                                                    {refundModalPenaltyAmount > 0 ? "-" : ""}{refundModalPenaltyAmount.toLocaleString()}원
                                                </span>
                                            </div>
                                        </div>

                                        {refundModalMatchedItem && (
                                            <div className="rounded-[8px] px-3 py-2 mt-3" style={{ backgroundColor: "#FAF3F5", border: "1px solid #FCEBEF" }}>
                                                <div className="text-[10px]" style={{ color: "#9E9E9E" }}>
                                                    {refundModalMatchedItem.itemType === "membership"
                                                        ? "실결제금액 - 단품정가합계 - 위약금"
                                                        : `최종구매가 - (최종구매가×환불변수(${refundModalRate})×사용(${refundModalUsedCount})) - 위약금`
                                                    }
                                                </div>
                                                <div className="text-[11px] font-semibold tabular-nums mt-0.5" style={{ color: "#616161" }}>
                                                    {refundModalSourceAmount.toLocaleString()} - {refundModalUsedAmount.toLocaleString()} - {refundModalPenaltyAmount.toLocaleString()} = {refundModalPreviewAmount.toLocaleString()}원
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#FFF3F3", borderTop: "1px solid #FFCDD2" }}>
                                        <span className="text-[13px] font-bold" style={{ color: "#C62828" }}>환불 지급액</span>
                                        <span className="text-[20px] font-extrabold tabular-nums" style={{ color: "#E53935" }}>
                                            {refundModalPreviewAmount.toLocaleString()}원
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-3 rounded-[8px] px-3 py-2 text-[11px] leading-relaxed" style={{ backgroundColor: "#FFFFFF", border: "1px solid #FCEBEF", color: "#616161" }}>
                                    {refundModal.responsibilityType === "customer"
                                        ? "위약금/정상가 차감은 결제건별 10% 위약금이 적용됩니다."
                                        : "n/1 차감은 위약금 없이 사용분만 차감합니다."}
                                </div>

                                {refundModalPreviewAmount > 0 && (() => {
                                    const record = refundModal.records[0];
                                    const targetItem = (record?.items || []).find(it => {
                                        if (refundModal.refundPaymentDetailId) return (it as any).paymentDetailId === refundModal.refundPaymentDetailId;
                                        if (refundModal.refundItemName) return it.itemName === refundModal.refundItemName;
                                        return true;
                                    });
                                    const pds = targetItem?.paymentDetails || [];
                                    if (pds.length === 0) return null;

                                    const totalPaid = pds.reduce((s, pd) => s + pd.amount, 0);
                                    const refundByMethod = new Map<string, { amount: number; label: string; bg: string; color: string; border: string }>();
                                    const chipColors: Record<string, { bg: string; color: string; border: string }> = {
                                        MEMBERSHIP_CASH: { bg: "#EDE7F6", color: "#6A1B9A", border: "#CE93D8" },
                                        MEMBERSHIP_POINT: { bg: "#F3E5F5", color: "#7B1FA2", border: "#CE93D8" },
                                        CARD: { bg: "#E3F2FD", color: "#1565C0", border: "#90CAF9" },
                                        CASH: { bg: "#E8F5E9", color: "#2E7D32", border: "#A5D6A7" },
                                        BANKING: { bg: "#FFF8E1", color: "#F57F17", border: "#FFE082" },
                                        PAY: { bg: "#E0F7FA", color: "#00838F", border: "#80DEEA" },
                                    };
                                    const isMembership = (type: string) => type === "MEMBERSHIP_CASH" || type === "MEMBERSHIP_POINT";
                                    const reversed = [...pds].sort((a, b) => {
                                        const aM = isMembership(a.paymentType) ? 1 : 0;
                                        const bM = isMembership(b.paymentType) ? 1 : 0;
                                        if (bM !== aM) return bM - aM;
                                        return (b.id || 0) - (a.id || 0);
                                    });
                                    let remaining = refundModalPreviewAmount;
                                    reversed.forEach((pd) => {
                                        if (remaining <= 0) return;
                                        const cc = chipColors[pd.paymentType] || { bg: "#F5F5F5", color: "#616161", border: "#E0E0E0" };
                                        const label = pd.paymentType === "MEMBERSHIP_CASH" ? "회원권(현금)"
                                            : pd.paymentType === "MEMBERSHIP_POINT" ? "회원권(포인트)"
                                            : pd.paymentType === "CARD" ? `카드${pd.cardCompany ? `(${pd.cardCompany})` : ""}`
                                            : pd.paymentType === "CASH" ? "현금"
                                            : pd.paymentType === "BANKING" ? "이체"
                                            : pd.paymentType === "PAY" ? (pd.paymentSubMethodLabel || "간편결제")
                                            : pd.paymentType;
                                        const key = `${pd.paymentType}_${label}`;
                                        const refAmt = Math.min(remaining, pd.amount);
                                        remaining -= refAmt;
                                        const existing = refundByMethod.get(key);
                                        if (existing) existing.amount += refAmt;
                                        else refundByMethod.set(key, { amount: refAmt, label, ...cc });
                                    });

                                    return (
                                        <div className="mt-3 rounded-[12px] overflow-hidden" style={{ border: "1px solid #F8DCE2" }}>
                                            <div className="px-4 py-2" style={{ backgroundColor: "#FCF7F8", borderBottom: "1px solid #FCEBEF" }}>
                                                <div className="text-[12px] font-bold" style={{ color: "#5C2A35" }}>환불수단 및 금액</div>
                                            </div>
                                            <div className="px-4 py-3 space-y-1" style={{ backgroundColor: "#FFFFFF" }}>
                                                {Array.from(refundByMethod.entries()).map(([key, { amount, label, color }]) => (
                                                    <div key={key} className="flex items-center justify-between">
                                                        <span className="text-[12px] font-medium" style={{ color: "#616161" }}>{label}</span>
                                                        <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
                                                            {amount.toLocaleString()}원
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "#FCEBEF" }}>
                            <button
                                type="button"
                                onClick={closeRefundModal}
                                disabled={refundModal.isSubmitting}
                                className="h-[40px] rounded-[8px] border px-5 text-[13px] font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ borderColor: "#F8DCE2", backgroundColor: "#FFFFFF", color: "#616161" }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#FAF3F5"; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmRefundModal}
                                disabled={refundModal.isSubmitting || refundModalPreviewAmount <= 0}
                                className="h-[40px] rounded-[8px] px-6 text-[13px] font-bold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ backgroundColor: "#E53935" }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#C62828"; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#E53935"; }}
                            >
                                {refundModal.isSubmitting ? "환불 처리중..." : refundModal.mode === "group" ? "묶음 환불 실행" : "환불 실행"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isPrintSettingsOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(226,107,124,0.18)]">
                        <div className="flex items-center justify-between px-6 pt-6 pb-3 border-b border-[#F8DCE2] bg-[#FCF7F8] rounded-t-2xl">
                            <div className="text-lg font-bold text-[#5C2A35]">인쇄 설정</div>
                            <button type="button" onClick={() => setIsPrintSettingsOpen(false)} className="rounded-lg p-1.5 text-[#616161] hover:text-[#5C2A35] hover:bg-[#FCEBEF] transition-all duration-200">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-3">
                            <div className="text-[12px] text-[#616161] mb-2">인쇄 대상을 선택하세요</div>
                            {[
                                { key: "counselor", label: "상담" },
                                { key: "doctorCounselor", label: "원장상담" },
                                { key: "doctor", label: "담당의" },
                                ...memoSections.map((s) => ({ key: s.id, label: s.label })),
                                { key: "todo", label: "할일" },
                            ].map((item) => (
                                <label key={item.key} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#FCEBEF]/50 transition-colors cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={printConfigDraft[item.key] !== false}
                                        onChange={(e) => setPrintConfigDraft((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                                        className="h-4 w-4 rounded border-[#F8DCE2] text-[#D27A8C] focus:ring-[#FCEBEF]"
                                    />
                                    <span className="text-[13px] font-medium text-[#242424]">{item.label}</span>
                                </label>
                            ))}
                        </div>
                        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#F8DCE2]">
                            <button type="button" onClick={() => setIsPrintSettingsOpen(false)} className="min-h-[40px] rounded-lg border border-[#F8DCE2] bg-white px-5 text-[12px] font-medium text-[#616161] hover:bg-[#FCEBEF] transition-all duration-200" disabled={printConfigSaving}>취소</button>
                            <button
                                type="button"
                                disabled={printConfigSaving}
                                onClick={async () => {
                                    setPrintConfigSaving(true);
                                    try {
                                        const items = Object.entries(printConfigDraft).map(([key, enabled]) => ({ key, enabled }));
                                        const branchId = String(settings.activeBranchId || "1");
                                        const updated = await chartConfigService.update(branchId, { printConfig: items } as any);
                                        updateSettings({ chartConfig: { ...(settings.chartConfig || {} as any), printConfig: updated.printConfig } as any });
                                        setIsPrintSettingsOpen(false);
                                    } catch (error) {
                                        console.error("Failed to save print config:", error);
                                        showAlert({ message: "인쇄 설정 저장에 실패했습니다.", type: "warning" });
                                    } finally {
                                        setPrintConfigSaving(false);
                                    }
                                }}
                                className="min-h-[40px] rounded-lg bg-[#D27A8C] px-5 text-[12px] font-medium text-white hover:bg-[#8B3F50] shadow-[0_4px_12px_rgba(226,107,124,0.18)] transition-all duration-200 disabled:opacity-50"
                            >
                                {printConfigSaving ? "저장중..." : "저장"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}

/** Inline component: 동의서 발송 이력 목록 */
function ConsentHistoryList({ patientId, branchId, searchQuery = "" }: { patientId: number; branchId: string; searchQuery?: string }) {
    const { showAlert, showConfirm } = useAlert();
    const [items, setItems] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [actionLoadingId, setActionLoadingId] = React.useState<number | null>(null);
    const [selectedDetail, setSelectedDetail] = React.useState<any | null>(null);
    const [consentPageUrl, setConsentPageUrl] = React.useState<string | null>(null);
    const [qrCodeUrl, setQrCodeUrl] = React.useState<string | null>(null);
    const normalizeStatus = React.useCallback((value: unknown) => String(value || "").trim().toLowerCase(), []);

    const fetchHistory = React.useCallback(async () => {
        setLoading(true);
        try {
            const { consentService } = await import('../services/consentService');
            const data = await consentService.getPatientHistory(patientId);
            setItems(Array.isArray(data) ? data : []);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    React.useEffect(() => {
        void fetchHistory();
    }, [fetchHistory]);

    if (loading) return <div className="text-[12px] text-[#616161] text-center py-6">불러오는 중...</div>;
    if (items.length === 0) return (
        <div className="rounded-xl border border-dashed border-[#F8DCE2] bg-[#FCF7F8] px-4 py-6 text-center">
            <div className="text-[12px] text-[#616161]">발송 이력이 없습니다.</div>
            <div className="text-[11px] text-[#E5B5C0] mt-1">위 버튼으로 동의서를 요청해보세요.</div>
        </div>
    );

    const statusLabel = (s: string) => {
        const normalized = normalizeStatus(s);
        if (normalized === 'signed') return <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 border border-green-200">서명완료</span>;
        if (normalized === 'cancelled') return <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 border border-rose-200">취소됨</span>;
        if (normalized === 'expired') return <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-[#616161] border border-gray-300">만료</span>;
        return <span className="inline-flex items-center rounded-md bg-[#FCEBEF] px-2 py-0.5 text-[11px] font-semibold text-[#D27A8C] border border-[#F8DCE2]">대기중</span>;
    };

    const getConsentUrl = async (item: any): Promise<string | null> => {
        const { consentService } = await import('../services/consentService');
        const detail = await consentService.getDetail(Number(item.id));
        const token = String((detail as any)?.token || "").trim();
        if (!token) return null;
        return `${window.location.origin}/m/consent/${token}`;
    };

    const handleOpenConsentPage = async (item: any) => {
        try {
            setActionLoadingId(item.id);
            const url = await getConsentUrl(item);
            if (!url) { showAlert({ message: "동의서 링크를 찾을 수 없습니다.", type: "error" }); return; }
            setConsentPageUrl(url);
        } catch (error: any) {
            showAlert({ message: "동의서 열기 실패: " + (error?.response?.data?.error || error?.message || "Unknown error"), type: "error" });
        } finally {
            setActionLoadingId((prev) => (prev === item.id ? null : prev));
        }
    };

    const handleOpenQrCode = async (item: any) => {
        try {
            setActionLoadingId(item.id);
            const url = await getConsentUrl(item);
            if (!url) { showAlert({ message: "QR 링크를 찾을 수 없습니다.", type: "error" }); return; }
            setQrCodeUrl(url);
        } catch (error: any) {
            showAlert({ message: "QR 열기 실패: " + (error?.response?.data?.error || error?.message || "Unknown error"), type: "error" });
        } finally {
            setActionLoadingId((prev) => (prev === item.id ? null : prev));
        }
    };

    const handleResendKakao = async (item: any) => {
        const formTemplateId = String(item?.formTemplateId || "").trim();
        if (!formTemplateId) {
            showAlert({ message: "재발송할 서식 정보가 없어 다시 발송할 수 없습니다.", type: "warning" });
            return;
        }

        try {
            setActionLoadingId(item.id);
            const { consentService } = await import('../services/consentService');
            const response = await consentService.send(branchId, patientId, formTemplateId);
            showAlert({ message: response.notificationSent ? "카카오톡 재발송이 완료되었습니다." : `재발송 요청은 되었지만 실패했습니다: ${response.notificationResult || ""}`, type: "info" });
            await fetchHistory();
        } catch (error: any) {
            showAlert({ message: "카카오톡 재발송 실패: " + (error?.response?.data?.error || error?.message || "Unknown error"), type: "error" });
        } finally {
            setActionLoadingId((prev) => (prev === item.id ? null : prev));
        }
    };

    const handleCancelRequest = async (item: any) => {
        const normalized = normalizeStatus(item?.status);
        if (normalized !== "pending") {
            showAlert({ message: "대기중인 요청만 취소할 수 있습니다.", type: "warning" });
            return;
        }
        const requestId = Number(item?.id);
        if (!Number.isFinite(requestId) || requestId <= 0) {
            showAlert({ message: "동의서 요청 번호가 올바르지 않아 취소할 수 없습니다.", type: "warning" });
            return;
        }

        const ok = await showConfirm({ message: "이 동의서 요청을 취소할까요?", type: "warning", confirmText: "취소하기", cancelText: "닫기" });
        if (!ok) return;

        try {
            setActionLoadingId(item.id);
            const { consentService } = await import('../services/consentService');
            await consentService.cancel(requestId, "환자차트 동의서 탭에서 취소");
            showAlert({ message: "동의서 요청을 취소했습니다.", type: "success" });
            await fetchHistory();
        } catch (error: any) {
            showAlert({ message: "동의서 요청 취소 실패: " + (error?.response?.data?.error || error?.message || "Unknown error"), type: "error" });
        } finally {
            setActionLoadingId((prev) => (prev === item.id ? null : prev));
        }
    };

    const handleOpenCompleted = async (item: any) => {
        try {
            setActionLoadingId(item.id);
            const { consentService } = await import('../services/consentService');
            const detail = await consentService.getDetail(Number(item.id));
            setSelectedDetail(detail);
        } catch (error: any) {
            showAlert({ message: "동의서 상세 조회 실패: " + (error?.response?.data?.error || error?.message || "Unknown error"), type: "error" });
        } finally {
            setActionLoadingId((prev) => (prev === item.id ? null : prev));
        }
    };

    const renderConsentBody = (value: unknown) => {
        const text = String(value || "");
        if (!text.trim()) {
            return <div className="text-xs text-gray-400">저장된 본문이 없습니다.</div>;
        }

        // Structured JSON 감지
        let isStructuredJson = false;
        let structuredBlocks: any[] = [];
        try {
            const parsed = JSON.parse(text);
            if (parsed && Array.isArray(parsed.sections)) {
                isStructuredJson = true;
                structuredBlocks = (parsed.sections as any[]).flatMap((s: any) => s.blocks || []);
            }
        } catch { /* not JSON */ }

        if (isStructuredJson) {
            return (
                <div className="space-y-3">
                    {structuredBlocks.map((block: any) => (
                        <div key={block.id}>
                            {block.title && (
                                <div className="text-[13px] font-bold text-[#5C2A35] mb-1">
                                    {block.title}
                                </div>
                            )}
                            {block.type === "text_content" && block.content && (
                                <div className={`whitespace-pre-wrap leading-relaxed ${
                                    block.fontSize === "sm" ? "text-[12px]" : block.fontSize === "lg" ? "text-[16px]" : "text-[13px]"
                                } ${block.fontWeight === "bold" ? "font-bold" : ""} ${
                                    block.color === "muted" ? "text-gray-500" : block.color === "danger" ? "text-red-600" : block.color === "primary" ? "text-[#8B3F50]" : "text-gray-700"
                                }`}>
                                    {block.content}
                                </div>
                            )}
                            {block.type === "date" && (
                                <div className="text-[12px] text-gray-400 italic">📅 날짜 입력란</div>
                            )}
                            {block.type === "text_chart" && (
                                <div className="text-[12px] text-gray-400 italic">📝 {block.placeholder || "차트에서 입력"}</div>
                            )}
                            {block.type === "choice" && (
                                <div className="space-y-1 text-[12px] text-gray-600">
                                    {(block.options || []).map((opt: any) => (
                                        <div key={opt.id}>○ {opt.label}{opt.hasNote ? " (비고란)" : ""}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            );
        }

        const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text);
        if (looksLikeHtml) {
            return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: text }} />;
        }
        return <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">{text}</div>;
    };

    return (
        <>
            <div className="rounded-xl border border-[#F8DCE2] overflow-hidden">
                <div className="px-4 py-3 bg-[#FCF7F8] border-b border-[#F8DCE2] flex items-center justify-between">
                    <div className="text-[13px] font-semibold text-[#5C2A35]">발송 이력</div>
                    <span className="text-[11px] text-[#616161]">{items.length}건</span>
                </div>
                <div className="divide-y divide-[#FCEBEF]">
                    {items.filter((item: any) => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.trim().toLowerCase();
                        const name = String(item?.formTemplateName || item?.templateName || "").toLowerCase();
                        const st = String(item?.status || "").toLowerCase();
                        const stLabel = st === "signed" ? "서명완료" : st === "cancelled" ? "취소" : st === "expired" ? "만료" : "대기";
                        return name.includes(q) || stLabel.includes(q);
                    }).map((item: any) => {
                        const status = String(item?.status || "");
                        const normalizedStatus = normalizeStatus(status);
                        const canOpenQr = normalizedStatus === "pending";
                        const canResend = (normalizedStatus === "pending" || normalizedStatus === "expired") && String(item?.formTemplateId || "").trim().length > 0;
                        const canCancel = normalizedStatus === "pending";
                        const canOpenCompleted = normalizedStatus === "signed";
                        const isRunning = actionLoadingId === item.id;

                        return (
                            <div key={item.id} className="px-4 py-3 bg-white hover:bg-[#FCEBEF]/30 transition-all duration-200">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold text-[#242424] truncate">{item.formTitle}</div>
                                        <div className="text-[11px] text-[#616161] mt-0.5">
                                            {new Date(item.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            {item.signedAt && <span className="ml-1.5">/ 서명 {new Date(item.signedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                                        </div>
                                    </div>
                                    <div className="ml-2 shrink-0">{statusLabel(status)}</div>
                                </div>

                                {item.notificationSent === false && (
                                    <div className="mt-1.5 text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-0.5 inline-block border border-amber-200">알림톡 미발송</div>
                                )}

                                {(canOpenQr || canResend || canCancel || canOpenCompleted) && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {canOpenCompleted && (
                                            <button type="button" disabled={isRunning}
                                                className="rounded-lg border border-[#F8DCE2] bg-white px-2.5 py-1 text-[11px] font-medium text-[#D27A8C] hover:bg-[#FCEBEF] disabled:opacity-50 transition-all duration-200"
                                                onClick={() => void handleOpenCompleted(item)}>
                                                완료본 보기
                                            </button>
                                        )}
                                        {canOpenQr && (
                                            <>
                                                <button type="button" disabled={isRunning}
                                                    className="rounded-lg border border-[#F8DCE2] bg-white px-2.5 py-1 text-[11px] font-medium text-[#D27A8C] hover:bg-[#FCEBEF] disabled:opacity-50 transition-all duration-200"
                                                    onClick={() => void handleOpenConsentPage(item)}>
                                                    동의서 열기
                                                </button>
                                                <button type="button" disabled={isRunning}
                                                    className="rounded-lg border border-[#F8DCE2] bg-white px-2.5 py-1 text-[11px] font-medium text-[#D27A8C] hover:bg-[#FCEBEF] disabled:opacity-50 transition-all duration-200"
                                                    onClick={() => void handleOpenQrCode(item)}>
                                                    QR 열기
                                                </button>
                                            </>
                                        )}
                                        {canResend && (
                                            <button type="button" disabled={isRunning}
                                                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-all duration-200"
                                                onClick={() => void handleResendKakao(item)}>
                                                재발송
                                            </button>
                                        )}
                                        {canCancel && (
                                            <button type="button" disabled={isRunning}
                                                className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-all duration-200"
                                                onClick={() => void handleCancelRequest(item)}>
                                                취소
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {selectedDetail && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white shadow-xl border border-[#F8DCE2] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 bg-[#FCF7F8] border-b border-[#F8DCE2]">
                            <div>
                                <div className="text-[15px] font-bold text-[#5C2A35]">{selectedDetail.formTitle || "동의서"}</div>
                                <div className="text-[12px] text-[#616161] mt-0.5">
                                    발송 {selectedDetail.createdAt ? new Date(selectedDetail.createdAt).toLocaleString("ko-KR") : "-"}
                                    {selectedDetail.signedAt ? ` · 서명 ${new Date(selectedDetail.signedAt).toLocaleString("ko-KR")}` : ""}
                                </div>
                            </div>
                            <button type="button"
                                className="rounded-lg border border-[#F8DCE2] bg-white px-3 py-1.5 text-[12px] font-medium text-[#616161] hover:bg-[#FCEBEF] transition-all duration-200"
                                onClick={() => setSelectedDetail(null)}>
                                닫기
                            </button>
                        </div>

                        <div className="overflow-y-auto p-6 space-y-4">
                            <div className="rounded-xl border border-[#F8DCE2] overflow-hidden">
                                <div className="px-4 py-2.5 bg-[#FCF7F8] border-b border-[#F8DCE2]">
                                    <div className="text-[12px] font-semibold text-[#5C2A35]">동의서 본문</div>
                                </div>
                                <div className="p-4 bg-white">{renderConsentBody(selectedDetail.formBody)}</div>
                            </div>

                            <div className="rounded-xl border border-[#F8DCE2] overflow-hidden">
                                <div className="px-4 py-2.5 bg-[#FCF7F8] border-b border-[#F8DCE2]">
                                    <div className="text-[12px] font-semibold text-[#5C2A35]">환자 서명</div>
                                </div>
                                <div className="p-4 bg-white flex items-center justify-center min-h-[120px]">
                                    {selectedDetail.signatureDataUrl ? (
                                        <img src={selectedDetail.signatureDataUrl} alt="환자 서명"
                                            className="max-h-52 rounded-lg border border-[#FCEBEF] bg-white p-2" />
                                    ) : (
                                        <div className="text-[12px] text-[#616161]">서명 이미지가 없습니다.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {consentPageUrl && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg max-h-[90vh] rounded-2xl bg-white shadow-xl border border-[#F8DCE2] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 bg-[#FCF7F8] border-b border-[#F8DCE2]">
                            <div className="text-[15px] font-bold text-[#5C2A35]">동의서 서명 페이지</div>
                            <button type="button"
                                className="rounded-lg border border-[#F8DCE2] bg-white px-3 py-1.5 text-[12px] font-medium text-[#616161] hover:bg-[#FCEBEF] transition-all duration-200"
                                onClick={() => setConsentPageUrl(null)}>
                                닫기
                            </button>
                        </div>
                        <iframe
                            src={consentPageUrl}
                            className="flex-1 w-full min-h-[70vh] border-0"
                            title="동의서 서명"
                        />
                    </div>
                </div>
            )}

            {qrCodeUrl && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-[#F8DCE2] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 bg-[#FCF7F8] border-b border-[#F8DCE2]">
                            <div className="text-[15px] font-bold text-[#5C2A35]">동의서 QR 코드</div>
                            <button type="button"
                                className="rounded-lg border border-[#F8DCE2] bg-white px-3 py-1.5 text-[12px] font-medium text-[#616161] hover:bg-[#FCEBEF] transition-all duration-200"
                                onClick={() => setQrCodeUrl(null)}>
                                닫기
                            </button>
                        </div>
                        <div className="p-8 flex flex-col items-center gap-4">
                            <div className="bg-white p-4 rounded-xl border-2 border-dashed border-[#F8DCE2]">
                                <QRCodeSVG value={qrCodeUrl} size={200} />
                            </div>
                            <div className="text-center">
                                <div className="text-[13px] font-semibold text-[#242424]">태블릿 카메라로 스캔하세요</div>
                                <div className="text-[11px] text-[#616161] mt-1">스캔하면 동의서 서명 페이지가 열립니다.</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function RefundHistoryList({
    patientId,
    paymentRecords,
    tickets,
    memberships,
    refundingPaymentId,
    onRefund,
    onRefundGroup,
    onRefundCompleted,
    isReadOnly,
}: {
    patientId: number;
    paymentRecords: PaymentRecord[];
    tickets: any[];
    memberships: PatientMembership[];
    refundingPaymentId: number | null;
    onRefund: (record: PaymentRecord, itemName?: string, refundRate?: number, paymentDetailId?: number) => Promise<void>;
    onRefundGroup: (records: PaymentRecord[]) => Promise<void>;
    onRefundCompleted?: () => void | Promise<void>;
    isReadOnly?: boolean;
    searchQuery?: string;
}) {
    type RefundItemSummary = {
        key: string;
        itemName: string;
        itemType: string;
        quantity: number;
        totalPrice: number;
    };
    type RefundRecordGroup = {
        id: string;
        records: PaymentRecord[];
        latestPaidAt: string;
        status: "paid" | "partial_refunded" | "refunded" | "deduction_paid";
        totalActualPaid: number;
        totalMembershipDeduction: number;
        itemSummaries: RefundItemSummary[];
        refundableRecords: PaymentRecord[];
        clientRefundableRecords: PaymentRecord[];
    };
    type RefundCheckRow = {
        sourceAmount: number;
        autoUsedAmount: number;
        penaltyAmount: number;
        estimatedRefund: number;
        canRefund: boolean;
        reason?: string;
        items?: Array<{ itemName: string; itemType: string; rootId?: number; paymentDetailId: number; paymentDetailIds?: number[]; originalPrice: number; eventPrice?: number; discountAmount: number; paidAmount: number; originalUnitPrice: number; usedCount: number; totalCount?: number; usedAmountAtOriginalPrice: number; penaltyRate: number; penaltyAmount: number; estimatedRefund: number; refundFormula: string }>;
    };
    type ItemUsageHint = {
        summary: string;
        detailLines: string[];
    };

    const [refundFilterTab, setRefundFilterTab] = useState<'all' | 'ticket' | 'membership'>('all');
    const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
    const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null);
    const [refundCheckByRecordId, setRefundCheckByRecordId] = useState<Record<number, RefundCheckRow>>({});
    const [refundCheckByGroupId, setRefundCheckByGroupId] = useState<Record<string, RefundCheckRow>>({});
    const [ticketHistoryByTicketId, setTicketHistoryByTicketId] = useState<Record<number, TicketHistory[]>>({});
    const [refundModalState, setRefundModalState] = useState<{
        paymentMasterId: number;
        paymentDetailId: number;
        itemName: string;
        itemType: string;
        paymentType?: string;
        terminalInfo?: { authNo?: string; authDate?: string; vanKey?: string };
    } | null>(null);
    const [paymentInfoModal, setPaymentInfoModal] = useState<{
        details: PaymentDetailBreakdown[];
        paymentTime?: string;
        receiptUserName?: string;
        focusedDetailId?: number;
    } | null>(null);
    const [retryRefundState, setRetryRefundState] = useState<{
        paymentMasterId: number;
        originPaymentDetailId: number;
        rePaymentDetailId?: number;
        originAmount: number;
        originPaymentType: string;
        terminalInfo?: { authNo?: string; authDate?: string; vanKey?: string };
    } | null>(null);
    const [retryRefundSubmitting, setRetryRefundSubmitting] = useState(false);

    // ISSUE-174: bulk refund + membership settlement
    const [selectedCardKeys, setSelectedCardKeys] = useState<Set<string>>(new Set());
    const [bulkModalState, setBulkModalState] = useState<BulkRefundModalItem[] | null>(null);
    const [settlementModalState, setSettlementModalState] = useState<{ paymentDetailId: number; membershipName: string } | null>(null);
    // ISSUE-176: unified refund modal (replaces bulk modal for mixed selections)
    const [unifiedModalState, setUnifiedModalState] = useState<UnifiedRefundSelection[] | null>(null);
    const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
    const toggleCardExpanded = (cardId: string) => {
        setExpandedCardIds((prev) => {
            const next = new Set(prev);
            if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
            return next;
        });
    };

    const normalizeItemKey = (value?: string) =>
        String(value || "")
            .replace(/\s+/g, "")
            .trim()
            .toLowerCase();
    const toTimeMs = (value?: string) => {
        const parsed = new Date(value || 0).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const getRecordStatus = (record: PaymentRecord) =>
        String(record?.status || "paid").trim().toLowerCase();

    const groupedRecords = useMemo<RefundRecordGroup[]>(() => {
        const masterMap = new Map<number, PaymentRecord[]>();
        for (const record of paymentRecords) {
            const masterId = record.paymentMasterId || record.id;
            const list = masterMap.get(masterId) || [];
            list.push(record);
            masterMap.set(masterId, list);
        }

        const groups = Array.from(masterMap.entries()).map(([, records]) => {
            const sorted = [...records].sort((a, b) => toTimeMs(b.paidAt) - toTimeMs(a.paidAt));
            return {
                records: sorted,
                latestPaidAt: sorted[0]?.paidAt || "",
            };
        });

        const mapped = groups.map((group, index) => {
            const records = [...group.records].sort((a, b) => toTimeMs(b.paidAt) - toTimeMs(a.paidAt));
            const refundedCount = records.filter((record) => {
                const status = getRecordStatus(record);
                return status === "refunded" || status === "cancelled";
            }).length;

            let status: RefundRecordGroup["status"] = "paid";
            if (refundedCount === records.length) status = "refunded";
            else if (refundedCount > 0) status = "partial_refunded";
            const hasDeductionPaid = records.some((r) => getRecordStatus(r) === "deduction_paid");
            if (hasDeductionPaid && status !== "refunded") status = "deduction_paid";

            const itemMap = new Map<string, RefundItemSummary>();
            for (const record of records) {
                for (const item of record.items || []) {
                    const key = `${String(item.itemType || "").toLowerCase()}::${normalizeItemKey(item.itemName)}::${Number(item.unitPrice || 0)}`;
                    const prev = itemMap.get(key);
                    if (prev) {
                        prev.quantity += Number(item.quantity || 0);
                        prev.totalPrice += Number(item.totalPrice || 0);
                    } else {
                        itemMap.set(key, {
                            key,
                            itemName: String(item.itemName || "항목"),
                            itemType: String(item.itemType || ""),
                            quantity: Number(item.quantity || 0),
                            totalPrice: Number(item.totalPrice || 0),
                        });
                    }
                }
            }

            return {
                id: `refund-group-${records[0]?.id || index}-${toTimeMs(group.latestPaidAt)}`,
                records,
                latestPaidAt: group.latestPaidAt,
                status,
                totalActualPaid: records.reduce((sum, record) => sum + paymentService.calcActualPaidAmount(record), 0),
                totalMembershipDeduction: records.reduce((sum, record) => sum + Math.max(0, Number(record.membershipDeduction || 0)), 0),
                itemSummaries: Array.from(itemMap.values()),
                refundableRecords: records.filter((record) => {
                    const status = getRecordStatus(record);
                    return status !== "refunded" && status !== "cancelled";
                }),
                clientRefundableRecords: records.filter((record) => {
                    const status = getRecordStatus(record);
                    return status !== "refunded" && status !== "cancelled" && !getRefundClientBlockReason(record);
                }),
            };
        });

        return mapped.sort((a, b) => toTimeMs(b.latestPaidAt) - toTimeMs(a.latestPaidAt));
    }, [paymentRecords]);

    useEffect(() => {
        let cancelled = false;
        const loadAll = async () => {
            for (const group of groupedRecords) {
                if (cancelled) break;
                if (refundCheckByGroupId[group.id]) continue;
                const masterId = group.records[0]?.paymentMasterId || group.records[0]?.id;
                if (!masterId) continue;
                try {
                    const check = await paymentService.getRefundCheck(masterId);
                    if (cancelled) break;
                    setRefundCheckByGroupId((prev) => ({
                        ...prev,
                        [group.id]: {
                            sourceAmount: check.sourceAmount || 0,
                            autoUsedAmount: check.autoUsedAmount || 0,
                            penaltyAmount: check.penaltyAmount || 0,
                            estimatedRefund: check.estimatedRefund || 0,
                            canRefund: check.canRefund,
                            reason: check.reason,
                            items: check.items,
                        },
                    }));
                } catch {}
            }
        };
        loadAll();
        return () => { cancelled = true; };
    }, [groupedRecords]);

    const ticketLookupByName = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const ticket of tickets || []) {
            const key = normalizeItemKey(ticket?.itemName || ticket?.ticketName || ticket?.name);
            if (!key) continue;
            const list = map.get(key) || [];
            list.push(ticket);
            map.set(key, list);
        }
        return map;
    }, [tickets]);
    const membershipLookupByName = useMemo(() => {
        const map = new Map<string, PatientMembership[]>();
        for (const membership of memberships || []) {
            const key = normalizeItemKey(membership?.membershipName);
            if (!key) continue;
            const list = map.get(key) || [];
            list.push(membership);
            map.set(key, list);
        }
        return map;
    }, [memberships]);

    const getMatchedTicketsForItem = useCallback((item: RefundItemSummary | PaymentRecord["items"][number]) => {
        const itemType = String(item?.itemType || "").trim().toLowerCase();
        if (itemType !== "ticket") return [];

        const issuedEntityId = Number((item as any)?.issuedEntityId || 0);
        if (issuedEntityId > 0) {
            return (tickets || []).filter((ticket) => Number(ticket?.id || 0) === issuedEntityId);
        }

        const key = normalizeItemKey(String(item?.itemName || ""));
        if (!key) return [];
        return ticketLookupByName.get(key) || [];
    }, [ticketLookupByName, tickets]);

    const formatTicketHistoryLabel = useCallback((history: TicketHistory, index: number) => {
        const roundLabel =
            typeof history?.usedRound === "number" && history.usedRound > 0
                ? `${history.usedRound}회차`
                : `${index + 1}회 사용`;
        const usedAtLabel = history?.usedAt
            ? new Date(history.usedAt).toLocaleString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            })
            : "일시 미확인";

        let treatmentLabel = "";
        try {
            const parsed = JSON.parse(String(history?.usedTreatmentsJson || "[]"));
            if (Array.isArray(parsed)) {
                const names = parsed.map((name) => String(name || "").trim()).filter(Boolean);
                if (names.length > 0) {
                    treatmentLabel = ` · ${names.join(", ")}`;
                }
            }
        } catch {
            treatmentLabel = "";
        }

        return `${roundLabel} · ${usedAtLabel}${treatmentLabel}`;
    }, []);

    const getItemUsageHint = (item: RefundItemSummary | PaymentRecord["items"][number]): ItemUsageHint => {
        const itemType = String(item.itemType || "").trim().toLowerCase();
        const key = normalizeItemKey(item.itemName);
        if (!key) {
            return { summary: "사용 이력 정보 없음", detailLines: [] };
        }

        if (itemType === "ticket") {
            const matched = getMatchedTicketsForItem(item);
            if (matched.length === 0) {
                return { summary: "시술권 이력 미확인", detailLines: [] };
            }

            const ticket = matched[0] || {};
            const usageCount = Math.max(0, Number(ticket?.usageCount || ticket?.UsageCount || 0));
            const remainingCountRaw = ticket?.remainingCount ?? ticket?.RemainingCount;
            const remainingLabel =
                typeof remainingCountRaw === "number"
                    ? ` · 남은 ${Math.max(0, remainingCountRaw)}회`
                    : "";
            const detailLines = matched
                .flatMap((matchedTicket) => ticketHistoryByTicketId[Number(matchedTicket?.id || 0)] || [])
                .filter((history) => !history?.isCancelled)
                .sort((a, b) => {
                    const roundDiff = Number(a?.usedRound || 0) - Number(b?.usedRound || 0);
                    if (roundDiff !== 0) return roundDiff;
                    return new Date(a?.usedAt || 0).getTime() - new Date(b?.usedAt || 0).getTime();
                })
                .map((history, index) => formatTicketHistoryLabel(history, index));

            return {
                summary: `사용 ${usageCount}회${remainingLabel}`,
                detailLines,
            };
        }

        if (itemType === "membership") {
            const matched = membershipLookupByName.get(key) || [];
            if (matched.length === 0) {
                return { summary: "회원권 이력 미확인", detailLines: [] };
            }
            const membership = matched[0];
            return {
                summary: `사용 ${Math.max(0, Number(membership?.usedCount || 0)).toLocaleString()}회 · 잔액 ${Math.max(0, Number(membership?.remainingBalance || 0)).toLocaleString()}원`,
                detailLines: [],
            };
        }

        return { summary: "사용 이력 정보 없음", detailLines: [] };
    };

    const handleToggleGroup = useCallback(
        async (group: RefundRecordGroup) => {
            if (expandedGroupId === group.id) {
                setExpandedGroupId(null);
                return;
            }

            const masterId = group.records[0]?.paymentMasterId || group.records[0]?.id;
            if (masterId && !refundCheckByGroupId[group.id]) {
                setLoadingGroupId(group.id);
                try {
                    const check = await paymentService.getRefundCheck(masterId);
                    setRefundCheckByGroupId((prev) => ({
                        ...prev,
                        [group.id]: {
                            sourceAmount: check.sourceAmount || 0,
                            autoUsedAmount: check.autoUsedAmount || 0,
                            penaltyAmount: check.penaltyAmount || 0,
                            estimatedRefund: check.estimatedRefund || 0,
                            canRefund: check.canRefund,
                            reason: check.reason,
                            items: check.items,
                        },
                    }));
                } catch (e) {
                    console.error("Failed to load refund check:", e);
                } finally {
                    setLoadingGroupId((prev) => (prev === group.id ? null : prev));
                }
            }

            setExpandedGroupId(group.id);
            const blockedChecks = group.records
                .filter((record) => !refundCheckByRecordId[record.id])
                .map((record) => {
                    const reason = getRefundClientBlockReason(record);
                    if (!reason) return null;
                    return {
                        id: record.id,
                        row: {
                            sourceAmount: Math.max(0, paymentService.calcActualPaidAmount(record)),
                            autoUsedAmount: 0,
                            canRefund: false,
                            reason,
                        } as RefundCheckRow,
                    };
                })
                .filter(Boolean) as Array<{ id: number; row: RefundCheckRow }>;
            const blockedIds = new Set(blockedChecks.map((entry) => entry.id));
            const missing = group.records.filter((record) => !refundCheckByRecordId[record.id] && !blockedIds.has(record.id));
            const ticketIdsToLoad = Array.from(
                new Set(
                    group.records
                        .flatMap((record) => record.items || [])
                        .flatMap((item) => getMatchedTicketsForItem(item))
                        .map((ticket) => Number(ticket?.id || 0))
                        .filter((ticketId) => ticketId > 0 && !ticketHistoryByTicketId[ticketId])
                )
            );
            if (missing.length === 0 && ticketIdsToLoad.length === 0) {
                if (blockedChecks.length > 0) {
                    setRefundCheckByRecordId((prev) => {
                        const next = { ...prev };
                        for (const entry of blockedChecks) next[entry.id] = entry.row;
                        return next;
                    });
                }
                return;
            }

            setLoadingGroupId(group.id);
            try {
                const [loadedChecks, loadedTicketHistories] = await Promise.all([
                    Promise.all(
                    missing.map(async (record) => {
                        try {
                            const check = await paymentService.getRefundCheck(record.id);
                            return {
                                id: record.id,
                                row: {
                                    sourceAmount: Math.max(0, Number(check.sourceAmount ?? paymentService.calcActualPaidAmount(record))),
                                    autoUsedAmount: Math.max(0, Number(check.autoUsedAmount ?? 0)),
                                    canRefund: Boolean(check.canRefund),
                                    reason: check.reason,
                                } as RefundCheckRow,
                            };
                        } catch (error: any) {
                            return {
                                id: record.id,
                                row: {
                                    sourceAmount: Math.max(0, paymentService.calcActualPaidAmount(record)),
                                    autoUsedAmount: 0,
                                    canRefund: false,
                                    reason: error?.response?.data?.message || error?.message || "조회 실패",
                                } as RefundCheckRow,
                            };
                        }
                    })
                    ),
                    Promise.all(
                        ticketIdsToLoad.map(async (ticketId) => {
                            try {
                                const history = await ticketService.getHistory(ticketId, patientId);
                                return { ticketId, history: history || [] };
                            } catch (error) {
                                console.error("Failed to load ticket history for refund detail:", error);
                                return { ticketId, history: [] as TicketHistory[] };
                            }
                        })
                    ),
                ]);

                if (loadedChecks.length > 0) {
                    setRefundCheckByRecordId((prev) => {
                        const next = { ...prev };
                        for (const entry of blockedChecks) next[entry.id] = entry.row;
                        for (const entry of loadedChecks) next[entry.id] = entry.row;
                        return next;
                    });
                } else if (blockedChecks.length > 0) {
                    setRefundCheckByRecordId((prev) => {
                        const next = { ...prev };
                        for (const entry of blockedChecks) next[entry.id] = entry.row;
                        return next;
                    });
                }

                if (loadedTicketHistories.length > 0) {
                    setTicketHistoryByTicketId((prev) => {
                        const next = { ...prev };
                        for (const entry of loadedTicketHistories) {
                            next[entry.ticketId] = entry.history;
                        }
                        return next;
                    });
                }
            } finally {
                setLoadingGroupId((prev) => (prev === group.id ? null : prev));
            }
        },
        [expandedGroupId, refundCheckByRecordId, getMatchedTicketsForItem, ticketHistoryByTicketId]
    );

    type ItemCard = {
        id: string;
        itemName: string;
        itemType: string;
        quantity: number;
        totalPrice: number;
        paidAt: string;
        status: "paid" | "partial_refunded" | "refunded";
        collectorName?: string;
        originalPrice?: number;
        eventPrice?: number;
        discountedPrice?: number;
        discountPercent?: number;
        itemPaymentDetails: PaymentDetailBreakdown[];
        group: RefundRecordGroup;
        record: PaymentRecord;
    };

    const itemCards = useMemo<ItemCard[]>(() => {
        const cards: ItemCard[] = [];
        for (const group of groupedRecords) {
            for (const record of group.records) {
                const recordRawStatus = getRecordStatus(record);
                for (const item of (record.items || [])) {
                    const itemStatus = String((item as any).status || "").trim().toLowerCase();
                    const resolvedStatus = (itemStatus === "refunded" || itemStatus === "cancelled")
                        ? "refunded" as const
                        : (recordRawStatus === "refunded" || recordRawStatus === "cancelled")
                        ? "refunded" as const
                        : "paid" as const;
                    const isRePaymentDetail = ((item as any).paymentDetails ?? []).some(
                        (pd: any) => pd?.memo && String(pd.memo).startsWith("위약금 재결제")
                    );
                    const displayItemName = isRePaymentDetail
                        ? "공제액 결제 (환불 위약금)"
                        : String(item.itemName || "항목");
                    cards.push({
                        id: `item-${record.id}-${(item as any).paymentDetailId || item.itemName}-${item.itemType}`,
                        itemName: displayItemName,
                        itemType: String(item.itemType || "").toLowerCase(),
                        quantity: Number(item.quantity || 1),
                        totalPrice: Number(item.totalPrice || 0),
                        paidAt: record.paidAt,
                        status: resolvedStatus,
                        collectorName: record.collectorName,
                        originalPrice: (item as any).originalPrice ?? undefined,
                        eventPrice: (item as any).eventPrice ?? undefined,
                        discountedPrice: (item as any).discountedPrice ?? undefined,
                        discountPercent: (item as any).discountPercent ?? undefined,
                        itemPaymentDetails: (item as any).paymentDetails ?? [],
                        group,
                        record,
                    });
                }
                if ((record.items || []).length === 0) {
                    const fallbackStatus = (recordRawStatus === "refunded" || recordRawStatus === "cancelled") ? "refunded" as const : "paid" as const;
                    cards.push({
                        id: `item-${record.id}-noitem`,
                        itemName: "결제",
                        itemType: "payment",
                        quantity: 1,
                        totalPrice: paymentService.calcActualPaidAmount(record),
                        paidAt: record.paidAt,
                        status: fallbackStatus,
                        collectorName: record.collectorName,
                        itemPaymentDetails: [],
                        group,
                        record,
                    });
                }
            }
        }
        return cards.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    }, [groupedRecords]);

    const filteredCards = useMemo(() => {
        if (!searchQuery?.trim()) return itemCards;
        const q = searchQuery.trim().toLowerCase();
        return itemCards.filter((c) => {
            const name = c.itemName.toLowerCase();
            const dateStr = new Date(c.paidAt).toLocaleDateString("ko-KR");
            const payType = c.itemPaymentDetails.map(pd => {
                const t = pd.paymentType;
                return t === "CARD" ? "카드" : t === "CASH" ? "현금" : t === "PAY" ? "간편결제" : t === "BANKING" ? "계좌이체" : t || "";
            }).join(" ").toLowerCase();
            return name.includes(q) || dateStr.includes(q) || payType.includes(q);
        });
    }, [itemCards, searchQuery]);
    void refundFilterTab;

    type GroupedCardEntry = {
        groupId: string;
        groupKey: string;
        latestPaidAt: string;
        groupTotal: number;
        groupStatus: string;
        cards: typeof filteredCards;
    };
    const cardsByGroup = useMemo<GroupedCardEntry[]>(() => {
        const map = new Map<string, GroupedCardEntry>();
        for (const card of filteredCards) {
            const groupId = card.group.id;
            const existing = map.get(groupId);
            if (existing) {
                existing.cards.push(card);
            } else {
                map.set(groupId, {
                    groupId,
                    groupKey: groupId,
                    latestPaidAt: card.group.latestPaidAt || card.paidAt,
                    groupTotal: card.group.totalActualPaid,
                    groupStatus: card.group.status,
                    cards: [card],
                });
            }
        }
        return Array.from(map.values()).sort((a, b) => new Date(b.latestPaidAt).getTime() - new Date(a.latestPaidAt).getTime());
    }, [filteredCards]);

    // 환불 가능한 카드 (체크박스 활성 대상)
    const isCardEligible = (c: typeof filteredCards[number]) => {
        if (c.status === "refunded") return false;
        if (getRefundClientBlockReason(c.record)) return false;
        if (!c.itemPaymentDetails[0]?.id) return false;
        return c.itemType === "ticket" || c.itemType === "membership";
    };

    const eligibleCardsForBulk = useMemo(() => filteredCards.filter(isCardEligible), [filteredCards]);
    const allEligibleSelected = eligibleCardsForBulk.length > 0 && eligibleCardsForBulk.every((c) => selectedCardKeys.has(c.id));
    const selectedCount = eligibleCardsForBulk.filter((c) => selectedCardKeys.has(c.id)).length;

    const toggleCardSelected = (cardId: string) => {
        setSelectedCardKeys((prev) => {
            const next = new Set(prev);
            if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
            return next;
        });
    };
    const toggleAllSelected = () => {
        if (allEligibleSelected) {
            setSelectedCardKeys(new Set());
        } else {
            setSelectedCardKeys(new Set(eligibleCardsForBulk.map((c) => c.id)));
        }
    };
    // 그룹 전체 선택 토글
    const toggleGroupSelected = (groupCards: typeof filteredCards) => {
        const eligibleInGroup = groupCards.filter(isCardEligible);
        const allSelected = eligibleInGroup.length > 0 && eligibleInGroup.every((c) => selectedCardKeys.has(c.id));
        setSelectedCardKeys((prev) => {
            const next = new Set(prev);
            if (allSelected) {
                eligibleInGroup.forEach((c) => next.delete(c.id));
            } else {
                eligibleInGroup.forEach((c) => next.add(c.id));
            }
            return next;
        });
    };

    // ISSUE-176: 통합 환불 모달 열기
    const openUnifiedRefund = () => {
        const selected = eligibleCardsForBulk.filter((c) => selectedCardKeys.has(c.id));
        if (selected.length === 0) return;
        const selections: UnifiedRefundSelection[] = selected.map((c) => {
            const pd = c.itemPaymentDetails[0];
            return {
                paymentMasterId: c.record.paymentMasterId || c.record.id,
                paymentDetailId: pd.id,
                itemType: c.itemType as "ticket" | "membership",
                itemName: c.itemName,
                paymentType: pd.paymentType,
                terminalInfo: (pd.terminalAuthNo || pd.terminalAuthDate || pd.terminalVanKey)
                    ? {
                        authNo: pd.terminalAuthNo,
                        authDate: pd.terminalAuthDate,
                        vanKey: pd.terminalVanKey,
                        catId: pd.terminalCatId,
                    }
                    : undefined,
            };
        });
        setUnifiedModalState(selections);
    };

    if (groupedRecords.length === 0) {
        return <div className="text-center text-[#616161] text-[14px] py-8">결제 내역이 없습니다.</div>;
    }

    return (
        <div className="space-y-3">
            {/* ISSUE-176: 통합 환불 toolbar (sticky 느낌) */}
            {!isReadOnly && eligibleCardsForBulk.length > 0 && (
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-[10px] border border-[#F8DCE2] bg-gradient-to-r from-[#FCEBEF]/60 to-[#FCF7F8] px-3 py-2 backdrop-blur shadow-sm">
                    <button
                        type="button"
                        onClick={toggleAllSelected}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#8B3F50] hover:underline"
                    >
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${allEligibleSelected ? "border-[#D27A8C] bg-[#D27A8C]" : "border-[#F8DCE2] bg-white"}`}>
                            {allEligibleSelected && <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>}
                        </span>
                        {allEligibleSelected ? "전체 해제" : `전체 선택 (${eligibleCardsForBulk.length})`}
                    </button>
                    <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={openUnifiedRefund}
                        className="rounded-lg px-3 py-1.5 text-[11px] font-extrabold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-[1px] disabled:hover:translate-y-0"
                        style={{
                            background: selectedCount === 0
                                ? "linear-gradient(135deg, #E5B5C0 0%, #D4A5B0 100%)"
                                : "linear-gradient(135deg, #D27A8C 0%, #8B3F50 100%)",
                            boxShadow: selectedCount === 0 ? "none" : "0 4px 12px rgba(210, 122, 140, 0.32)",
                        }}
                    >
                        통합 환불 ({selectedCount})
                    </button>
                </div>
            )}

            {/* ISSUE-176: 결제건 그룹별 카드 */}
            <div className="space-y-3">
                {cardsByGroup.length === 0 ? (
                    <div className="text-center text-[#616161] text-[13px] py-6">
                        결제 내역이 없습니다.
                    </div>
                ) : cardsByGroup.map((groupEntry) => {
                    const eligibleInGroup = groupEntry.cards.filter(isCardEligible);
                    const groupAllSelected = eligibleInGroup.length > 0 && eligibleInGroup.every((c) => selectedCardKeys.has(c.id));
                    const groupSomeSelected = eligibleInGroup.some((c) => selectedCardKeys.has(c.id));
                    const groupDate = new Date(groupEntry.latestPaidAt);
                    const dateLabel = groupDate.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
                    const isDeductionPaid = String(groupEntry.groupStatus || "").toLowerCase() === "deduction_paid";
                    const groupStatusLabel = isDeductionPaid
                        ? "원거래 취소 대기"
                        : groupEntry.groupStatus === "refunded" ? "전체 환불"
                        : groupEntry.groupStatus === "partial_refunded" ? "부분 환불"
                        : "정상";
                    const groupStatusClass = isDeductionPaid
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : groupEntry.groupStatus === "refunded" ? "bg-red-100 text-red-600"
                        : groupEntry.groupStatus === "partial_refunded" ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200";

                    return (
                        <div key={groupEntry.groupId} className="rounded-[16px] border border-slate-200 bg-white overflow-hidden shadow-sm">
                            {/* Group header */}
                            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    {!isReadOnly && eligibleInGroup.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => toggleGroupSelected(groupEntry.cards)}
                                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${groupAllSelected ? "border-[#D27A8C] bg-[#D27A8C]" : groupSomeSelected ? "border-[#D27A8C] bg-[#FCEBEF]" : "border-[#F8DCE2] bg-white hover:border-[#D27A8C]"}`}
                                            title={groupAllSelected ? "이 결제건 전체 해제" : "이 결제건 전체 선택"}
                                        >
                                            {groupAllSelected && <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>}
                                            {!groupAllSelected && groupSomeSelected && <span className="h-1 w-2 bg-[#D27A8C] rounded" />}
                                        </button>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[13px] font-extrabold text-[#5C2A35] whitespace-nowrap">{dateLabel}</span>
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${groupStatusClass}`}>
                                                {groupStatusLabel}
                                            </span>
                                            <span className="text-[10px] text-[#8B5A66]">{groupEntry.cards.length}건</span>
                                        </div>
                                        {(() => {
                                            const memDeduct = groupEntry.cards[0]?.group.totalMembershipDeduction ?? 0;
                                            // 그룹 내 모든 PaymentDetail (수납 수단 chip 렌더용) — id 중복 제거
                                            const seenDetailIds = new Set<number>();
                                            const groupDetails: PaymentDetailBreakdown[] = [];
                                            for (const c of groupEntry.cards) {
                                                for (const pd of c.itemPaymentDetails) {
                                                    if (!seenDetailIds.has(pd.id)) {
                                                        seenDetailIds.add(pd.id);
                                                        groupDetails.push(pd);
                                                    }
                                                }
                                            }
                                            // 위약금 재결제 detail 식별 (Memo prefix "위약금 재결제 ...")
                                            const isRePaymentDetail = (pd: PaymentDetailBreakdown) =>
                                                !!pd.memo && pd.memo.startsWith("위약금 재결제");
                                            // 회원권 차감(MEMBERSHIP_*) + 위약금 재결제 제외 — 고객이 실제 결제한 수단만 chip
                                            const realPaymentDetails = groupDetails.filter(
                                                pd => pd.paymentType !== "MEMBERSHIP_CASH"
                                                    && pd.paymentType !== "MEMBERSHIP_POINT"
                                                    && !isRePaymentDetail(pd)
                                            );
                                            // 결제수단 종류별로 1 chip 으로 단순화 (카드 N장 분할결제도 "카드 합계"로 합산)
                                            // 상세 분개는 chip 클릭 시 PaymentInfoModal 에서 확인
                                            const chipGroupsMap = new Map<string, { details: PaymentDetailBreakdown[]; total: number }>();
                                            for (const pd of realPaymentDetails) {
                                                const key = pd.paymentType;
                                                const existing = chipGroupsMap.get(key);
                                                if (existing) {
                                                    existing.details.push(pd);
                                                    existing.total += pd.amount;
                                                } else {
                                                    chipGroupsMap.set(key, { details: [pd], total: pd.amount });
                                                }
                                            }
                                            const realPaymentChips = Array.from(chipGroupsMap.values());
                                            const rePaymentDetails = groupDetails.filter(isRePaymentDetail);
                                            const rePaymentTotal = rePaymentDetails.reduce((s, pd) => s + pd.amount, 0);
                                            const headRecord = groupEntry.cards[0]?.record;
                                            const labelMap: Record<string, string> = {
                                                CARD: "카드", PAY: "간편결제", CASH: "현금", BANKING: "계좌이체",
                                                MEMBERSHIP_CASH: "회원권 잔액", MEMBERSHIP_POINT: "회원권 포인트",
                                            };
                                            return (
                                                <>
                                                    {realPaymentChips.length > 0 && (
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                            {realPaymentChips.map((g, idx) => {
                                                                const first = g.details[0];
                                                                const ptype = first.paymentType;
                                                                const isCardLike = ptype === "CARD" || ptype === "PAY";
                                                                const missingTerminal = isCardLike && !first.terminalAuthNo;
                                                                return (
                                                                    <button
                                                                        key={`${ptype}-${idx}`}
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setPaymentInfoModal({
                                                                                details: groupDetails,
                                                                                paymentTime: headRecord?.paidAt,
                                                                                receiptUserName: headRecord?.collectorName,
                                                                                focusedDetailId: first.id,
                                                                            });
                                                                        }}
                                                                        className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-full border border-[#F8DCE2] bg-white px-2 py-0.5 text-[10px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF] hover:border-[#D27A8C] transition-colors"
                                                                        title={`수납 정보 보기 — ${labelMap[ptype] || ptype}${g.details.length > 1 ? ` (${g.details.length}건 분개, 클릭 시 상세)` : ""}`}
                                                                    >
                                                                        <span>{labelMap[ptype] || ptype}</span>
                                                                        <span className="tabular-nums text-[#8B3F50]">{g.total.toLocaleString()}원</span>
                                                                        {g.details.length > 1 && (
                                                                            <span className="text-[#8B5A66] font-normal">· {g.details.length}건</span>
                                                                        )}
                                                                        {missingTerminal && (
                                                                            <span className="ml-0.5 text-rose-500" title="단말기 정보 미등록">⚠</span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {memDeduct > 0 && (
                                                        <div className="mt-1 text-[11px] text-violet-700">
                                                            <span className="font-semibold">회원권 차감</span>
                                                            <span className="ml-1 tabular-nums">{memDeduct.toLocaleString()}원</span>
                                                        </div>
                                                    )}
                                                    {rePaymentDetails.length > 0 && (
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-700">
                                                            <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold">위약금 재결제 완료</span>
                                                            {rePaymentDetails.map(pd => (
                                                                <button
                                                                    key={pd.id}
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setPaymentInfoModal({
                                                                            details: groupDetails,
                                                                            paymentTime: headRecord?.paidAt,
                                                                            receiptUserName: headRecord?.collectorName,
                                                                            focusedDetailId: pd.id,
                                                                        });
                                                                    }}
                                                                    className="tabular-nums font-bold underline-offset-2 hover:underline"
                                                                    title="위약금 재결제 정보 보기"
                                                                >
                                                                    +{pd.amount.toLocaleString()}원
                                                                </button>
                                                            ))}
                                                            {rePaymentDetails.length > 1 && (
                                                                <span className="text-amber-600">(합 {rePaymentTotal.toLocaleString()}원)</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <div className="text-right">
                                        {(() => {
                                            const memDeduct = groupEntry.cards[0]?.group.totalMembershipDeduction ?? 0;
                                            const ticketGross = groupEntry.groupTotal + memDeduct;
                                            return (
                                                <>
                                                    <div className="text-[14px] font-extrabold tabular-nums text-[#5C2A35] whitespace-nowrap">
                                                        {ticketGross.toLocaleString()}원
                                                    </div>
                                                    {memDeduct > 0 && (
                                                        <div className="text-[10px] text-[#8B5A66] tabular-nums whitespace-nowrap">
                                                            실 수납 {groupEntry.groupTotal.toLocaleString()}원
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                    {isDeductionPaid && !isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // 그 그룹의 원거래 detail (위약금 재결제 detail 이 아닌 것) 찾기
                                                let origDetail: PaymentDetailBreakdown | undefined;
                                                let rePayDetail: PaymentDetailBreakdown | undefined;
                                                for (const c of groupEntry.cards) {
                                                    for (const pd of c.itemPaymentDetails) {
                                                        if (pd.memo && pd.memo.startsWith("위약금 재결제")) {
                                                            if (!rePayDetail) rePayDetail = pd;
                                                        } else if ((pd.paymentType === "CARD" || pd.paymentType === "PAY") && !origDetail) {
                                                            origDetail = pd;
                                                        }
                                                    }
                                                }
                                                if (!origDetail) {
                                                    showAlert({ message: "원거래 detail 을 찾을 수 없습니다. 운영자 문의 필요.", type: "error" });
                                                    return;
                                                }
                                                setRetryRefundState({
                                                    paymentMasterId: groupEntry.cards[0]?.record.paymentMasterId ?? groupEntry.cards[0]?.record.id ?? 0,
                                                    originPaymentDetailId: origDetail.id,
                                                    rePaymentDetailId: rePayDetail?.id,
                                                    originAmount: origDetail.amount,
                                                    originPaymentType: origDetail.paymentType,
                                                    terminalInfo: {
                                                        authNo: origDetail.terminalAuthNo,
                                                        authDate: origDetail.terminalAuthDate,
                                                        vanKey: origDetail.terminalVanKey,
                                                    },
                                                });
                                            }}
                                            className="rounded-lg bg-amber-100 border border-amber-300 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-200 transition-colors"
                                            title="원거래 단말기에서 취소 후 이 버튼으로 마무리"
                                        >
                                            원거래 취소 재시도
                                        </button>
                                    )}
                                    {!isDeductionPaid && !isReadOnly && eligibleInGroup.length > 0 && groupEntry.groupStatus !== "refunded" && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const selections: UnifiedRefundSelection[] = eligibleInGroup.map((c) => {
                                                    const pd = c.itemPaymentDetails[0];
                                                    return {
                                                        paymentMasterId: c.record.paymentMasterId || c.record.id,
                                                        paymentDetailId: pd.id,
                                                        itemType: c.itemType as "ticket" | "membership",
                                                        itemName: c.itemName,
                                                        paymentType: pd.paymentType,
                                                        terminalInfo: (pd.terminalAuthNo || pd.terminalAuthDate || pd.terminalVanKey)
                                                            ? { authNo: pd.terminalAuthNo, authDate: pd.terminalAuthDate, vanKey: pd.terminalVanKey, catId: pd.terminalCatId }
                                                            : undefined,
                                                    };
                                                });
                                                if (selections.length > 0) setUnifiedModalState(selections);
                                            }}
                                            className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 transition-colors"
                                            title={`이 수납 전체 환불 (티켓 ${eligibleInGroup.length}건)`}
                                        >
                                            수납 환불 ({eligibleInGroup.length})
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Group items */}
                            <div className="divide-y divide-slate-100">
                                {(() => {
                                    const sessionMemberships = new Map<number, string>();
                                    for (const c of groupEntry.cards) {
                                        if (c.itemType === "membership") {
                                            for (const pd of c.itemPaymentDetails) {
                                                if (pd.membershipId) {
                                                    sessionMemberships.set(pd.membershipId, pd.membershipName || c.itemName);
                                                }
                                            }
                                        }
                                    }
                                    const ticketsConsumingMembership = new Map<number, number>();
                                    const ticketToMembership = new Map<string, number>();
                                    for (const c of groupEntry.cards) {
                                        if (c.itemType === "ticket") {
                                            const memIds = new Set<number>();
                                            for (const pd of c.itemPaymentDetails) {
                                                if ((pd.paymentType === "MEMBERSHIP_CASH" || pd.paymentType === "MEMBERSHIP_POINT") && pd.membershipId) {
                                                    memIds.add(pd.membershipId);
                                                }
                                            }
                                            for (const mid of memIds) {
                                                ticketsConsumingMembership.set(mid, (ticketsConsumingMembership.get(mid) ?? 0) + 1);
                                            }
                                            const first = memIds.values().next().value;
                                            if (first !== undefined) ticketToMembership.set(c.id, first);
                                        }
                                    }

                                    const orderedCards: Array<typeof groupEntry.cards[number] & { __parentMembershipId?: number }> = [];
                                    const consumedCardIds = new Set<string>();
                                    for (const c of groupEntry.cards) {
                                        if (c.itemType === "membership") {
                                            orderedCards.push(c);
                                            const memId = c.itemPaymentDetails.find(pd => pd.membershipId)?.membershipId;
                                            if (memId !== undefined) {
                                                for (const t of groupEntry.cards) {
                                                    if (t.itemType === "ticket" && ticketToMembership.get(t.id) === memId && !consumedCardIds.has(t.id)) {
                                                        orderedCards.push(Object.assign({}, t, { __parentMembershipId: memId }));
                                                        consumedCardIds.add(t.id);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    for (const c of groupEntry.cards) {
                                        if (c.itemType !== "membership" && !consumedCardIds.has(c.id)) {
                                            orderedCards.push(c);
                                        }
                                    }

                                    return orderedCards.map((card) => {
                    const isRefunded = card.status === "refunded";
                    const isTicket = card.itemType === "ticket";
                    const isMembership = card.itemType === "membership";
                    const clientBlockReason = getRefundClientBlockReason(card.record);
                    const ownMembershipId = isMembership ? card.itemPaymentDetails.find(pd => pd.membershipId)?.membershipId : undefined;
                    const consumedTicketCount = ownMembershipId ? (ticketsConsumingMembership.get(ownMembershipId) ?? 0) : 0;
                    const hasParent = (card as any).__parentMembershipId != null;

                    const paidAmount = card.itemPaymentDetails.length > 0
                        ? card.itemPaymentDetails.reduce((sum, pd) => sum + pd.amount, 0)
                        : card.discountedPrice ?? card.eventPrice ?? card.originalPrice ?? card.totalPrice;
                    const isExpanded = expandedCardIds.has(card.id);
                    const groupCheck = refundCheckByGroupId[card.group.id];
                    const cardDetailIds = card.itemPaymentDetails.map(pd => pd.id);
                    const matchedItem = groupCheck?.items?.find(
                        (it) => (it.paymentDetailIds ?? [it.paymentDetailId]).some(id => cardDetailIds.includes(id))
                    );

                    return (
                        <div key={card.id} className={`${isRefunded ? "bg-red-50/30" : hasParent ? "bg-violet-50/30 hover:bg-violet-50/60" : "bg-white hover:bg-slate-50/60"} transition-colors ${hasParent ? "border-l-[3px] border-l-violet-300" : ""}`}>
                            {/* Compact row (2-line) */}
                            <div className={`${hasParent ? "pl-6 pr-3" : "px-3"} py-2 flex items-start gap-2`}>
                                {!isRefunded && !clientBlockReason && !isReadOnly && card.itemPaymentDetails[0]?.id && (isTicket || isMembership) ? (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); toggleCardSelected(card.id); }}
                                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                                            selectedCardKeys.has(card.id)
                                                ? "border-[#D27A8C] bg-[#D27A8C]"
                                                : "border-slate-300 bg-white hover:border-[#D27A8C]"
                                        }`}
                                        title={selectedCardKeys.has(card.id) ? "선택 해제" : "일괄 환불 대상으로 선택"}
                                    >
                                        {selectedCardKeys.has(card.id) && (
                                            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                    </button>
                                ) : (
                                    <div className="w-4 shrink-0" />
                                )}

                                <div className="min-w-0 flex-1">
                                    {/* Line 1: badges + time */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none shrink-0 ${isTicket ? "bg-pink-50 text-pink-700 border border-pink-200" : isMembership ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-slate-100 text-slate-600"}`}>
                                            {isTicket ? "티켓" : isMembership ? "회원권" : "결제"}
                                        </span>
                                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none shrink-0 ${isRefunded ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                                            {isRefunded ? "환불" : "정상"}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(card.paidAt).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>
                                    {/* Line 2: name */}
                                    <div className={`mt-1 text-[13px] font-semibold break-words ${isRefunded ? "text-slate-400 line-through" : "text-slate-800"}`} title={card.itemName}>
                                        {card.itemName}{card.quantity > 1 ? ` x${card.quantity}` : ""}
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <div className={`text-[13px] font-extrabold tabular-nums whitespace-nowrap ${isRefunded ? "text-slate-400 line-through" : "text-slate-900"}`}>
                                        {(paidAmount ?? 0).toLocaleString()}원
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                    {card.itemPaymentDetails[0]?.id && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // 그 티켓이 속한 PaymentMaster 의 모든 detail 을 한 화면에서 보여주기
                                                const seen = new Set<number>();
                                                const allDetails: PaymentDetailBreakdown[] = [];
                                                for (const c of (card.group?.records ?? []).flatMap(r => r.items ?? [])) {
                                                    for (const pd of (c.paymentDetails ?? [])) {
                                                        if (!seen.has(pd.id)) {
                                                            seen.add(pd.id);
                                                            allDetails.push(pd);
                                                        }
                                                    }
                                                }
                                                const focused = card.itemPaymentDetails[0]?.id;
                                                setPaymentInfoModal({
                                                    details: allDetails.length > 0 ? allDetails : card.itemPaymentDetails,
                                                    paymentTime: card.record.paidAt,
                                                    receiptUserName: card.record.collectorName,
                                                    focusedDetailId: focused,
                                                });
                                            }}
                                            className="rounded px-2 py-1 text-[10px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF] transition-colors"
                                            title="수납 정보 보기/수정"
                                        >
                                            정보
                                        </button>
                                    )}
                                    {!isRefunded && !clientBlockReason && !isReadOnly && isMembership && card.itemPaymentDetails[0]?.id && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setSettlementModalState({ paymentDetailId: card.itemPaymentDetails[0].id, membershipName: card.itemName }); }}
                                            className="rounded px-2 py-1 text-[10px] font-bold text-[#8B3F50] hover:bg-[#FCEBEF] transition-colors"
                                            title="회원권 정산 환불"
                                        >
                                            정산
                                        </button>
                                    )}
                                    {(() => {
                                        // 카드/페이로 결제된 티켓은 티켓별 환불 불가 (수납 단위 환불만 허용 — 새 2단계 패턴 안전성)
                                        // 회원권 차감 / 현금 / 계좌이체 티켓만 티켓별 환불 가능
                                        const hasTerminalPayment = card.itemPaymentDetails.some(
                                            pd => pd.paymentType === "CARD" || pd.paymentType === "PAY"
                                        );
                                        if (isRefunded || clientBlockReason || isReadOnly || isMembership || hasTerminalPayment) return null;
                                        return (
                                            <button
                                                type="button"
                                                disabled={refundingPaymentId === card.record.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const detailId = card.itemPaymentDetails[0]?.id;
                                                    if (!detailId) { void onRefund(card.record, card.itemName, 0); return; }
                                                    const detailBd = card.itemPaymentDetails.find(d => d.id === detailId) ?? card.itemPaymentDetails[0];
                                                    setRefundModalState({
                                                        paymentMasterId: card.record.paymentMasterId || card.record.id,
                                                        paymentDetailId: detailId,
                                                        itemName: card.itemName,
                                                        itemType: card.itemType,
                                                        paymentType: detailBd?.paymentType,
                                                        terminalInfo: detailBd ? {
                                                            authNo: detailBd.terminalAuthNo,
                                                            authDate: detailBd.terminalAuthDate,
                                                            vanKey: detailBd.terminalVanKey,
                                                        } : undefined,
                                                    });
                                                }}
                                                className="rounded px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                                title="환불"
                                            >
                                                환불
                                            </button>
                                        );
                                    })()}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); toggleCardExpanded(card.id); }}
                                        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                        title={isExpanded ? "접기" : "펼치기"}
                                    >
                                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    </button>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                                <div className="px-3 pb-3 pl-12 space-y-2 border-t border-slate-100 bg-slate-50/40">
                                    <div className="pt-2 text-[10px] text-slate-500">
                                        {new Date(card.paidAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                        {card.collectorName ? ` · ${card.collectorName}` : ""}
                                    </div>

                                    {(card.originalPrice != null || card.eventPrice != null) && (
                                        <div className="rounded-md bg-white border border-slate-200 px-2.5 py-1.5 space-y-0.5">
                                            {card.originalPrice != null && (
                                                <div className="flex justify-between text-[11px]"><span className="text-slate-500">정가</span><span className="tabular-nums text-slate-700">{card.originalPrice.toLocaleString()}원</span></div>
                                            )}
                                            {card.eventPrice != null && card.eventPrice !== card.originalPrice && (
                                                <div className="flex justify-between text-[11px]"><span className="text-slate-500">이벤트가</span><span className="tabular-nums text-slate-700">{card.eventPrice.toLocaleString()}원</span></div>
                                            )}
                                            {(() => {
                                                const basePrice = card.eventPrice ?? card.originalPrice;
                                                const discounted = card.discountedPrice;
                                                if (basePrice == null || discounted == null || basePrice === discounted) return null;
                                                const discountAmount = basePrice - discounted;
                                                return (
                                                    <div className="flex justify-between text-[11px]"><span className="text-rose-500">할인{card.discountPercent ? ` (${card.discountPercent}%)` : ""}</span><span className="tabular-nums font-bold text-rose-500">-{discountAmount.toLocaleString()}원</span></div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {card.itemPaymentDetails.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {(() => {
                                                const chipConfig: Record<string, { bg: string; color: string; border: string; label: (pd: any) => string }> = {
                                                    MEMBERSHIP_CASH: { bg: "#EDE7F6", color: "#6A1B9A", border: "#CE93D8", label: (pd) => { const s = pd.membershipId ? sessionMemberships.get(pd.membershipId) : undefined; return s ? `↑ ${s} 현금` : "회원권(현금)"; } },
                                                    MEMBERSHIP_POINT: { bg: "#F3E5F5", color: "#7B1FA2", border: "#CE93D8", label: (pd) => { const s = pd.membershipId ? sessionMemberships.get(pd.membershipId) : undefined; return s ? `↑ ${s} 포인트` : "회원권(포인트)"; } },
                                                    CARD: { bg: "#E3F2FD", color: "#1565C0", border: "#90CAF9", label: (pd) => `카드${pd.cardCompany ? `(${pd.cardCompany})` : ""}` },
                                                    CASH: { bg: "#E8F5E9", color: "#2E7D32", border: "#A5D6A7", label: () => "현금" },
                                                    BANKING: { bg: "#FFF8E1", color: "#F57F17", border: "#FFE082", label: () => "이체" },
                                                    PAY: { bg: "#E0F7FA", color: "#00838F", border: "#80DEEA", label: (pd) => pd.paymentSubMethodLabel || "간편결제" },
                                                };
                                                const defaultCfg = { bg: "#F5F5F5", color: "#616161", border: "#E0E0E0", label: (pd: any) => pd.paymentType };
                                                const grouped = new Map<string, { amount: number; cfg: typeof defaultCfg; label: string }>();
                                                for (const pd of card.itemPaymentDetails) {
                                                    const cfg = chipConfig[pd.paymentType] || defaultCfg;
                                                    const label = cfg.label(pd);
                                                    const key = `${pd.paymentType}_${label}`;
                                                    const existing = grouped.get(key);
                                                    if (existing) existing.amount += pd.amount;
                                                    else grouped.set(key, { amount: pd.amount, cfg, label });
                                                }
                                                return Array.from(grouped.entries()).map(([key, { amount, cfg, label }]) => (
                                                    <div key={key} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px]" style={{ backgroundColor: cfg.bg, borderWidth: 1, borderStyle: "solid", borderColor: cfg.border, color: cfg.color }}>
                                                        <span className="font-bold">{label}</span>
                                                        <span className="tabular-nums font-extrabold">{amount.toLocaleString()}원</span>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    )}

                                    {isMembership && consumedTicketCount > 0 && (
                                        <div className="inline-flex items-center rounded-full px-2 py-0.5 bg-violet-50 border border-violet-200 text-[10px] font-bold text-violet-700">
                                            ↓ 이 세션에서 티켓 {consumedTicketCount}건 차감
                                        </div>
                                    )}

                                    {isRefunded && matchedItem && (
                                        <div className="flex justify-between items-center text-[12px] px-1">
                                            <span className="font-semibold text-red-600">환불지급액</span>
                                            <span className="tabular-nums font-extrabold text-red-600">{matchedItem.estimatedRefund.toLocaleString()}원</span>
                                        </div>
                                    )}
                                    {!isRefunded && matchedItem && (
                                        <div className="text-[10px] text-slate-400 italic px-1">사용 {matchedItem.usedCount}회 · 위약금/환불액은 환불 모달에서 확인</div>
                                    )}

                                    {card.itemPaymentDetails.some(pd => pd.memo) && (
                                        <div className="text-[10px] text-slate-500 italic px-1">메모: {card.itemPaymentDetails.find(pd => pd.memo)?.memo}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                });
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>
            {paymentInfoModal && (
                <PaymentInfoModal
                    open
                    details={paymentInfoModal.details}
                    paymentTime={paymentInfoModal.paymentTime}
                    receiptUserName={paymentInfoModal.receiptUserName}
                    focusedDetailId={paymentInfoModal.focusedDetailId}
                    onClose={() => setPaymentInfoModal(null)}
                    onUpdated={() => {
                        setPaymentInfoModal(null);
                        if (typeof onRefundCompleted === "function") {
                            void onRefundCompleted();
                        }
                    }}
                />
            )}
            {retryRefundState && (() => {
                const s = retryRefundState;
                const closeRetry = () => setRetryRefundState(null);
                const handleManualClose = async () => {
                    if (retryRefundSubmitting) return;
                    const proceed = await showConfirm({
                        message: "원거래 카드 취소를 다른 단말기에서 직접 완료하셨습니까?\n\n[확인] 시 시스템 환불 마감만 진행됩니다.\n단말기 호출은 하지 않습니다.",
                        type: "warning",
                        confirmText: "수동 마감",
                        cancelText: "취소",
                    });
                    if (!proceed) return;
                    setRetryRefundSubmitting(true);
                    try {
                        await paymentService.finalizeRefund(s.paymentMasterId, {
                            originPaymentDetailId: s.originPaymentDetailId,
                            rePaymentDetailId: s.rePaymentDetailId,
                            refundType: "customer_change",
                            terminalRefundAuthNo: undefined,
                            terminalRefundDate: undefined,
                            terminalVanKey: undefined,
                            refundMethod: "MANUAL",
                        });
                        showAlert({ message: "환불 처리가 완료되었습니다 (수동 마감).", type: "success" });
                        closeRetry();
                        if (typeof onRefundCompleted === "function") void onRefundCompleted();
                    } catch (e: any) {
                        showAlert({ message: `수동 마감 실패: ${e?.response?.data?.message || e?.message || "오류"}`, type: "error" });
                    } finally {
                        setRetryRefundSubmitting(false);
                    }
                };
                const handleRetry = async () => {
                    if (retryRefundSubmitting) return;
                    if (!s.terminalInfo?.authNo || !s.terminalInfo?.authDate || !s.terminalInfo?.vanKey) {
                        showAlert({ message: "원거래 단말기 정보(승인번호/거래일시/VANKEY) 부족. [수납 정보] 에서 입력 후 재시도하세요.", type: "warning" });
                        return;
                    }
                    setRetryRefundSubmitting(true);
                    try {
                        const manualMode = isManualPaymentMode();
                        const ok = manualMode ? false : await kisTerminalService.connect().catch(() => false);
                        if (!ok) {
                            const proceed = manualMode ? true : await showConfirm({
                                message: "단말기 연결 실패. 수동 처리(단말기 호출 없이 시스템만 환불 마감) 로 진행하시겠습니까?\n\n※ 원거래 카드 환불은 직원이 그 단말기에서 직접 수행한 상태여야 합니다.",
                                type: "warning",
                                confirmText: "수동 마감",
                                cancelText: "취소",
                            });
                            if (!proceed) { setRetryRefundSubmitting(false); return; }
                            // 수동 마감: terminal 호출 없이 finalize 만
                            await paymentService.finalizeRefund(s.paymentMasterId, {
                                originPaymentDetailId: s.originPaymentDetailId,
                                rePaymentDetailId: s.rePaymentDetailId,
                                refundType: "customer_change",
                                terminalRefundAuthNo: undefined,
                                terminalRefundDate: undefined,
                                terminalVanKey: undefined,
                                refundMethod: "MANUAL",
                            });
                            showAlert({ message: "환불 처리가 완료되었습니다 (수동 마감).", type: "success" });
                            closeRetry();
                            if (typeof onRefundCompleted === "function") void onRefundCompleted();
                            return;
                        }
                        const tradeRefType = (s.originPaymentType?.toUpperCase() === "PAY") ? "v2" as const : "D2" as const;
                        const r = await kisTerminalService.requestRefund({
                            tradeType: tradeRefType,
                            amount: s.originAmount,
                            orgAuthDate: s.terminalInfo.authDate!,
                            orgAuthNo: s.terminalInfo.authNo!,
                            vanKey: s.terminalInfo.vanKey!,
                        });
                        if (!r.success) {
                            showAlert({ message: `단말기 원거래 취소 실패: ${r.displayMsg || r.replyCode}\n\nDEDUCTION_PAID 상태 그대로 유지됩니다.`, type: "error" });
                            return;
                        }
                        await paymentService.finalizeRefund(s.paymentMasterId, {
                            originPaymentDetailId: s.originPaymentDetailId,
                            rePaymentDetailId: s.rePaymentDetailId,
                            refundType: "customer_change",
                            terminalRefundAuthNo: r.authNo,
                            terminalRefundDate: r.replyDate,
                            terminalVanKey: r.vanKey,
                            refundMethod: "AUTO",
                        });
                        showAlert({ message: "환불 처리가 완료되었습니다.", type: "success" });
                        closeRetry();
                        if (typeof onRefundCompleted === "function") void onRefundCompleted();
                    } catch (e: any) {
                        showAlert({ message: `재시도 실패: ${e?.response?.data?.message || e?.message || "오류"}`, type: "error" });
                    } finally {
                        setRetryRefundSubmitting(false);
                    }
                };
                return createPortal(
                    <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] px-4" onClick={(e) => { if (e.target === e.currentTarget) closeRetry(); }}>
                        <div className="w-full max-w-[460px] rounded-2xl border border-amber-200 bg-white shadow-2xl overflow-hidden">
                            <div className="border-b border-amber-200 px-5 py-3 bg-amber-50">
                                <div className="text-[15px] font-extrabold text-amber-900">원거래 취소 재시도</div>
                                <div className="text-[11px] text-amber-700 mt-0.5">위약금 결제는 완료되어 있고, 원거래 카드 취소만 마무리합니다.</div>
                            </div>
                            <div className="px-5 py-4 space-y-2 text-[13px]">
                                <div className="flex justify-between"><span className="text-[#8B5A66]">원거래 detail #</span><span className="font-bold tabular-nums">{s.originPaymentDetailId}</span></div>
                                <div className="flex justify-between"><span className="text-[#8B5A66]">취소 금액</span><span className="font-extrabold tabular-nums text-amber-700">{s.originAmount.toLocaleString()}원</span></div>
                                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 leading-relaxed mt-2">
                                    이 버튼을 누르면 KIS 단말기에 원거래 취소 요청을 보냅니다.<br/>
                                    원결제와 <b>같은 단말기</b>여야 자동 처리됩니다. 다른 단말기에서 직접 취소했다면 [수동 마감] 으로 진행하세요.
                                </div>
                            </div>
                            <div className="border-t border-amber-200 px-5 py-3 bg-amber-50/50 flex justify-end gap-2 flex-wrap">
                                <button type="button" onClick={closeRetry} disabled={retryRefundSubmitting} className="h-9 rounded-lg border border-amber-200 bg-white px-4 text-[12px] font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50">취소</button>
                                <button type="button" onClick={() => void handleManualClose()} disabled={retryRefundSubmitting} className="h-9 rounded-lg border border-amber-300 bg-white px-4 text-[12px] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50">{retryRefundSubmitting ? "처리 중..." : "수동 마감"}</button>
                                <button type="button" onClick={() => void handleRetry()} disabled={retryRefundSubmitting} className="h-9 rounded-lg bg-amber-600 px-4 text-[12px] font-extrabold text-white hover:bg-amber-700 disabled:opacity-50">{retryRefundSubmitting ? "처리 중..." : "단말기 취소 + 마무리"}</button>
                            </div>
                        </div>
                    </div>,
                    document.body
                );
            })()}
            {refundModalState && (
                <RefundModal
                    open
                    paymentMasterId={refundModalState.paymentMasterId}
                    paymentDetailId={refundModalState.paymentDetailId}
                    itemName={refundModalState.itemName}
                    itemType={refundModalState.itemType}
                    paymentType={refundModalState.paymentType}
                    terminalInfo={refundModalState.terminalInfo}
                    onClose={() => setRefundModalState(null)}
                    onRefunded={() => {
                        setRefundModalState(null);
                        setRefundCheckByRecordId({});
                        setRefundCheckByGroupId({});
                        if (typeof onRefundCompleted === "function") {
                            void onRefundCompleted();
                        }
                    }}
                />
            )}

            {/* ISSUE-174: Bulk refund modal */}
            {bulkModalState && (
                <BulkRefundModal
                    open
                    items={bulkModalState}
                    onClose={() => setBulkModalState(null)}
                    onRefunded={() => {
                        setBulkModalState(null);
                        setSelectedCardKeys(new Set());
                        setRefundCheckByRecordId({});
                        setRefundCheckByGroupId({});
                        if (typeof onRefundCompleted === "function") {
                            void onRefundCompleted();
                        }
                    }}
                />
            )}

            {/* ISSUE-174: Membership settlement modal */}
            {settlementModalState && (
                <MembershipSettlementModal
                    open
                    paymentDetailId={settlementModalState.paymentDetailId}
                    membershipName={settlementModalState.membershipName}
                    onClose={() => setSettlementModalState(null)}
                    onRefunded={() => {
                        setSettlementModalState(null);
                        setRefundCheckByRecordId({});
                        setRefundCheckByGroupId({});
                        if (typeof onRefundCompleted === "function") {
                            void onRefundCompleted();
                        }
                    }}
                />
            )}

            {/* ISSUE-176: Unified refund modal */}
            {unifiedModalState && (
                <UnifiedRefundModal
                    open
                    selections={unifiedModalState}
                    onClose={() => setUnifiedModalState(null)}
                    onCompleted={() => {
                        setUnifiedModalState(null);
                        setSelectedCardKeys(new Set());
                        setRefundCheckByRecordId({});
                        setRefundCheckByGroupId({});
                        if (typeof onRefundCompleted === "function") {
                            void onRefundCompleted();
                        }
                    }}
                />
            )}
        </div>
    );
}

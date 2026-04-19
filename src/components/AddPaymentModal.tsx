import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CreditCard, Monitor, MoreHorizontal, Plus, Smartphone, Wallet, X } from "lucide-react";
import { memberConfigService } from "../services/memberConfigService";
import {
  paymentService,
  type CashReceiptIdentifierType,
  type CashReceiptPurpose,
  type PaymentOperationSummary,
  type SyncPaymentOperationLegRequest,
} from "../services/paymentService";
import { useAuthStore } from "../stores/useAuthStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { resolveActiveBranchId } from "../utils/branch";
import { kisTerminalService } from "../services/kisTerminalService";
import { isManualPaymentMode, getTerminalMode } from "../utils/terminalMode";
import {
  findPaymentOperationContextByMaster,
  findPaymentOperationContextsByPatient,
  removePaymentOperationContext,
  upsertPaymentOperationContext,
} from "../lib/storage";
import { useAlert } from "./ui/AlertDialog";

interface AddPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  onAddPayment: (payment: any) => void | Promise<any>;
  patientPhone?: string;
  patientId?: number;
  paymentMasterId?: number;
  resumeOperation?: PaymentOperationSummary | null;
}

type PaymentMode = "terminal" | "manual";

type PaymentCategory = "card" | "cash" | "pay" | "platform" | "other";
type CashReceiptType = CashReceiptPurpose;

type PaymentOption = {
  value: string;
  label: string;
};

type SplitPaymentLine = {
  clientLegKey: string;
  method: PaymentCategory;
  paymentCategory: PaymentCategory;
  paymentSubMethod: string;
  paymentSubMethodLabel: string;
  amount: number;
  memo?: string;
  assignee?: string;
  cardCompany?: string;
  installment?: string;
  approvalNumber?: string;
  cashReceipt?: {
    enabled: boolean;
    purpose?: CashReceiptPurpose;
    type?: CashReceiptPurpose;
    identifierType?: CashReceiptIdentifierType;
    identifierValue?: string;
    identity?: string;
  };
  terminalAuthNo?: string;
  terminalAuthDate?: string;
  terminalCardNo?: string;
  terminalIssuerName?: string;
  terminalAccepterName?: string;
  terminalTranNo?: string;
  terminalVanKey?: string;
  terminalCatId?: string;
  terminalMerchantRegNo?: string;
};

const CATEGORY_OPTIONS: Array<{ value: PaymentCategory; label: string; icon: React.ReactNode }> = [
  { value: "card", label: "카드", icon: <CreditCard className="h-4 w-4" /> },
  { value: "cash", label: "현금", icon: <Wallet className="h-4 w-4" /> },
  { value: "pay", label: "페이", icon: <Smartphone className="h-4 w-4" /> },
  { value: "platform", label: "플랫폼", icon: <Monitor className="h-4 w-4" /> },
  { value: "other", label: "기타", icon: <MoreHorizontal className="h-4 w-4" /> },
];

const DETAIL_OPTIONS: Record<PaymentCategory, PaymentOption[]> = {
  card: [
    { value: "card_general", label: "일반카드" },
    { value: "samsung_pay", label: "삼성페이" },
    { value: "apple_pay", label: "애플페이" },
    { value: "card_keyed", label: "수기결제" },
  ],
  cash: [
    { value: "cash_counter", label: "창구수납" },
    { value: "account_transfer", label: "계좌이체" },
  ],
  pay: [
    { value: "seoulpay", label: "서울페이" },
    { value: "zeropay", label: "제로페이" },
    { value: "local_currency", label: "지역화폐" },
    { value: "kakao", label: "카카오페이" },
    { value: "naver", label: "네이버페이" },
    { value: "toss", label: "토스페이" },
    { value: "alipay", label: "알리페이" },
    { value: "wechat", label: "위챗페이" },
  ],
  platform: [
    { value: "naver_booking", label: "네이버예약" },
    { value: "gangnamunni", label: "강남언니" },
    { value: "yeoshin_ticket", label: "여신티켓" },
    { value: "babitalk", label: "바비톡" },
  ],
  other: [{ value: "etc", label: "기타" }],
};

const CARD_COMPANIES = ["KB국민", "신한", "삼성", "현대", "롯데", "우리", "하나", "NH농협", "BC", "기타"];
const INSTALLMENT_OPTIONS = ["일시불", "2개월", "3개월", "4개월", "5개월", "6개월"];

function parseNumeric(value: string): number {
  const cleaned = value.replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  return Number.parseInt(cleaned, 10) || 0;
}

function parseNumericInput(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  return String(Number.parseInt(cleaned, 10));
}

function formatWon(amount: number): string {
  return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")}원`;
}

function createClientKey(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

function isRetryableOperationLeg(status?: string): boolean {
  return ["pending", "in_progress", "failed", "unknown", "needs_manual_action"].includes(String(status || "").toLowerCase());
}

function createResumeLine(leg: PaymentOperationSummary["legs"][number]): SplitPaymentLine {
  return {
    clientLegKey: leg.legKey,
    method: (leg.paymentCategory || "card") as PaymentCategory,
    paymentCategory: (leg.paymentCategory || "card") as PaymentCategory,
    paymentSubMethod: leg.paymentSubMethod || "",
    paymentSubMethodLabel: leg.paymentSubMethodLabel || "",
    amount: Math.max(0, Math.round(leg.requestedAmount || 0)),
    memo: undefined,
    assignee: undefined,
    cardCompany: undefined,
    installment: undefined,
    approvalNumber: leg.terminalAuthNo,
    terminalAuthNo: leg.terminalAuthNo,
    terminalAuthDate: leg.terminalAuthDate,
    terminalVanKey: leg.terminalVanKey,
    terminalCatId: leg.terminalCatId,
  };
}

function nextActionLabel(code: string | undefined): string {
  switch (code) {
    case "verify_terminal": return "단말기에서 승인됐는지 확인";
    case "manual_close": return "수기로 마감 처리";
    case "retry_leg": return "실패한 결제 다시 시도";
    case "resume_checkout": return "남은 금액 마저 결제하기";
    case "resume_refund": return "남은 환불 마저 처리하기";
    case "finalize_refund": return "환불 마무리 저장";
    case "none": return "처리 완료";
    default: return code || "-";
  }
}

function resolveOperationSnapshot(
  legs: SyncPaymentOperationLegRequest[],
  completedAmount: number,
  totalAmount: number,
  fallbackSummary: string,
): {
  status: "in_progress" | "unknown" | "needs_manual_action" | "completed";
  nextAction: "resume_checkout" | "verify_terminal" | "manual_close" | "retry_leg" | "none";
  summaryMessage: string;
  remainingAmount: number;
} {
  const hasUnknown = legs.some((leg) => leg.status === "unknown");
  const hasManualAction = legs.some((leg) => leg.status === "needs_manual_action");
  const hasFailed = legs.some((leg) => leg.status === "failed");
  const hasPending = legs.some((leg) => leg.status === "pending" || leg.status === "in_progress");
  const remainingAmount = Math.max(0, totalAmount - completedAmount);

  if (hasUnknown) {
    return {
      status: "unknown",
      nextAction: "verify_terminal",
      summaryMessage: "단말기 응답 확인이 필요한 결제선이 있습니다.",
      remainingAmount,
    };
  }

  if (hasManualAction) {
    return {
      status: "needs_manual_action",
      nextAction: "manual_close",
      summaryMessage: "수기 확인 또는 수동 마감이 필요한 결제선이 있습니다.",
      remainingAmount,
    };
  }

  if (hasFailed || hasPending || remainingAmount > 0) {
    return {
      status: "in_progress",
      nextAction: hasFailed ? "retry_leg" : "resume_checkout",
      summaryMessage: fallbackSummary,
      remainingAmount,
    };
  }

  return {
    status: "completed",
    nextAction: "none",
    summaryMessage: "결제가 완료되었습니다.",
    remainingAmount: 0,
  };
}

function roundRatio(part: number, total: number, amount: number): number {
  if (total <= 0 || amount <= 0 || part <= 0) return 0;
  return Math.round((part / total) * amount);
}

function FancySelect({
  value,
  options,
  onChange,
  placeholder = "선택",
  emptyLabel,
  disabled,
}: {
  value: string;
  options: PaymentOption[];
  onChange: (nextValue: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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
  const display = selected?.label || emptyLabel || placeholder;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        className={`flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm transition ${disabled ? "cursor-not-allowed text-slate-400" : "text-slate-700 hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"}`}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        <span className={`truncate ${selected ? "font-medium text-slate-700" : "text-slate-500"}`}>{display}</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {emptyLabel ? (
            <button
              type="button"
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${!value ? "bg-[rgba(var(--kkeut-primary),.12)] font-bold text-[rgb(var(--kkeut-primary-strong))]" : "text-slate-500 hover:bg-slate-50"}`}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <span className="truncate">{emptyLabel}</span>
              {!value ? <Check className="h-4 w-4" /> : null}
            </button>
          ) : null}
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${isSelected ? "bg-[rgba(var(--kkeut-primary),.12)] font-bold text-[rgb(var(--kkeut-primary-strong))]" : "text-slate-700 hover:bg-[rgba(var(--kkeut-primary),.07)]"}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? <Check className="h-4 w-4" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AddPaymentModal({
  isOpen,
  onClose,
  totalAmount,
  onAddPayment,
  patientPhone,
  patientId,
  paymentMasterId,
  resumeOperation,
}: AddPaymentModalProps) {
  const { settings } = useSettingsStore();
  const { showAlert, showConfirm } = useAlert();
  const resolvedBranchId = resolveActiveBranchId("");
  const currentUserName = useAuthStore((s) => s.userName);

  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    isManualPaymentMode() ? "manual" : "terminal"
  );
  const [category, setCategory] = useState<PaymentCategory>("card");
  const [subMethod, setSubMethod] = useState<string>("");
  const [lineAmountInput, setLineAmountInput] = useState<string>(String(Math.max(0, totalAmount)));

  const [cardCompany, setCardCompany] = useState<string>("");
  const [installment, setInstallment] = useState<string>("일시불");
  const [approvalNumber, setApprovalNumber] = useState<string>("");
  const [vanKeyInput, setVanKeyInput] = useState<string>("");
  const [deferTerminalInput, setDeferTerminalInput] = useState<boolean>(false);

  const [cashReceiptOn, setCashReceiptOn] = useState<boolean>(true);
  const [cashReceiptType, setCashReceiptType] = useState<CashReceiptType>("consumer");
  const [identityValue, setIdentityValue] = useState<string>("");

  const [assignee, setAssignee] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [taxFreeInput, setTaxFreeInput] = useState<string>("0");
  const [taxableInput, setTaxableInput] = useState<string>(String(Math.max(0, totalAmount)));

  const [lines, setLines] = useState<SplitPaymentLine[]>([]);
  const [operationKey, setOperationKey] = useState<string>("");
  const [operationSummary, setOperationSummary] = useState<PaymentOperationSummary | null>(resumeOperation ?? null);
  const [assignableMembers, setAssignableMembers] = useState<Array<{ id: string; name: string; jobTitleName?: string }>>([]);

  // KIS 단말기 연결 상태 (카드/페이 결제 시 사용자에게 시각적으로 표시)
  const [terminalConnected, setTerminalConnected] = useState<boolean>(kisTerminalService.isConnected());
  const [terminalChecking, setTerminalChecking] = useState<boolean>(false);

  // 단말기 오류 시 2-옵션 다이얼로그 (재시도 / 부분 수납 or 중단)
  type TerminalErrorChoice = "retry" | "cancel";
  const [terminalErrorDialog, setTerminalErrorDialog] = useState<{
    errorMsg: string;
    successCount: number;
    successTotal: number;
    resolve: (choice: TerminalErrorChoice) => void;
  } | null>(null);
  const askTerminalErrorChoice = (errorMsg: string, successCount: number, successTotal: number): Promise<TerminalErrorChoice> => {
    return new Promise<TerminalErrorChoice>((resolve) => {
      setTerminalErrorDialog({ errorMsg, successCount, successTotal, resolve });
    });
  };

  const refreshTerminalStatus = async () => {
    if (terminalChecking) return;
    if (isManualPaymentMode()) { setTerminalConnected(false); return; }
    setTerminalChecking(true);
    try {
      if (kisTerminalService.isConnected()) { setTerminalConnected(true); return; }
      const ok = await kisTerminalService.connect().catch(() => false);
      setTerminalConnected(!!ok);
    } finally {
      setTerminalChecking(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (isManualPaymentMode()) { setTerminalConnected(false); return; }
    void refreshTerminalStatus();
    const interval = setInterval(() => {
      setTerminalConnected(kisTerminalService.isConnected());
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setPaymentMode(isManualPaymentMode() ? "manual" : "terminal");
    setCategory("card");
    setSubMethod("");
    setLineAmountInput(String(Math.max(0, totalAmount)));
    setCardCompany("");
    setInstallment("일시불");
    setApprovalNumber(""); setVanKeyInput("");
    setDeferTerminalInput(false);
    setCashReceiptOn(true);
    setCashReceiptType("consumer");
    setIdentityValue(patientPhone?.replace(/[^0-9]/g, "") || "");
    setMemo("");
    setTaxFreeInput("0");
    setTaxableInput(String(Math.max(0, totalAmount)));
    setLines([]);
    setOperationSummary(resumeOperation ?? null);
    setSubmitting(false);
  }, [isOpen, totalAmount, patientPhone, resumeOperation]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadOperation = async () => {
      const storedByMaster = paymentMasterId
        ? findPaymentOperationContextByMaster(paymentMasterId, "add_payment_detail")
        : null;
      const storedByPatient = !paymentMasterId && patientId
        ? findPaymentOperationContextsByPatient(patientId, "checkout")[0] || null
        : null;
      const storedOperationKey = storedByMaster?.operationKey || storedByPatient?.operationKey || "";
      const nextOperationKey = resumeOperation?.operationKey
        || storedOperationKey
        || createClientKey(paymentMasterId ? `add-payment-${paymentMasterId}` : `checkout-${patientId || "unknown"}`);

      if (cancelled) return;
      setOperationKey(nextOperationKey);

      let nextOperation = resumeOperation ?? null;
      if (!nextOperation && storedOperationKey) {
        try {
          nextOperation = await paymentService.getOperationByKey(storedOperationKey);
        } catch {
          nextOperation = null;
        }
      }

      if (cancelled) return;

      if (!nextOperation || nextOperation.status === "completed") {
        if (storedOperationKey) {
          removePaymentOperationContext(storedOperationKey);
        }
        return;
      }

      setOperationSummary(nextOperation);
      upsertPaymentOperationContext({
        operationKey: nextOperation.operationKey,
        operationType: nextOperation.operationType,
        patientId,
        paymentMasterId,
        status: nextOperation.status,
        nextAction: nextOperation.nextAction,
        summaryMessage: nextOperation.summaryMessage,
      });

      const retryLines = nextOperation.legs
        .filter((leg) => leg.role === "payment" && isRetryableOperationLeg(leg.status) && leg.requestedAmount > 0)
        .sort((left, right) => left.sequence - right.sequence)
        .map(createResumeLine);

      if (retryLines.length > 0) {
        setLines(retryLines);
        setLineAmountInput("0");
      }
    };

    void loadOperation();

    return () => {
      cancelled = true;
    };
  }, [isOpen, patientId, paymentMasterId, resumeOperation]);

  useEffect(() => {
    if (paymentMode === "terminal") {
      if (category === "card") { setSubMethod("card_general"); return; }
      if (category === "pay") { setSubMethod(""); return; }
      if (category === "cash") { setSubMethod("cash_counter"); return; }
    }
    setSubMethod("");
  }, [category, paymentMode]);

  useEffect(() => {
    if (!submitting) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      try { kisTerminalService.cancelTransaction(); } catch {}
      e.preventDefault();
      e.returnValue = "단말기 결제 처리 중입니다. 페이지를 떠나면 거래가 취소됩니다.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      try { kisTerminalService.cancelTransaction(); } catch {}
    };
  }, [submitting]);

  useEffect(() => {
    if (!isOpen) return;
    const loadMembers = async () => {
      try {
        const branchId = Number(resolvedBranchId);
        if (!Number.isFinite(branchId) || branchId <= 0) {
          setAssignableMembers([]);
          setAssignee("");
          return;
        }
        const [members, jobTitles] = await Promise.all([
          memberConfigService.getMembers(branchId),
          memberConfigService.getJobTitles(),
        ]);
        const jobTitleMap = new Map<string, string>((jobTitles || []).map((j: any) => [String(j.id), String(j.name || "")]));
        const allowedJobIds = settings.chartConfig?.statusRules?.paymentAssigneeJobTitleIds || [];
        const filtered = (members || []).filter((m: any) => {
          if (m?.isApproved === false) return false;
          const jobId = String(m?.jobTitleId || "");
          const jobName = String(jobTitleMap.get(jobId) || "");
          if (allowedJobIds.length > 0) return jobId && allowedJobIds.includes(jobId);
          return !jobName.includes("코디");
        });

        const mapped = filtered.map((m: any) => {
          const jobId = String(m?.jobTitleId || "");
          return {
            id: String(m.id),
            name: String(m.name || ""),
            jobTitleName: jobTitleMap.get(jobId) || undefined,
          };
        });
        setAssignableMembers(mapped);

        const defaultAssignee = (currentUserName || "").trim();
        if (defaultAssignee && mapped.some((m) => m.name === defaultAssignee)) {
          setAssignee(defaultAssignee);
        } else {
          setAssignee(mapped[0]?.name || "");
        }
      } catch (e) {
        console.error("Failed to load payment assignees", e);
        setAssignableMembers([]);
        setAssignee("");
      }
    };
    void loadMembers();
  }, [
    isOpen,
    resolvedBranchId,
    settings.chartConfig?.statusRules?.paymentAssigneeJobTitleIds,
    currentUserName,
  ]);

  const taxFreeAmount = useMemo(() => parseNumeric(taxFreeInput), [taxFreeInput]);
  const taxableAmount = useMemo(() => parseNumeric(taxableInput), [taxableInput]);
  const lineAmount = useMemo(() => parseNumeric(lineAmountInput), [lineAmountInput]);
  const splitTotal = useMemo(() => lines.reduce((sum, l) => sum + l.amount, 0), [lines]);
  const remainingAmount = useMemo(() => Math.max(0, totalAmount - splitTotal), [totalAmount, splitTotal]);

  const selectedSubMethodLabel = useMemo(() => {
    return DETAIL_OPTIONS[category].find((opt) => opt.value === subMethod)?.label || "";
  }, [category, subMethod]);

  const taxSupply = useMemo(() => Math.round(taxableAmount / 1.1), [taxableAmount]);
  const taxVat = useMemo(() => taxableAmount - taxSupply, [taxableAmount, taxSupply]);

  // 수기 결제 모드 + 카드/페이는 승인번호 / VANKEY 수기 입력 필수 (환불 2단계 패턴 가능 조건)
  // 단말기 결제 모드는 단말기 응답에서 자동 채워지므로 불필요
  const requiresManualTerminalInput =
    paymentMode === "manual"
    && (category === "card" || category === "pay")
    && !deferTerminalInput;
  const manualTerminalInputProvided =
    !requiresManualTerminalInput
    || (!!approvalNumber.trim() && !!vanKeyInput.trim());

  const requiresSubMethodSelection = paymentMode === "manual";
  const requiresCardCompanySelection = paymentMode === "manual" && category === "card";
  const requiresCashReceiptIdentity =
    category === "cash"
    && cashReceiptOn
    && cashReceiptType !== "voluntary";
  const cashReceiptIdentityProvided =
    !requiresCashReceiptIdentity
    || normalizeDigits(identityValue).length > 0;

  const lineCanAdd =
    lineAmount > 0 &&
    lineAmount <= remainingAmount &&
    (!requiresSubMethodSelection || !!subMethod) &&
    (!requiresCardCompanySelection || !!cardCompany.trim()) &&
    manualTerminalInputProvided &&
    cashReceiptIdentityProvided;

  if (!isOpen) return null;

  const handleTaxFreeChange = (value: string) => {
    const cleaned = parseNumericInput(value);
    if (cleaned === "") {
      setTaxFreeInput("");
      setTaxableInput(String(totalAmount));
      return;
    }
    const next = Math.min(totalAmount, Number.parseInt(cleaned, 10));
    setTaxFreeInput(String(next));
    setTaxableInput(String(Math.max(0, totalAmount - next)));
  };

  const handleTaxableChange = (value: string) => {
    const cleaned = parseNumericInput(value);
    if (cleaned === "") {
      setTaxableInput("");
      setTaxFreeInput(String(totalAmount));
      return;
    }
    const next = Math.min(totalAmount, Number.parseInt(cleaned, 10));
    setTaxableInput(String(next));
    setTaxFreeInput(String(Math.max(0, totalAmount - next)));
  };

  function normalizeDigits(value: string): string {
    return value.replace(/\D/g, "").trim();
  }

  function resolveCashReceiptIdentifierType(type: CashReceiptType): CashReceiptIdentifierType {
    if (type === "business") return "business_no";
    if (type === "voluntary") return "self_issued";
    return "phone";
  }

  const todayYYYYMMDD = (() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  })();

  const buildCurrentLine = (forcedAmount?: number): SplitPaymentLine => ({
    clientLegKey: createClientKey("payment-leg"),
    method: category,
    paymentCategory: category,
    paymentSubMethod: subMethod,
    paymentSubMethodLabel: selectedSubMethodLabel,
    amount: forcedAmount ?? lineAmount,
    memo: memo.trim() || undefined,
    assignee: assignee.trim() || undefined,
    cardCompany: cardCompany.trim() || undefined,
    installment: installment.trim() || undefined,
    approvalNumber: deferTerminalInput ? undefined : (approvalNumber.trim() || undefined),
    terminalAuthNo: deferTerminalInput ? undefined : (approvalNumber.trim() || undefined),
    terminalAuthDate: !deferTerminalInput && requiresManualTerminalInput && approvalNumber.trim()
      ? todayYYYYMMDD
      : undefined,
    terminalVanKey: deferTerminalInput ? undefined : (vanKeyInput.trim() || undefined),
    cashReceipt:
      category === "cash"
        ? {
            enabled: cashReceiptOn,
            purpose: cashReceiptType,
            type: cashReceiptType,
            identifierType: resolveCashReceiptIdentifierType(cashReceiptType),
            identifierValue: cashReceiptType === "voluntary" ? undefined : (normalizeDigits(identityValue) || undefined),
            identity: cashReceiptType === "voluntary" ? undefined : (normalizeDigits(identityValue) || undefined),
          }
        : undefined,
  });

  const handleAddLine = () => {
    if (!lineCanAdd) return;
    const next = buildCurrentLine();
    setLines((prev) => [...prev, next]);
    const remain = Math.max(0, remainingAmount - lineAmount);
    setLineAmountInput(String(remain));
    setMemo("");
    setApprovalNumber(""); setVanKeyInput("");
    setDeferTerminalInput(false);
    if (paymentMode === "terminal" && category === "card") {
      setSubMethod("card_general");
    } else if (paymentMode === "terminal" && category === "cash") {
      setSubMethod("cash_counter");
    } else {
      setSubMethod("");
    }
    if (category === "card") {
      setCardCompany("");
      setInstallment("일시불");
    }
    if (category === "cash") {
      setCashReceiptOn(true);
      setCashReceiptType("consumer");
      setIdentityValue("");
    }
  };

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const buildSubmitLines = (): SplitPaymentLine[] => {
    if (totalAmount === 0) {
      // Membership-only settlement: allow immediate 0원 수납 확정.
      return [buildCurrentLine(0)];
    }

    const draftLines = [...lines];

    if (draftLines.length === 0) {
      if (lineAmount <= 0) return [];
      if (lineAmount !== totalAmount) return [];
      if (!lineCanAdd) return [];
      draftLines.push(buildCurrentLine(totalAmount));
      return draftLines;
    }

    if (remainingAmount === 0) return draftLines;
    if (lineAmount === remainingAmount && lineCanAdd) {
      draftLines.push(buildCurrentLine(remainingAmount));
      return draftLines;
    }
    return [];
  };

  const syncCurrentOperation = async (
    submitLines: SplitPaymentLine[],
    overrides: Record<string, Partial<SyncPaymentOperationLegRequest>>,
    fallbackSummary: string,
  ) => {
    if (!operationKey || !patientId) return null;

    const legMap = new Map<string, SyncPaymentOperationLegRequest>();
    for (const existingLeg of operationSummary?.legs || []) {
      if (existingLeg.role !== "payment") continue;
      legMap.set(existingLeg.legKey, {
        legKey: existingLeg.legKey,
        sequence: existingLeg.sequence,
        role: "payment",
        status: existingLeg.status as SyncPaymentOperationLegRequest["status"],
        requestedAmount: existingLeg.requestedAmount,
        completedAmount: existingLeg.completedAmount,
        paymentCategory: existingLeg.paymentCategory,
        paymentSubMethod: existingLeg.paymentSubMethod,
        paymentSubMethodLabel: existingLeg.paymentSubMethodLabel,
        isTerminalRequired: existingLeg.isTerminalRequired,
        allowManualClose: existingLeg.allowManualClose,
        originPaymentDetailId: existingLeg.originPaymentDetailId,
        resultPaymentDetailId: existingLeg.resultPaymentDetailId,
        resultRefundHistId: existingLeg.resultRefundHistId,
        terminalRequestKey: existingLeg.terminalRequestKey,
        terminalTradeKey: existingLeg.terminalTradeKey,
        terminalAuthNo: existingLeg.terminalAuthNo,
        terminalAuthDate: existingLeg.terminalAuthDate,
        terminalVanKey: existingLeg.terminalVanKey,
        terminalCatId: existingLeg.terminalCatId,
        errorMessage: existingLeg.errorMessage,
      });
    }

    submitLines.forEach((line, index) => {
      const base = legMap.get(line.clientLegKey) || {
        legKey: line.clientLegKey,
        sequence: index + 1,
        role: "payment" as const,
        status: "pending" as const,
        requestedAmount: line.amount,
        completedAmount: 0,
        paymentCategory: line.paymentCategory,
        paymentSubMethod: line.paymentSubMethod,
        paymentSubMethodLabel: line.paymentSubMethodLabel,
        isTerminalRequired: line.paymentCategory === "card" || line.paymentCategory === "pay",
        allowManualClose: true,
      };

      legMap.set(line.clientLegKey, {
        ...base,
        sequence: index + 1,
        requestedAmount: line.amount,
        paymentCategory: line.paymentCategory,
        paymentSubMethod: line.paymentSubMethod,
        paymentSubMethodLabel: line.paymentSubMethodLabel,
        terminalAuthNo: line.terminalAuthNo || line.approvalNumber || base.terminalAuthNo,
        terminalAuthDate: line.terminalAuthDate || base.terminalAuthDate,
        terminalVanKey: line.terminalVanKey || base.terminalVanKey,
        terminalCatId: line.terminalCatId || base.terminalCatId,
        ...overrides[line.clientLegKey],
      });
    });

    const nextLegs = Array.from(legMap.values()).sort((left, right) => left.sequence - right.sequence);
    const completedAmount = nextLegs.reduce((sum, leg) => sum + Number(leg.completedAmount || 0), 0);
    const snapshot = resolveOperationSnapshot(nextLegs, completedAmount, totalAmount, fallbackSummary);
    const summary = await paymentService.syncOperation({
      operationKey,
      operationType: paymentMasterId ? "add_payment_detail" : "checkout",
      status: snapshot.status,
      nextAction: snapshot.nextAction,
      customerId: patientId,
      paymentMasterId,
      requestedAmount: totalAmount,
      completedAmount,
      remainingAmount: snapshot.remainingAmount,
      summaryMessage: snapshot.summaryMessage,
      legs: nextLegs,
    });

    setOperationSummary(summary);
    if (summary.status === "completed") {
      removePaymentOperationContext(summary.operationKey);
    } else {
      upsertPaymentOperationContext({
        operationKey: summary.operationKey,
        operationType: summary.operationType,
        patientId,
        paymentMasterId: summary.paymentMasterId ?? paymentMasterId,
        status: summary.status,
        nextAction: summary.nextAction,
        summaryMessage: summary.summaryMessage,
      });
    }

    return summary;
  };

  const canSubmit = !submitting && buildSubmitLines().length > 0;

  const handleSubmit = async () => {
    const submitLines = buildSubmitLines();
    if (submitLines.length === 0) return;

    const hospitalName = settings.hospital?.hospitalNameKo || "";
    const hospitalPhone = settings.hospital?.phone || "";
    const merchantTel = hospitalName && hospitalPhone ? `${hospitalName}(${hospitalPhone})` : hospitalName || hospitalPhone || "";

    try {
      setSubmitting(true);
      await syncCurrentOperation(submitLines, {}, "결제선을 순차적으로 처리하고 있습니다.");

      const terminalLines: SplitPaymentLine[] = [];
      const manualMode = paymentMode === "manual";
      let prevTerminalSuccess = false;
      for (const line of submitLines) {
        const needsTerminal = !manualMode && (
          (line.paymentCategory === "card" && line.paymentSubMethod !== "card_keyed")
            || line.paymentCategory === "pay"
        );

        if (needsTerminal) {
          await syncCurrentOperation(submitLines, {
            [line.clientLegKey]: {
              status: "in_progress",
              errorMessage: undefined,
            },
          }, "단말기 결제를 진행하고 있습니다.");

          if (prevTerminalSuccess) {
            const nextCategoryLabel = CATEGORY_OPTIONS.find((c) => c.value === line.paymentCategory)?.label || line.paymentCategory;
            const nextSubLabel = line.paymentSubMethodLabel
              || DETAIL_OPTIONS[line.paymentCategory].find((o) => o.value === line.paymentSubMethod)?.label
              || line.paymentSubMethod
              || "";
            const ok = await showConfirm({
              title: "다음 결제로 진행",
              message: `이전 결제가 완료되었습니다.\n\n다음 결제: ${line.amount.toLocaleString()}원 · ${nextCategoryLabel}${nextSubLabel ? ` (${nextSubLabel})` : ""}\n\n이전 카드/폰을 단말기에서 빼고, 다음 결제수단 준비를 완료하신 후 [확인] 을 눌러주세요.\n→ 단말기로 결제 요청을 보냅니다.`,
              type: "info",
              confirmText: "확인 · 단말기 요청",
              cancelText: "중단",
            });
            if (!ok) { setSubmitting(false); return; }
          }

          const tradeType = line.paymentCategory === "pay" ? "v1" as const : "D1" as const;
          const installmentMap: Record<string, string> = { "일시불": "00", "2개월": "02", "3개월": "03", "4개월": "04", "5개월": "05", "6개월": "06" };
          const installment = installmentMap[line.installment || ""] || "00";

          let terminalSuccess = false;
          let cancelRemaining = false;
          // 재시도 가능 루프: 단말기 호출 실패 시 [재시도] 선택 가능
          while (!terminalSuccess && !cancelRemaining) {
            let terminalErrorMsg = "";
            try {
              const connected = await kisTerminalService.connect();
              if (!connected) {
                terminalErrorMsg = "단말기 연결 실패 — 단말기 전원 및 네트워크를 확인해 주세요.";
              } else {
                const result = await kisTerminalService.requestPayment({
                  tradeType,
                  amount: line.amount,
                  installment,
                  merchantTel,
                });
                if (result.success) {
                  const autoSubMethodLabel = line.paymentCategory === "pay" && result.issuerName
                    ? result.issuerName
                    : line.paymentSubMethodLabel;
                  terminalLines.push({
                    ...line,
                    paymentSubMethodLabel: autoSubMethodLabel,
                    approvalNumber: result.authNo,
                    cardCompany: result.issuerName || line.cardCompany,
                    terminalAuthNo: result.authNo,
                    terminalAuthDate: result.replyDate,
                    terminalCardNo: result.cardNo,
                    terminalIssuerName: result.issuerName,
                    terminalAccepterName: result.accepterName,
                    terminalTranNo: result.tranNo,
                    terminalVanKey: result.vanKey,
                    terminalCatId: result.catId,
                    terminalMerchantRegNo: result.merchantRegNo,
                  });
                  terminalSuccess = true;
                  prevTerminalSuccess = true;
                  await syncCurrentOperation(submitLines, {
                    [line.clientLegKey]: {
                      status: "succeeded",
                      completedAmount: line.amount,
                      terminalAuthNo: result.authNo,
                      terminalAuthDate: result.replyDate,
                      terminalVanKey: result.vanKey,
                      terminalCatId: result.catId,
                      errorMessage: undefined,
                    },
                  }, "성공한 결제선은 저장되고, 남은 결제선만 이어서 처리할 수 있습니다.");
                  break;
                }
                terminalErrorMsg = `단말기 승인 실패: ${result.displayMsg || `응답코드 ${result.replyCode}`}`;
              }
            } catch (termErr: any) {
              terminalErrorMsg = `단말기 통신 오류: ${termErr?.message || "알 수 없는 오류"}`;
            }

            // 실패 → 2-옵션 다이얼로그 (재시도 / 취소)
            const successTotal = terminalLines.reduce((s, l) => s + l.amount, 0);
            const choice = await askTerminalErrorChoice(terminalErrorMsg, terminalLines.length, successTotal);
            if (choice === "retry") {
              continue;
            }
            // choice === "cancel" → 부분 수납 또는 전체 중단
            cancelRemaining = true;
            const failureStatus = /통신|timeout|연결/i.test(terminalErrorMsg) ? "unknown" : "needs_manual_action";
            await syncCurrentOperation(submitLines, {
              [line.clientLegKey]: {
                status: failureStatus,
                errorMessage: terminalErrorMsg,
              },
            }, failureStatus === "unknown"
              ? "단말기 승인 여부 확인 후 남은 결제선을 이어서 처리해 주세요."
              : "남은 결제선을 다시 진행하거나 수동 마감해 주세요.");
          }
          if (cancelRemaining) {
            if (terminalLines.length > 0) {
              // 부분 수납 모드: 이 라인 이후는 처리 안 함
              break;
            }
            // 성공한 라인이 하나도 없으면 전체 중단
            return;
          }
        } else {
          terminalLines.push(line);
          await syncCurrentOperation(submitLines, {
            [line.clientLegKey]: {
              status: "succeeded",
              completedAmount: line.amount,
              errorMessage: undefined,
            },
          }, "성공한 결제선은 저장되고, 남은 결제선만 이어서 처리할 수 있습니다.");
        }
      }

      if (terminalLines.length === 0) return;

      const actualPaidTotal = terminalLines.reduce((s, l) => s + l.amount, 0);
      const isPartial = actualPaidTotal < totalAmount;

      let taxFreeRemain = taxFreeAmount;
      const withTax = terminalLines.map((line, idx) => {
        const lineTaxFree = idx === terminalLines.length - 1 ? taxFreeRemain : roundRatio(taxFreeAmount, totalAmount, line.amount);
        taxFreeRemain = Math.max(0, taxFreeRemain - lineTaxFree);
        return { ...line, taxFreeAmount: Math.max(0, lineTaxFree) };
      });
      const firstLine = withTax[0];
      if (!firstLine) return;

      const payload = {
        amount: totalAmount,
        paidAmount: actualPaidTotal,
        isPartialPayment: isPartial,
        operationKey,
        idempotencyKey: createClientKey(paymentMasterId ? "add-detail" : "checkout"),
        method: firstLine.paymentCategory,
        paymentCategory: firstLine.paymentCategory,
        paymentSubMethod: firstLine.paymentSubMethod,
        paymentSubMethodLabel: firstLine.paymentSubMethodLabel,
        taxFreeAmount,
        taxableAmount,
        vatAmount: taxVat,
        memo: firstLine.memo,
        assignee: firstLine.assignee,
        paymentLines: withTax,
      };

      const submitResult: any = await Promise.resolve(onAddPayment(payload));
      const latestOperation = submitResult?.operation ?? null;
      if (latestOperation?.operationKey) {
        setOperationSummary(latestOperation);
        if (latestOperation.status === "completed") {
          removePaymentOperationContext(latestOperation.operationKey);
        } else {
          upsertPaymentOperationContext({
            operationKey: latestOperation.operationKey,
            operationType: latestOperation.operationType,
            patientId,
            paymentMasterId: latestOperation.paymentMasterId ?? paymentMasterId,
            status: latestOperation.status,
            nextAction: latestOperation.nextAction,
            summaryMessage: latestOperation.summaryMessage,
          });
        }
      }
    } catch (e: any) {
      showAlert({ message: e?.message || "결제 처리 중 오류가 발생했습니다.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const lineSummary = (line: SplitPaymentLine) => {
    const categoryLabel = CATEGORY_OPTIONS.find((c) => c.value === line.paymentCategory)?.label || line.paymentCategory;
    const subLabel = line.paymentSubMethodLabel || line.paymentSubMethod || "상세수단 미지정";
    const parts: string[] = [categoryLabel];

    if (line.paymentCategory === "card") {
      parts.push(line.cardCompany?.trim() || "카드사 미지정");
      parts.push(subLabel);
      if (line.installment && line.installment !== "일시불") {
        parts.push(line.installment);
      }
    } else {
      parts.push(subLabel);
    }

    if (line.assignee?.trim()) {
      parts.push(line.assignee.trim());
    }

    return parts.join(" / ");
  };

  return (
    <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] p-4 animate-in fade-in duration-150">
      <div className="flex w-full max-w-[1120px] max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150">
        <div className="relative flex items-center justify-between border-b border-[#F8DCE2] px-6 py-3 bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white shrink-0">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#D27A8C] to-[#8B3F50]" />
          <div className="pl-2 min-w-0">
            <div className="text-[15px] font-extrabold text-[#5C2A35]">수납 추가</div>
            <div className="text-[11px] text-[#8B5A66]">
              {isManualPaymentMode() ? "수기 결제 모드" : "단말기 결제 모드"} · 받을 금액 {formatWon(totalAmount)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#F8DCE2] bg-white text-[#8B3F50] hover:text-[#5C2A35] hover:bg-[#FCEBEF] disabled:opacity-50 transition-all shadow-sm"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-[320px_1fr] overflow-hidden min-h-0">
          <aside className="border-r border-[#F8DCE2] bg-[#FCF7F8]/60 p-5 overflow-y-auto">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>받을 금액</span>
                  <span className="font-semibold text-slate-900">{formatWon(totalAmount)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex items-center justify-between text-slate-500">
                  <span>분할 등록 금액</span>
                  <span className="font-semibold text-slate-800">{formatWon(splitTotal)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-slate-500">남은 결제 금액</span>
                  <span className={`font-extrabold ${remainingAmount === 0 ? "text-emerald-600" : "text-blue-600"}`}>
                    {formatWon(remainingAmount)}
                  </span>
                </div>
              </div>

              {operationSummary && operationSummary.status !== "completed" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-[12px] text-amber-900">
                  <div className="font-extrabold">⏸ 중단됐던 결제가 있어요. 이어서 진행해 주세요.</div>
                  <div className="mt-1 leading-relaxed">
                    {operationSummary.summaryMessage || "이미 성공한 결제는 그대로 두고, 남은 것만 마저 처리하면 됩니다."}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5">
                      완료 {operationSummary.succeededLegCount}/{operationSummary.totalLegCount}건
                    </span>
                    <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5">
                      남은 결제 {operationSummary.pendingLegCount + operationSummary.unknownLegCount + operationSummary.manualActionLegCount}건
                    </span>
                    <span className="rounded-full border border-[#D27A8C] bg-[#FCEBEF] px-2 py-0.5 text-[#8B3F50]">
                      👉 지금 할 일: {nextActionLabel(operationSummary.nextAction)}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">비과세 결제금액</label>
                  <div className="flex items-center gap-2">
                    <input
                      value={taxFreeInput}
                      onChange={(e) => handleTaxFreeChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        setTaxFreeInput(String(totalAmount));
                        setTaxableInput("0");
                      }}
                      className="whitespace-nowrap rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                    >
                      전액
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">과세 결제금액</label>
                  <div className="flex items-center gap-2">
                    <input
                      value={taxableInput}
                      onChange={(e) => handleTaxableChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        setTaxableInput(String(totalAmount));
                        setTaxFreeInput("0");
                      }}
                      className="whitespace-nowrap rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                    >
                      전액
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  공급가 {formatWon(taxSupply)} / 부가세 {formatWon(taxVat)}
                </div>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex-1 overflow-y-auto py-5 pl-6 pr-8">
              <div className="space-y-5">
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {([
                    { value: "terminal" as const, label: "단말기 결제", desc: "단말기 응답으로 자동 입력" },
                    { value: "manual" as const, label: "직접 결제", desc: "카드사·페이·승인번호 수기 입력" },
                  ]).map((tab) => {
                    const active = paymentMode === tab.value;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => {
                          setPaymentMode(tab.value);
                          if (tab.value === "terminal" && (category === "platform" || category === "other")) {
                            setCategory("card");
                          }
                        }}
                        className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                          active
                            ? "bg-white text-blue-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                        title={tab.desc}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-blue-600">결제방법 *</label>
                    {(() => {
                      const mode = getTerminalMode();
                      if (mode === "manual") {
                        return (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                            title="설정 > 병원 > 카드 단말기 모드 에서 변경 가능"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            수기 결제 모드
                          </span>
                        );
                      }
                      if (mode === "nice") {
                        return (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            NICE 모드 (개발 예정)
                          </span>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => void refreshTerminalStatus()}
                          disabled={terminalChecking}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                            terminalConnected
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          } disabled:opacity-50`}
                          title="단말기 연결 상태 다시 확인"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${terminalConnected ? "bg-emerald-500" : "bg-rose-500"}`} />
                          {terminalChecking ? "확인 중..." : terminalConnected ? "KIS 단말기 연결됨" : "KIS 단말기 미연결"}
                        </button>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORY_OPTIONS
                      .filter((opt) => paymentMode === "manual" || (opt.value !== "platform" && opt.value !== "other"))
                      .map((opt) => {
                        const active = category === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setCategory(opt.value)}
                            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                              active
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {opt.icon}
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                  </div>
                  {paymentMode === "terminal" && (category === "card" || category === "pay") && !terminalConnected && (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 leading-snug">
                      ⚠ KIS 단말기가 연결되어 있지 않습니다. 단말기 전원/네트워크를 확인하거나, <b>직접 결제</b> 탭으로 전환해 승인번호를 수기 입력하세요.
                    </div>
                  )}
                </div>

                <div className={requiresSubMethodSelection ? "grid grid-cols-[1fr_180px_120px] gap-3" : "grid grid-cols-[1fr_120px] gap-3"}>
                  {requiresSubMethodSelection && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-blue-600">상세결제수단 *</label>
                      <FancySelect
                        value={subMethod}
                        onChange={setSubMethod}
                        options={DETAIL_OPTIONS[category]}
                        placeholder="상세결제수단 선택"
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-blue-600">결제금액 *</label>
                    <input
                      value={lineAmountInput}
                      onChange={(e) => setLineAmountInput(parseNumericInput(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="pt-[22px]">
                    <button
                      onClick={handleAddLine}
                      disabled={!lineCanAdd}
                      title={!lineCanAdd ? (() => {
                        const missing: string[] = [];
                        if (lineAmount <= 0) missing.push("결제금액");
                        if (lineAmount > remainingAmount) missing.push("남은 금액 초과");
                        if (requiresSubMethodSelection && !subMethod) missing.push("상세결제수단");
                        if (requiresCardCompanySelection && !cardCompany.trim()) missing.push("카드사");
                        if (requiresManualTerminalInput && !approvalNumber.trim()) missing.push("승인번호");
                        if (requiresManualTerminalInput && !vanKeyInput.trim()) missing.push("VANKEY");
                        return missing.length > 0 ? `필수 입력 누락: ${missing.join(", ")}` : "";
                      })() : "분할결제 라인 추가"}
                      className={`flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                        lineCanAdd ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-400"
                      }`}
                    >
                      <Plus className="h-4 w-4" />
                      추가
                    </button>
                  </div>
                </div>

                {paymentMode === "terminal" && (category === "card" || category === "pay") && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800 leading-snug">
                    ℹ️ 카드사/승인번호/VANKEY는 단말기 응답에서 자동으로 채워집니다. 별도 선택 불필요.
                  </div>
                )}

                {!lineCanAdd && lineAmount > 0 && (() => {
                  const missing: string[] = [];
                  if (lineAmount > remainingAmount) missing.push("남은 결제 금액 초과");
                  if (requiresSubMethodSelection && !subMethod) missing.push("상세결제수단");
                  if (requiresCardCompanySelection && !cardCompany.trim()) missing.push("카드사");
                  if (requiresManualTerminalInput && !approvalNumber.trim()) missing.push("승인번호");
                  if (requiresManualTerminalInput && !vanKeyInput.trim()) missing.push("VANKEY");
                  if (missing.length === 0) return null;
                  return (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                      <span className="font-bold">추가하려면 다음 항목을 입력해 주세요:</span> {missing.join(", ")}
                    </div>
                  );
                })()}

                {paymentMode === "manual" && category === "card" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">카드사</label>
                      <FancySelect
                        value={cardCompany}
                        onChange={setCardCompany}
                        options={CARD_COMPANIES.map((name) => ({ value: name, label: name }))}
                        emptyLabel="선택"
                        placeholder="선택"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">할부선택</label>
                      <FancySelect
                        value={installment}
                        onChange={setInstallment}
                        options={INSTALLMENT_OPTIONS.map((item) => ({ value: item, label: item }))}
                      />
                    </div>
                  </div>
                )}

                {category === "cash" && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between pr-2">
                      <span className="text-sm font-semibold text-slate-700">현금영수증</span>
                      <button
                        onClick={() => setCashReceiptOn((prev) => !prev)}
                        className={`relative mr-1 inline-flex h-7 w-12 shrink-0 items-center overflow-hidden rounded-full border transition-colors ${
                          cashReceiptOn ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all duration-200 ${
                            cashReceiptOn ? "left-[22px]" : "left-0.5"
                          }`}
                        />
                      </button>
                    </div>
                    {cashReceiptOn && (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: "consumer", label: "소비자 소득공제" },
                            { value: "business", label: "사업자 지출증빙" },
                            { value: "voluntary", label: "자진발급제도" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setCashReceiptType(opt.value as CashReceiptType)}
                              className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                                cashReceiptType === opt.value
                                  ? "border-blue-500 bg-white text-blue-700"
                                  : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-white"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {cashReceiptType !== "voluntary" && (
                          <input
                            value={identityValue}
                            onChange={(e) => setIdentityValue(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                            placeholder={
                              cashReceiptType === "business"
                                ? "사업자등록번호 또는 연락처"
                                : "휴대폰번호 또는 주민등록번호"
                            }
                          />
                        )}
                      </>
                    )}
                  </div>
                )}

                {paymentMode === "manual" && category === "platform" && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-xs text-blue-700">
                    병원이 아닌 외부 서비스에서 결제한 금액을 수납기록에 추가할 때 사용합니다.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">수납담당자</label>
                    <FancySelect
                      value={assignee}
                      onChange={setAssignee}
                      options={assignableMembers.map((m) => ({
                        value: m.name,
                        label: `${m.name}${m.jobTitleName ? ` (${m.jobTitleName})` : ""}`,
                      }))}
                      emptyLabel="미지정"
                      placeholder="미지정"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-500">수납메모</label>
                      <span className="text-[11px] text-slate-400">{memo.length}/200</span>
                    </div>
                    <input
                      value={memo}
                      onChange={(e) => setMemo(e.target.value.slice(0, 200))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                {paymentMode === "manual" && (category === "card" || category === "pay") && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600">단말기 거래 정보</span>
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <span className={`text-[11px] font-semibold ${deferTerminalInput ? "text-amber-700" : "text-slate-500"}`}>
                          나중에 입력 (보류 저장)
                        </span>
                        <button
                          type="button"
                          onClick={() => setDeferTerminalInput((prev) => !prev)}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                            deferTerminalInput ? "border-amber-500 bg-amber-400" : "border-slate-300 bg-slate-200"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-150 ${
                              deferTerminalInput ? "left-[18px]" : "left-0.5"
                            }`}
                          />
                        </button>
                      </label>
                    </div>
                    {deferTerminalInput ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
                        <div className="font-bold">⚠ 승인번호 / VANKEY 없이 보류 상태로 저장됩니다.</div>
                        <div className="mt-0.5 text-amber-700">환불·재출력 시 단말기 자동 연동이 불가하며, 단말기 직접 취소가 필요합니다. 가능하면 결제 후 영수증 보고 보완 입력해 주세요.</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            승인번호 <span className="text-rose-500">*</span>
                          </label>
                          <input
                            value={approvalNumber}
                            onChange={(e) => setApprovalNumber(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                            placeholder="영수증의 승인번호 입력"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            VANKEY <span className="text-rose-500">*</span>
                          </label>
                          <input
                            value={vanKeyInput}
                            onChange={(e) => setVanKeyInput(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                            placeholder="영수증의 VANKEY 입력"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-500">등록된 분할결제</div>
                  {lines.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-400">
                      아직 분할결제가 없습니다. 단건 결제는 추가 없이 바로 수납해도 됩니다.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lines.map((line, idx) => {
                        const isCardOrPay = line.paymentCategory === "card" || line.paymentCategory === "pay";
                        const isPending = isCardOrPay && !line.terminalAuthNo && !line.approvalNumber;
                        return (
                        <div key={`${line.paymentCategory}-${line.paymentSubMethod}-${idx}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                          <span className="w-6 text-slate-400">{idx + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-700">{lineSummary(line)}</span>
                          {isPending && (
                            <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700" title="승인번호/VANKEY 미입력 - 보류 저장">보류</span>
                          )}
                          <span className="font-bold text-slate-900">{formatWon(line.amount)}</span>
                          <button onClick={() => handleRemoveLine(idx)} className="text-slate-400 hover:text-red-500">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-[#F8DCE2] bg-[#FCF7F8]/40 px-6 py-4 shrink-0">
          <div className="text-[12px] text-[#8B5A66]">총 결제액과 분할합이 같아야 수납됩니다.</div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`rounded-xl px-6 py-2.5 text-[13px] font-extrabold transition-colors shadow-sm ${
              canSubmit
                ? "bg-gradient-to-b from-[#D27A8C] to-[#8B3F50] text-white hover:from-[#8B3F50] hover:to-[#5C2A35]"
                : "cursor-not-allowed bg-[#F4C7CE]/60 text-[#C9A0A8]"
            }`}
          >
            {submitting ? "수납 처리중..." : `${formatWon(totalAmount)} 수납`}
          </button>
        </div>
      </div>
      {terminalErrorDialog && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-[#2A1F22]/60 backdrop-blur-[3px] p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-[480px] rounded-2xl border border-[#F4C7CE] bg-white shadow-2xl overflow-hidden">
            <div className="border-b border-[#F8DCE2] bg-gradient-to-b from-amber-50 to-white px-5 py-4">
              <div className="text-[14px] font-extrabold text-amber-900">단말기 결제 오류</div>
              <div className="mt-1 text-[11.5px] text-amber-800 whitespace-pre-wrap leading-relaxed">
                {terminalErrorDialog.errorMsg}
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {terminalErrorDialog.successCount > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">
                  ✅ 이미 승인된 결제: <b>{terminalErrorDialog.successCount}건 · {terminalErrorDialog.successTotal.toLocaleString()}원</b>
                </div>
              )}
              <div className="space-y-1.5 text-[11.5px] text-[#3F2A30]">
                <div className="flex items-start gap-1.5">
                  <span className="font-bold text-[#D27A8C]">[재시도]</span>
                  <span>단말기 상태 확인 후 같은 결제를 다시 시도합니다.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-bold text-slate-500">
                    [{terminalErrorDialog.successCount > 0 ? "부분 수납" : "중단"}]
                  </span>
                  <span>
                    {terminalErrorDialog.successCount > 0
                      ? `성공한 ${terminalErrorDialog.successTotal.toLocaleString()}원만 부분 수납하고, 나머지는 미수납 상태로 남겨 나중에 [잔액 수납] 버튼으로 처리.`
                      : "이번 수납 처리를 중단합니다. 승인번호 수기 입력이 필요하면 [직접 결제] 탭으로 전환 후 진행."}
                  </span>
                </div>
              </div>
            </div>
            <div className="border-t border-[#F8DCE2] bg-white px-5 py-3 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { terminalErrorDialog.resolve("cancel"); setTerminalErrorDialog(null); }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
              >
                {terminalErrorDialog.successCount > 0 ? "부분 수납" : "중단"}
              </button>
              <button
                type="button"
                onClick={() => { terminalErrorDialog.resolve("retry"); setTerminalErrorDialog(null); }}
                className="h-9 rounded-lg bg-[#D27A8C] px-4 text-[12px] font-extrabold text-white hover:bg-[#8B3F50]"
              >
                재시도
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

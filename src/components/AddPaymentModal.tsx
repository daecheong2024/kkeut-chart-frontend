import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CreditCard, Monitor, MoreHorizontal, Plus, Smartphone, Wallet, X } from "lucide-react";
import { memberConfigService } from "../services/memberConfigService";
import { useAuthStore } from "../stores/useAuthStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { resolveActiveBranchId } from "../utils/branch";
import { kisTerminalService } from "../services/kisTerminalService";

interface AddPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  onAddPayment: (payment: any) => void | Promise<void>;
}

type PaymentCategory = "card" | "cash" | "pay" | "platform" | "other";
type CashReceiptType = "consumer" | "business" | "voluntary";

type PaymentOption = {
  value: string;
  label: string;
};

type SplitPaymentLine = {
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
    type: CashReceiptType;
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
    { value: "card_general", label: "일반 카드" },
    { value: "card_keyed", label: "수기 결제" },
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

export default function AddPaymentModal({ isOpen, onClose, totalAmount, onAddPayment }: AddPaymentModalProps) {
  const { settings } = useSettingsStore();
  const resolvedBranchId = resolveActiveBranchId("");
  const currentUserName = useAuthStore((s) => s.userName);

  const [category, setCategory] = useState<PaymentCategory>("card");
  const [subMethod, setSubMethod] = useState<string>(DETAIL_OPTIONS.card[0]?.value || "");
  const [lineAmountInput, setLineAmountInput] = useState<string>(String(Math.max(0, totalAmount)));

  const [cardCompany, setCardCompany] = useState<string>("");
  const [installment, setInstallment] = useState<string>("일시불");
  const [approvalNumber, setApprovalNumber] = useState<string>("");
  const [vanKeyInput, setVanKeyInput] = useState<string>("");

  const [cashReceiptOn, setCashReceiptOn] = useState<boolean>(true);
  const [cashReceiptType, setCashReceiptType] = useState<CashReceiptType>("consumer");
  const [identityValue, setIdentityValue] = useState<string>("");

  const [assignee, setAssignee] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [taxFreeInput, setTaxFreeInput] = useState<string>("0");
  const [taxableInput, setTaxableInput] = useState<string>(String(Math.max(0, totalAmount)));

  const [lines, setLines] = useState<SplitPaymentLine[]>([]);
  const [assignableMembers, setAssignableMembers] = useState<Array<{ id: string; name: string; jobTitleName?: string }>>([]);

  useEffect(() => {
    if (!isOpen) return;
    setCategory("card");
    setSubMethod(DETAIL_OPTIONS.card[0]?.value || "");
    setLineAmountInput(String(Math.max(0, totalAmount)));
    setCardCompany("");
    setInstallment("일시불");
    setApprovalNumber(""); setVanKeyInput("");
    setCashReceiptOn(true);
    setCashReceiptType("consumer");
    setIdentityValue("");
    setMemo("");
    setTaxFreeInput("0");
    setTaxableInput(String(Math.max(0, totalAmount)));
    setLines([]);
    setSubmitting(false);
  }, [isOpen, totalAmount]);

  useEffect(() => {
    setSubMethod(DETAIL_OPTIONS[category][0]?.value || "");
  }, [category]);

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

  const lineCanAdd =
    lineAmount > 0 &&
    lineAmount <= remainingAmount &&
    !!subMethod &&
    (category !== "card" || !!cardCompany.trim());

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

  const buildCurrentLine = (forcedAmount?: number): SplitPaymentLine => ({
    method: category,
    paymentCategory: category,
    paymentSubMethod: subMethod,
    paymentSubMethodLabel: selectedSubMethodLabel,
    amount: forcedAmount ?? lineAmount,
    memo: memo.trim() || undefined,
    assignee: assignee.trim() || undefined,
    cardCompany: cardCompany.trim() || undefined,
    installment: installment.trim() || undefined,
    approvalNumber: approvalNumber.trim() || undefined,
    terminalVanKey: vanKeyInput.trim() || undefined,
    cashReceipt:
      category === "cash"
        ? {
            enabled: cashReceiptOn,
            type: cashReceiptType,
            identity: identityValue.trim() || undefined,
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

  const canSubmit = !submitting && buildSubmitLines().length > 0;

  const handleSubmit = async () => {
    const submitLines = buildSubmitLines();
    if (submitLines.length === 0) return;

    const hospitalName = settings.hospital?.hospitalNameKo || "";
    const hospitalPhone = settings.hospital?.phone || "";
    const merchantTel = hospitalName && hospitalPhone ? `${hospitalName}(${hospitalPhone})` : hospitalName || hospitalPhone || "";

    try {
      setSubmitting(true);

      const terminalLines: SplitPaymentLine[] = [];
      for (const line of submitLines) {
        const needsTerminal = (line.paymentCategory === "card" && line.paymentSubMethod === "card_general")
            || line.paymentCategory === "pay";

        if (needsTerminal) {
          const tradeType = line.paymentCategory === "pay" ? "v1" as const : "D1" as const;
          const installmentMap: Record<string, string> = { "일시불": "00", "2개월": "02", "3개월": "03", "4개월": "04", "5개월": "05", "6개월": "06" };
          const installment = installmentMap[line.installment || ""] || "00";

          try {
            const connected = await kisTerminalService.connect();
            if (!connected) throw new Error("KIS 단말기 연결 실패");

            const result = await kisTerminalService.requestPayment({
              tradeType,
              amount: line.amount,
              installment,
              merchantTel,
            });

            if (!result.success) {
              throw new Error(result.displayMsg || `단말기 결제 실패 (${result.replyCode})`);
            }

            terminalLines.push({
              ...line,
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
          } catch (e: any) {
            throw new Error(`단말기 결제 실패: ${e.message}`);
          }
        } else {
          terminalLines.push(line);
        }
      }

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

      await Promise.resolve(onAddPayment(payload));
    } catch (e: any) {
      alert(e.message || "결제 처리 중 오류가 발생했습니다.");
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4">
      <div className="flex h-[760px] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">수납 추가</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-[320px_1fr] overflow-hidden">
          <aside className="border-r border-slate-200 bg-slate-50/80 p-5">
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
                <div>
                  <label className="mb-2 block text-xs font-semibold text-blue-600">결제방법 *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORY_OPTIONS.map((opt) => {
                      const active = category === opt.value;
                      const disabled = opt.value === "platform" || opt.value === "other";
                      return (
                        <button
                          key={opt.value}
                          onClick={() => !disabled && setCategory(opt.value)}
                          disabled={disabled}
                          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                            disabled
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : active
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
                </div>

                <div className="grid grid-cols-[1fr_180px_120px] gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-blue-600">상세결제수단 *</label>
                    <FancySelect
                      value={subMethod}
                      onChange={setSubMethod}
                      options={DETAIL_OPTIONS[category]}
                      placeholder="상세결제수단 선택"
                    />
                  </div>
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
                      className={`flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                        lineCanAdd ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-400"
                      }`}
                    >
                      <Plus className="h-4 w-4" />
                      추가
                    </button>
                  </div>
                </div>

                {category === "card" && (
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

                {category === "platform" && (
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">승인번호</label>
                    <input
                      value={approvalNumber}
                      onChange={(e) => setApprovalNumber(e.target.value)}
                      disabled={category === "card" && subMethod === "card_general"}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                      placeholder={category === "card" && subMethod === "card_general" ? "단말기 자동입력" : "승인번호를 입력하세요"}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">VANKEY</label>
                    <input
                      value={vanKeyInput}
                      onChange={(e) => setVanKeyInput(e.target.value)}
                      disabled={category === "card" && subMethod === "card_general"}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                      placeholder={category === "card" && subMethod === "card_general" ? "단말기 자동입력" : "VANKEY를 입력하세요"}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-500">등록된 분할결제</div>
                  {lines.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-400">
                      아직 분할결제가 없습니다. 단건 결제는 추가 없이 바로 수납해도 됩니다.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lines.map((line, idx) => (
                        <div key={`${line.paymentCategory}-${line.paymentSubMethod}-${idx}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                          <span className="w-6 text-slate-400">{idx + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-700">{lineSummary(line)}</span>
                          <span className="font-bold text-slate-900">{formatWon(line.amount)}</span>
                          <button onClick={() => handleRemoveLine(idx)} className="text-slate-400 hover:text-red-500">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <div className="text-sm text-slate-500">총 결제액과 분할합이 같아야 수납됩니다.</div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`rounded-xl px-6 py-2.5 text-sm font-bold transition-colors ${
              canSubmit ? "bg-blue-600 text-white hover:bg-blue-700" : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            {submitting ? "수납 처리중..." : `${formatWon(totalAmount)} 수납`}
          </button>
        </div>
      </div>
    </div>
  );
}

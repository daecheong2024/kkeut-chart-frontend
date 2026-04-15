import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, CreditCard } from "lucide-react";
import {
    paymentService,
    type RefundType,
    type RefundCalculateResult,
    type MembershipSettlementInfo,
    type MembershipSettlementLinkedTicket,
} from "../../services/paymentService";
import { kisTerminalService } from "../../services/kisTerminalService";
import { useAlert } from "../ui/AlertDialog";

// ============================================================
// Public types
// ============================================================

export interface UnifiedRefundSelection {
    paymentMasterId: number;
    paymentDetailId: number;
    itemType: "ticket" | "membership";
    itemName: string;
    /** 결제 수단 (CARD/PAY/CASH/...). 단말기 호출 여부 결정에 사용 */
    paymentType?: string;
    /** 단말기 환불용 원거래 정보 (있을 때만) */
    terminalInfo?: {
        authNo?: string;
        authDate?: string;
        vanKey?: string;
    };
}

export interface UnifiedRefundModalProps {
    open: boolean;
    selections: UnifiedRefundSelection[];
    onClose: () => void;
    onCompleted: (totalRefund: number) => void;
}

// ============================================================
// Helpers
// ============================================================

const REFUND_TYPE_OPTIONS: Array<{ value: RefundType; label: string; description: string }> = [
    { value: "customer_change", label: "고객 단순변심", description: "잔액 + (티켓 환불) - 위약금" },
    { value: "hospital_fault", label: "병원 귀책", description: "잔액 + 티켓 환불, 위약금 없음" },
    { value: "manual", label: "기타 (직접 입력)", description: "직원이 환불액 직접 입력 (사유 필수)" },
];

function formatWon(value: number): string {
    return `${Math.max(0, Math.round(value)).toLocaleString()}원`;
}

function isTerminalPayment(paymentType?: string): boolean {
    if (!paymentType) return false;
    const upper = paymentType.toUpperCase();
    return upper === "CARD" || upper === "PAY";
}

function paymentTypeLabel(paymentType?: string): string {
    const upper = (paymentType || "").toUpperCase();
    switch (upper) {
        case "CARD": return "카드";
        case "PAY": return "간편결제";
        case "CASH": return "현금";
        case "BANKING": return "계좌이체";
        case "MEMBERSHIP_CASH": return "회원권 잔액";
        case "MEMBERSHIP_POINT": return "회원권 포인트";
        default: return upper || "기타";
    }
}

// ============================================================
// Component
// ============================================================

type ProgressState =
    | { phase: "idle" }
    | { phase: "repayment"; current: number; total: number; itemName: string; amount: number }
    | { phase: "void"; current: number; total: number; itemName: string; amount: number }
    | { phase: "backend"; itemName: string }
    | { phase: "done" };

interface TerminalPairResult {
    paidAmount: number;
    rePayment?: {
        amount: number;
        authNo: string;
        authDate: string;
        vanKey: string;
        cardCompany?: string;
        installment?: string;
        cardNo?: string;
        tranNo?: string;
        accepterName?: string;
        catId?: string;
        merchantRegNo?: string;
    };
    refund: {
        amount: number;
        authNo: string;
        authDate: string;
        vanKey: string;
    };
}

export function UnifiedRefundModal({ open, selections, onClose, onCompleted }: UnifiedRefundModalProps) {
    const { showAlert, showConfirm } = useAlert();

    const [refundType, setRefundType] = useState<RefundType>("customer_change");
    const [penaltyRatePct, setPenaltyRatePct] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [manualSkipTerminal, setManualSkipTerminal] = useState(false);
    // 위약금 받는 결제수단 (직원 선택). 기본: 카드 (원거래와 같은 카드로 재결제)
    const [rePaymentMethod, setRePaymentMethod] = useState<"card" | "cash" | "pay">("card");
    // 직접 입력 환불 시 티켓별 환불액 (refundType="manual" 일 때 사용)
    const [ticketManualAmounts, setTicketManualAmounts] = useState<Record<number, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [progress, setProgress] = useState<ProgressState>({ phase: "idle" });

    // Settlement info per membership selection (loaded async)
    const [settlements, setSettlements] = useState<Record<number, MembershipSettlementInfo>>({});
    const [settlementLoading, setSettlementLoading] = useState(false);
    const [settlementError, setSettlementError] = useState<string | null>(null);

    // Per-ticket calc results
    const [ticketCalcs, setTicketCalcs] = useState<Record<number, RefundCalculateResult>>({});
    const [calcLoading, setCalcLoading] = useState(false);

    const memberships = useMemo(() => selections.filter((s) => s.itemType === "membership"), [selections]);
    const standaloneTicketSelections = useMemo(() => selections.filter((s) => s.itemType === "ticket"), [selections]);

    // Detect tickets that are already linked to selected memberships → exclude from standalone refund
    const linkedTicketDetailIds = useMemo(() => {
        const ids = new Set<number>();
        for (const s of memberships) {
            const info = settlements[s.paymentDetailId];
            if (!info) continue;
            for (const t of info.linkedTickets) {
                if (!t.alreadyRefunded) ids.add(t.paymentDetailId);
            }
        }
        return ids;
    }, [memberships, settlements]);

    // Final standalone tickets = selected tickets minus those covered by membership settlement
    const effectiveTickets = useMemo(
        () => standaloneTicketSelections.filter((t) => !linkedTicketDetailIds.has(t.paymentDetailId)),
        [standaloneTicketSelections, linkedTicketDetailIds]
    );

    const dedupedCount = standaloneTicketSelections.length - effectiveTickets.length;

    // ========== Load settlement info for memberships ==========
    useEffect(() => {
        if (!open || memberships.length === 0) return;
        setSettlementLoading(true);
        setSettlementError(null);
        Promise.all(
            memberships.map((m) =>
                paymentService
                    .getMembershipSettlementByPaymentDetail(m.paymentDetailId)
                    .then((info) => ({ key: m.paymentDetailId, info }))
                    .catch((e: any) => ({ key: m.paymentDetailId, error: e?.message || "조회 실패" }))
            )
        )
            .then((results) => {
                const map: Record<number, MembershipSettlementInfo> = {};
                for (const r of results) {
                    if ("info" in r) map[r.key] = r.info;
                }
                setSettlements(map);
            })
            .finally(() => setSettlementLoading(false));
    }, [open, memberships]);

    // ========== Calculate refund preview for standalone tickets ==========
    const runTicketCalcs = useCallback(async () => {
        if (effectiveTickets.length === 0) {
            setTicketCalcs({});
            return;
        }
        setCalcLoading(true);
        const penaltyRate = penaltyRatePct === "" ? undefined : Number(penaltyRatePct) / 100;
        const results: Record<number, RefundCalculateResult> = {};
        for (const t of effectiveTickets) {
            try {
                const manualVal = ticketManualAmounts[t.paymentDetailId];
                const manualAmount = refundType === "manual" && manualVal && manualVal.trim() !== ""
                    ? Math.max(0, Number(manualVal.replace(/[^0-9]/g, "")))
                    : undefined;
                const r = await paymentService.calculateRefund({
                    paymentMasterId: t.paymentMasterId,
                    paymentDetailId: t.paymentDetailId,
                    refundType,
                    penaltyRate,
                    manualAmount,
                    reason: reason.trim() || undefined,
                });
                results[t.paymentDetailId] = r;
            } catch (e: any) {
                results[t.paymentDetailId] = {
                    canRefund: false,
                    reason: e?.response?.data?.message || e?.message || "계산 실패",
                    itemName: t.itemName,
                    itemType: "ticket",
                    refundType,
                    paidAmount: 0,
                    penaltyRate: 0,
                    penaltyAmount: 0,
                    usageDeduction: 0,
                    usedCount: 0,
                    totalCount: 0,
                    remainingCount: 0,
                    singleSessionPrice: null,
                    estimatedRefund: 0,
                    formula: "",
                };
            }
        }
        setTicketCalcs(results);
        setCalcLoading(false);
    }, [effectiveTickets, refundType, penaltyRatePct, reason, ticketManualAmounts]);

    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => { void runTicketCalcs(); }, 250);
        return () => clearTimeout(timer);
    }, [open, runTicketCalcs]);

    // Reset state when opened
    useEffect(() => {
        if (!open) return;
        setRefundType("customer_change");
        setPenaltyRatePct("");
        setReason("");
        setManualSkipTerminal(false);
        setRePaymentMethod("card");
        setTicketManualAmounts({});
        setSubmitting(false);
        setProgress({ phase: "idle" });
    }, [open]);

    // ========== Per-membership preview calc (matches backend formula) ==========
    const ticketRefundForType = (t: MembershipSettlementLinkedTicket, type: RefundType): number => {
        if (t.alreadyRefunded) return 0;
        if (type === "customer_change") return t.estimatedRefund;
        if (type === "hospital_fault") {
            if (t.totalCount <= 0) return 0;
            return Math.round((t.paidViaMembership * t.remainingCount) / t.totalCount);
        }
        return 0;
    };

    const membershipPreviews = useMemo(() => {
        return memberships.map((m) => {
            const info = settlements[m.paymentDetailId];
            if (!info) return { selection: m, info: null, total: 0, balance: 0, ticketsTotal: 0, penalty: 0 };
            if (refundType === "manual") {
                return { selection: m, info, total: 0, balance: 0, ticketsTotal: 0, penalty: 0 };
            }
            const rate = refundType === "hospital_fault"
                ? 0
                : (penaltyRatePct === "" ? info.defaultPenaltyRate : Math.max(0, Math.min(0.99, Number(penaltyRatePct) / 100)));
            const balance = info.membershipAlreadyRefunded ? 0 : info.currentCashBalance;
            const ticketsTotal = info.linkedTickets
                .filter((t) => !t.alreadyRefunded)
                .reduce((s, t) => s + ticketRefundForType(t, refundType), 0);
            const penalty = info.membershipAlreadyRefunded ? 0 : Math.round(info.discountedPurchasePrice * rate);
            const total = Math.max(0, balance + ticketsTotal - penalty);
            return { selection: m, info, total, balance, ticketsTotal, penalty };
        });
    }, [memberships, settlements, refundType, penaltyRatePct]);

    const ticketsRefundTotal = useMemo(
        () => Object.values(ticketCalcs).reduce((s, c) => s + (c.estimatedRefund || 0), 0),
        [ticketCalcs]
    );
    const membershipRefundTotal = useMemo(
        () => membershipPreviews.reduce((s, p) => s + p.total, 0),
        [membershipPreviews]
    );
    const grandTotal = ticketsRefundTotal + membershipRefundTotal;

    // 공제액 = 위약금 + 사용분 (= 직원이 이번에 결제 처리하는 금액 = 병원이 받는 돈)
    // 단독 티켓: paidAmount - estimatedRefund (정상가 사용분 + 위약금)
    // 회원권 정산: penalty (잔액/티켓은 회원권 자체 흐름)
    const deductionTotal = useMemo(() => {
        let s = 0;
        for (const t of effectiveTickets) {
            const c = ticketCalcs[t.paymentDetailId];
            if (c) s += Math.max(0, (c.paidAmount || 0) - (c.estimatedRefund || 0));
        }
        for (const p of membershipPreviews) {
            s += Math.max(0, p.penalty || 0);
        }
        return s;
    }, [effectiveTickets, membershipPreviews, ticketCalcs]);

    // 영수증 보고 단말기 정보 수기 입력 — paymentDetailId 별 override
    const [terminalInfoOverrides, setTerminalInfoOverrides] = useState<Record<number, { authNo: string; authDate: string; vanKey: string }>>({});
    const [terminalInfoDraft, setTerminalInfoDraft] = useState<Record<number, { authNo: string; authDate: string; vanKey: string }>>({});
    const [savingTerminalInfoFor, setSavingTerminalInfoFor] = useState<number | null>(null);

    useEffect(() => {
        if (!open) return;
        setTerminalInfoOverrides({});
        setTerminalInfoDraft({});
    }, [open]);

    const getEffectiveTerminalInfo = (sel: UnifiedRefundSelection) => {
        const o = terminalInfoOverrides[sel.paymentDetailId];
        if (o) return o;
        return {
            authNo: sel.terminalInfo?.authNo || "",
            authDate: sel.terminalInfo?.authDate || "",
            vanKey: sel.terminalInfo?.vanKey || "",
        };
    };

    const isTerminalReady = (sel: UnifiedRefundSelection) => {
        const t = getEffectiveTerminalInfo(sel);
        return !!t.authNo && !!t.authDate && !!t.vanKey;
    };

    const saveTerminalInfoFor = async (sel: UnifiedRefundSelection) => {
        const draft = terminalInfoDraft[sel.paymentDetailId];
        if (!draft) return;
        const a = draft.authNo.trim();
        const d = draft.authDate.trim();
        const v = draft.vanKey.trim();
        if (!a || !d || !v) {
            showAlert({ message: "승인번호 / 거래일시(YYYYMMDD) / VANKEY 모두 입력해 주세요.", type: "warning" });
            return;
        }
        if (!/^\d{8}$/.test(d)) {
            showAlert({ message: "거래일시는 YYYYMMDD 8자리 숫자로 입력해 주세요. (예: 20260414)", type: "warning" });
            return;
        }
        setSavingTerminalInfoFor(sel.paymentDetailId);
        try {
            await paymentService.updatePaymentDetailTerminalInfo(sel.paymentDetailId, {
                authNo: a, terminalAuthDate: d, terminalVanKey: v,
            });
            setTerminalInfoOverrides(prev => ({ ...prev, [sel.paymentDetailId]: { authNo: a, authDate: d, vanKey: v } }));
            showAlert({ message: `[${sel.itemName}] 단말기 정보 저장 완료`, type: "success" });
        } catch (e: any) {
            showAlert({ message: `저장 실패: ${e?.response?.data?.message || e?.message || "오류"}`, type: "error" });
        } finally {
            setSavingTerminalInfoFor(null);
        }
    };

    // 자동/수기 분리 합계 — 직원이 "현금분은 별도 출금" 임을 명확히 인지하도록
    const autoRefundTotal = useMemo(() => {
        let s = 0;
        for (const t of effectiveTickets) {
            if (isTerminalPayment(t.paymentType)) s += ticketCalcs[t.paymentDetailId]?.estimatedRefund ?? 0;
        }
        for (const p of membershipPreviews) {
            if (isTerminalPayment(p.selection.paymentType)) s += p.total;
        }
        return s;
    }, [effectiveTickets, membershipPreviews, ticketCalcs]);
    const manualRefundTotal = Math.max(0, grandTotal - autoRefundTotal);

    // Detect terminal payments that will need card refund
    const terminalSelections = useMemo(() => {
        const list: UnifiedRefundSelection[] = [];
        // Standalone tickets that need terminal refund
        for (const t of effectiveTickets) {
            if (isTerminalPayment(t.paymentType) && (ticketCalcs[t.paymentDetailId]?.estimatedRefund ?? 0) > 0) {
                list.push(t);
            }
        }
        // Memberships: the membership cash detail itself might be CARD/PAY paid
        for (const m of memberships) {
            if (isTerminalPayment(m.paymentType)) {
                list.push(m);
            }
        }
        return list;
    }, [effectiveTickets, memberships, ticketCalcs]);

    // ========== Submit handler ==========
    const handleSubmit = async () => {
        if (submitting) return;
        if (grandTotal <= 0) {
            showAlert({ message: "환불 가능 금액이 없습니다.", type: "warning" });
            return;
        }
        if (refundType === "manual" && !reason.trim()) {
            showAlert({ message: "직접 입력 환불은 사유가 필수입니다.", type: "warning" });
            return;
        }

        // 단말기 호출 여부 결정
        const useTerminal = !manualSkipTerminal && terminalSelections.length > 0;
        if (useTerminal) {
            const ok = await kisTerminalService.connect().catch(() => false);
            if (!ok) {
                const proceed = await showConfirm({
                    message: "단말기 연결에 실패했습니다.\n수동 환불(단말기 없이 진행)으로 진행하시겠습니까?\n\n※ 카드 환불은 별도로 카드사에 직접 요청해야 합니다.",
                    type: "warning",
                    confirmText: "수동 진행",
                    cancelText: "취소",
                });
                if (!proceed) return;
            }
        }

        setSubmitting(true);

        // === Phase 1: Terminal 2단계 패턴 (위약금 재결제 → 원거래 전체취소) ===
        const terminalResults: Record<number, TerminalPairResult | { error: string; repaymentDone?: boolean; repaymentAuthNo?: string; repaymentAmount?: number }> = {};
        const skipTerminal = manualSkipTerminal || !kisTerminalService.isConnected();

        if (!skipTerminal && terminalSelections.length > 0) {
            for (let i = 0; i < terminalSelections.length; i++) {
                const sel = terminalSelections[i]!;
                const t = getEffectiveTerminalInfo(sel);
                if (!t.authNo || !t.authDate || !t.vanKey) {
                    terminalResults[sel.paymentDetailId] = { error: "원거래 정보 부족 (승인번호/일시/VanKey) — 영수증 보고 입력 필요" };
                    continue;
                }

                // 원결제액 / 위약금 산출
                let paidAmount = 0;
                let penaltyAmount = 0;
                if (sel.itemType === "ticket") {
                    const calc = ticketCalcs[sel.paymentDetailId];
                    paidAmount = calc?.paidAmount ?? 0;
                    penaltyAmount = calc?.penaltyAmount ?? 0;
                } else {
                    const preview = membershipPreviews.find((p) => p.selection.paymentDetailId === sel.paymentDetailId);
                    paidAmount = preview?.info?.discountedPurchasePrice ?? 0;
                    penaltyAmount = preview?.penalty ?? 0;
                }
                if (paidAmount <= 0) continue;

                const tradeType = (sel.paymentType?.toUpperCase() === "PAY") ? "v1" as const : "D1" as const;
                const tradeRefundType = (sel.paymentType?.toUpperCase() === "PAY") ? "v2" as const : "D2" as const;

                // Step A: 위약금 재결제 (penalty > 0 일 때만)
                // 직원이 선택한 결제수단(card/cash/pay)에 따라 단말기 호출 또는 스킵
                let rePaymentAuth: TerminalPairResult["rePayment"] | undefined = undefined;
                if (penaltyAmount > 0) {
                    setProgress({ phase: "repayment", current: i + 1, total: terminalSelections.length, itemName: sel.itemName, amount: penaltyAmount });
                    if (rePaymentMethod === "cash") {
                        // 현금 위약금: 단말기 호출 없이 amount 만 기록 (BE 가 cash detail 로 저장)
                        rePaymentAuth = { amount: penaltyAmount, authNo: "", authDate: "", vanKey: "" };
                    } else {
                        // 카드/페이 위약금: 단말기 호출
                        const repayTradeType = (rePaymentMethod === "pay") ? "v1" as const : "D1" as const;
                        try {
                            const r = await kisTerminalService.requestPayment({ tradeType: repayTradeType, amount: penaltyAmount });
                            if (!r.success) {
                                terminalResults[sel.paymentDetailId] = { error: `위약금 재결제 실패: ${r.displayMsg || r.replyCode}` };
                                continue;
                            }
                            rePaymentAuth = {
                                amount: penaltyAmount,
                                authNo: r.authNo,
                                authDate: r.replyDate,
                                vanKey: r.vanKey,
                                cardCompany: r.issuerName || r.accepterName,
                                installment: r.installment,
                                cardNo: r.cardNo,
                                tranNo: r.tranNo,
                                accepterName: r.accepterName,
                                catId: r.catId,
                                merchantRegNo: r.merchantRegNo,
                            };
                        } catch (e: any) {
                            terminalResults[sel.paymentDetailId] = { error: `위약금 재결제 호출 실패: ${e?.message || "알 수 없는 오류"}` };
                            continue;
                        }
                    }
                }

                // Step B: 원거래 전체취소 (amount = paidAmount 전체)
                setProgress({ phase: "void", current: i + 1, total: terminalSelections.length, itemName: sel.itemName, amount: paidAmount });
                try {
                    const r = await kisTerminalService.requestRefund({
                        tradeType: tradeRefundType,
                        amount: paidAmount,
                        orgAuthDate: t.authDate,
                        orgAuthNo: t.authNo,
                        vanKey: t.vanKey,
                    });
                    if (!r.success) {
                        terminalResults[sel.paymentDetailId] = {
                            error: `원거래 전체취소 실패: ${r.displayMsg || r.replyCode}`,
                            repaymentDone: !!rePaymentAuth,
                            repaymentAuthNo: rePaymentAuth?.authNo,
                            repaymentAmount: rePaymentAuth?.amount,
                        };
                        continue;
                    }
                    terminalResults[sel.paymentDetailId] = {
                        paidAmount,
                        rePayment: rePaymentAuth,
                        refund: { amount: paidAmount, authNo: r.authNo, authDate: r.replyDate, vanKey: r.vanKey },
                    };
                } catch (e: any) {
                    terminalResults[sel.paymentDetailId] = {
                        error: `원거래 전체취소 호출 실패: ${e?.message || "알 수 없는 오류"}`,
                        repaymentDone: !!rePaymentAuth,
                        repaymentAuthNo: rePaymentAuth?.authNo,
                        repaymentAmount: rePaymentAuth?.amount,
                    };
                }
            }

            // 실패 검사 — 복구 안내 메시지 포함
            const failed = Object.entries(terminalResults).filter(([, v]) => "error" in v);
            if (failed.length > 0) {
                setProgress({ phase: "idle" });
                setSubmitting(false);
                const detailLines = failed.map(([id, v]) => {
                    const name = terminalSelections.find((s) => s.paymentDetailId === Number(id))?.itemName || id;
                    const e = v as { error: string; repaymentDone?: boolean; repaymentAuthNo?: string; repaymentAmount?: number };
                    let line = `· [${name}] ${e.error}`;
                    if (e.repaymentDone) {
                        line += `\n  ⚠ 위약금 재결제(${formatWon(e.repaymentAmount || 0)}, 승인번호 ${e.repaymentAuthNo}) 는 이미 승인됨 → 직원이 수동으로 해당 건 환불 처리 필요`;
                    }
                    return line;
                });
                showAlert({
                    message: `단말기 환불 처리 중 실패\n${detailLines.join("\n")}`,
                    type: "error",
                });
                return;
            }
        }

        // === Phase 2: Backend refund ===
        let totalSuccess = 0;
        let totalFail = 0;
        const failureMessages: string[] = [];

        // 2-1: Membership settlement(s) — sequential
        for (const m of memberships) {
            const info = settlements[m.paymentDetailId];
            if (!info) continue;
            const preview = membershipPreviews.find((p) => p.selection.paymentDetailId === m.paymentDetailId);
            if (!preview || preview.total <= 0) continue;

            setProgress({ phase: "backend", itemName: m.itemName });

            try {
                const rate = refundType === "hospital_fault"
                    ? 0
                    : (penaltyRatePct === "" ? info.defaultPenaltyRate : Math.max(0, Math.min(0.99, Number(penaltyRatePct) / 100)));
                const termRes = terminalResults[m.paymentDetailId];
                const termPair = termRes && !("error" in termRes) ? termRes : undefined;
                const result = await paymentService.executeMembershipSettlement(info.membershipRootId, {
                    refundType,
                    includedPaymentDetailIds: refundType === "manual" ? [] : info.linkedTickets.filter((t) => !t.alreadyRefunded).map((t) => t.paymentDetailId),
                    penaltyRate: rate,
                    manualAmount: refundType === "manual" ? preview.total : undefined,
                    reason: reason.trim() || undefined,
                    membershipCardRefundAmount: termPair?.refund.amount,
                    membershipCardRefundAuthNo: termPair?.refund.authNo,
                    membershipCardRefundDate: termPair?.refund.authDate,
                    membershipCardRefundVanKey: termPair?.refund.vanKey,
                    refundMethod: termPair ? "AUTO" : (skipTerminal ? "MANUAL" : undefined),
                    rePaymentAmount: termPair?.rePayment?.amount,
                    rePaymentMethod: termPair?.rePayment ? rePaymentMethod.toUpperCase() : undefined,
                    rePaymentTerminalAuthNo: termPair?.rePayment?.authNo,
                    rePaymentTerminalAuthDate: termPair?.rePayment?.authDate,
                    rePaymentVanKey: termPair?.rePayment?.vanKey,
                    rePaymentCardCompany: termPair?.rePayment?.cardCompany,
                    rePaymentInstallment: termPair?.rePayment?.installment,
                    rePaymentTerminalCardNo: termPair?.rePayment?.cardNo,
                    rePaymentTerminalTranNo: termPair?.rePayment?.tranNo,
                    rePaymentTerminalAccepterName: termPair?.rePayment?.accepterName,
                    rePaymentTerminalCatId: termPair?.rePayment?.catId,
                    rePaymentTerminalMerchantRegNo: termPair?.rePayment?.merchantRegNo,
                });
                if (result.success) {
                    totalSuccess++;
                } else {
                    totalFail++;
                    failureMessages.push(`${m.itemName}: ${result.message}`);
                }
            } catch (e: any) {
                totalFail++;
                failureMessages.push(`${m.itemName}: ${e?.response?.data?.message || e?.message || "처리 실패"}`);
            }
        }

        // 2-2: Standalone tickets via bulk refund
        if (effectiveTickets.length > 0) {
            const refundableTickets = effectiveTickets.filter((t) => (ticketCalcs[t.paymentDetailId]?.estimatedRefund ?? 0) > 0);
            if (refundableTickets.length > 0) {
                setProgress({ phase: "backend", itemName: `${refundableTickets.length}건 일괄 환불` });
                try {
                    const penaltyRate = penaltyRatePct === "" ? undefined : Number(penaltyRatePct) / 100;
                    const result = await paymentService.executeBulkRefund({
                        items: refundableTickets.map((t) => {
                            const termRes = terminalResults[t.paymentDetailId];
                            const pair = termRes && !("error" in termRes) ? termRes : undefined;
                            const manualVal = ticketManualAmounts[t.paymentDetailId];
                            const manualAmount = refundType === "manual" && manualVal && manualVal.trim() !== ""
                                ? Math.max(0, Number(manualVal.replace(/[^0-9]/g, "")))
                                : undefined;
                            return {
                                paymentMasterId: t.paymentMasterId,
                                paymentDetailId: t.paymentDetailId,
                                refundType,
                                penaltyRate,
                                manualAmount,
                                reason: reason.trim() || undefined,
                                terminalRefundAuthNo: pair?.refund.authNo,
                                terminalRefundDate: pair?.refund.authDate,
                                terminalVanKey: pair?.refund.vanKey,
                                refundMethod: pair ? "AUTO" : (skipTerminal ? "MANUAL" : undefined),
                                rePaymentAmount: pair?.rePayment?.amount,
                                rePaymentMethod: pair?.rePayment ? rePaymentMethod.toUpperCase() : undefined,
                                rePaymentTerminalAuthNo: pair?.rePayment?.authNo,
                                rePaymentTerminalAuthDate: pair?.rePayment?.authDate,
                                rePaymentVanKey: pair?.rePayment?.vanKey,
                                rePaymentCardCompany: pair?.rePayment?.cardCompany,
                                rePaymentInstallment: pair?.rePayment?.installment,
                                rePaymentTerminalCardNo: pair?.rePayment?.cardNo,
                                rePaymentTerminalTranNo: pair?.rePayment?.tranNo,
                                rePaymentTerminalAccepterName: pair?.rePayment?.accepterName,
                                rePaymentTerminalCatId: pair?.rePayment?.catId,
                                rePaymentTerminalMerchantRegNo: pair?.rePayment?.merchantRegNo,
                            };
                        }),
                        commonReason: reason.trim() || undefined,
                    });
                    totalSuccess += result.successCount;
                    totalFail += result.failureCount;
                    if (result.failureCount > 0) {
                        failureMessages.push(...result.results.filter((r) => !r.success).map((r) => `${r.itemName}: ${r.errorMessage || "실패"}`));
                    }
                } catch (e: any) {
                    totalFail += refundableTickets.length;
                    failureMessages.push(`일괄 환불 실패: ${e?.response?.data?.message || e?.message || "처리 실패"}`);
                }
            }
        }

        setProgress({ phase: "done" });
        setSubmitting(false);

        if (totalFail === 0) {
            const lines: string[] = [`${totalSuccess}건 / 총 ${formatWon(grandTotal)} 환불 완료`];
            if (autoRefundTotal > 0) lines.push(`· 단말기 자동 환불: ${formatWon(autoRefundTotal)}`);
            if (manualRefundTotal > 0) lines.push(`· 수기 출금 필요 (현금/계좌): ${formatWon(manualRefundTotal)}`);
            if (skipTerminal && autoRefundTotal > 0) lines.push("\n※ 수동 환불 모드 — 카드사 환불은 별도 처리 필요");
            showAlert({ message: lines.join("\n"), type: "success" });
        } else {
            showAlert({
                message: `성공 ${totalSuccess}건 / 실패 ${totalFail}건\n\n${failureMessages.slice(0, 5).join("\n")}`,
                type: totalSuccess > 0 ? "warning" : "error",
            });
        }
        onCompleted(grandTotal);
        onClose();
    };

    if (!open) return null;

    const refundDisabled = submitting || grandTotal <= 0 || settlementLoading;

    return createPortal(
        <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] px-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
        >
            <div className="w-full max-w-[960px] max-h-[92vh] rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-[#F8DCE2] px-6 py-3 bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white shrink-0">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#D27A8C] to-[#8B3F50]" />
                    <div className="pl-2 min-w-0">
                        <div className="text-[15px] font-extrabold text-[#5C2A35]">통합 환불 처리</div>
                        <div className="text-[11px] text-[#8B5A66]">
                            {selections.length}건 선택 ·
                            {memberships.length > 0 && ` 회원권 ${memberships.length}건`}
                            {memberships.length > 0 && effectiveTickets.length > 0 && " ·"}
                            {effectiveTickets.length > 0 && ` 단독 티켓 ${effectiveTickets.length}건`}
                            {dedupedCount > 0 && ` (회원권 정산 자동 포함 ${dedupedCount}건)`}
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

                {/* Body */}
                <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 px-6 py-4">
                    {/* LEFT — Items */}
                    <div className="space-y-3">
                        {settlementLoading && (
                            <div className="rounded-lg border border-[#F8DCE2] bg-[#FCF7F8] px-4 py-3 text-[12px] text-[#8B5A66] flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full border-2 border-[#F8DCE2] border-t-[#D27A8C] animate-spin" />
                                회원권 정보 조회 중...
                            </div>
                        )}

                        {/* Memberships */}
                        {membershipPreviews.map((preview) => (
                            <MembershipPreviewCard key={preview.selection.paymentDetailId} preview={preview} />
                        ))}

                        {/* Standalone tickets */}
                        {effectiveTickets.length > 0 && (
                            <div>
                                <div className="text-[11px] font-extrabold text-[#8B3F50] mb-2 px-1">
                                    🎫 단독 티켓 ({effectiveTickets.length})
                                </div>
                                <div className="rounded-xl border border-[#F8DCE2] divide-y divide-[#F8DCE2]/60 overflow-hidden">
                                    {effectiveTickets.map((t) => {
                                        const calc = ticketCalcs[t.paymentDetailId];
                                        return (
                                            <div key={t.paymentDetailId} className="px-3 py-2.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[12px] font-bold text-[#2A1F22] truncate">{t.itemName}</div>
                                                        {calc ? (
                                                            <div className="text-[10px] text-[#8B5A66] mt-0.5">
                                                                결제 {formatWon(calc.paidAmount)}
                                                                {calc.usedCount > 0 && ` · 사용 ${calc.usedCount}회`}
                                                                {calc.penaltyAmount > 0 && ` · 위약 −${formatWon(calc.penaltyAmount)}`}
                                                                {calc.usageDeduction > 0 && ` · 차감 −${formatWon(calc.usageDeduction)}`}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[10px] text-[#C9A0A8]">계산 중...</div>
                                                        )}
                                                        {calc && !calc.canRefund && calc.reason && (
                                                            <div className="mt-0.5 text-[10px] font-bold text-[#99354E]">⚠ {calc.reason}</div>
                                                        )}
                                                        {isTerminalPayment(t.paymentType) && (calc?.estimatedRefund ?? 0) > 0 && (
                                                            <div className="mt-0.5 text-[10px] text-[#5C2A35] flex items-center gap-1">
                                                                <CreditCard className="h-2.5 w-2.5" />
                                                                {paymentTypeLabel(t.paymentType)} · 단말기 환불 대상
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        {refundType === "manual" ? (
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    value={ticketManualAmounts[t.paymentDetailId] ?? ""}
                                                                    onChange={(e) => {
                                                                        const cleaned = e.target.value.replace(/[^0-9]/g, "");
                                                                        setTicketManualAmounts(prev => ({ ...prev, [t.paymentDetailId]: cleaned }));
                                                                    }}
                                                                    placeholder="환불액 입력"
                                                                    className="h-8 w-[120px] rounded-md border border-[#F4C7CE] bg-white px-2 text-right text-[12px] tabular-nums outline-none focus:border-[#D27A8C]"
                                                                />
                                                                <span className="text-[12px] font-bold text-[#5C2A35]">원</span>
                                                            </div>
                                                        ) : (
                                                            <div className={`text-[14px] font-extrabold tabular-nums ${calc?.canRefund && (calc?.estimatedRefund ?? 0) > 0 ? "text-[#D27A8C]" : "text-[#C9A0A8]"}`}>
                                                                {calc ? formatWon(calc.estimatedRefund) : "-"}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {dedupedCount > 0 && (
                            <div className="rounded-lg bg-[#FCEBEF]/40 border border-[#F8DCE2] px-3 py-2 text-[10px] text-[#8B5A66] leading-relaxed">
                                ⓘ 선택한 티켓 중 {dedupedCount}건은 회원권 정산에 자동 포함되어 별도 처리되지 않습니다.
                            </div>
                        )}
                    </div>

                    {/* RIGHT — Common options */}
                    <div className="space-y-3">
                        {/* Refund type */}
                        <div>
                            <label className="mb-1.5 block text-[11px] font-bold text-[#8B3F50]">공통 환불 유형</label>
                            <div className="grid grid-cols-3 gap-1.5">
                                {REFUND_TYPE_OPTIONS.map((opt) => {
                                    const active = refundType === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setRefundType(opt.value)}
                                            className={`rounded-lg border px-2 py-2 transition-all text-center ${
                                                active
                                                    ? "border-[#D27A8C] bg-gradient-to-br from-[#FCEBEF] to-white shadow-[0_3px_10px_rgba(226,107,124,0.18)]"
                                                    : "border-[#F8DCE2] bg-white hover:border-[#D27A8C]/50"
                                            }`}
                                        >
                                            <div className={`text-[11px] font-extrabold leading-tight ${active ? "text-[#8B3F50]" : "text-[#5C2A35]"}`}>{opt.label}</div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-1.5 text-[10px] text-[#8B5A66]">{REFUND_TYPE_OPTIONS.find((o) => o.value === refundType)?.description}</div>
                        </div>

                        {refundType === "customer_change" && (
                            <div>
                                <label className="mb-1 block text-[11px] font-bold text-[#8B3F50]">공통 위약률 (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="99"
                                    value={penaltyRatePct}
                                    onChange={(e) => setPenaltyRatePct(e.target.value)}
                                    placeholder="비워두면 시스템 기본값 (10%)"
                                    className="w-full h-9 rounded-lg border border-[#F8DCE2] bg-white px-3 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                />
                            </div>
                        )}

                        <div>
                            <label className="mb-1 block text-[11px] font-bold text-[#8B3F50]">
                                환불 사유 {refundType === "manual" && <span className="text-[#D27A8C]">*</span>}
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={2}
                                placeholder={refundType === "manual" ? "직접 입력 환불은 사유 필수" : "환불 사유 (선택)"}
                                className="w-full rounded-lg border border-[#F8DCE2] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20 resize-none"
                            />
                        </div>

                        {/* 위약금 결제수단 — 위약금 발생 시에만 노출 */}
                        {terminalSelections.length > 0 && refundType !== "hospital_fault" && (
                            <div>
                                <label className="mb-1 block text-[11px] font-bold text-[#8B3F50]">위약금 결제수단</label>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {([
                                        { value: "card", label: "카드" },
                                        { value: "pay", label: "간편결제" },
                                        { value: "cash", label: "현금" },
                                    ] as const).map(opt => {
                                        const active = rePaymentMethod === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setRePaymentMethod(opt.value)}
                                                className={`rounded-lg border px-2 py-1.5 text-[12px] font-bold transition-colors ${
                                                    active
                                                        ? "border-[#D27A8C] bg-[#FCEBEF] text-[#8B3F50]"
                                                        : "border-[#F8DCE2] bg-white text-[#5C2A35] hover:bg-[#FCF7F8]"
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="mt-1 text-[10px] text-[#8B5A66]">
                                    {rePaymentMethod === "cash"
                                        ? "고객이 위약금을 현금으로 결제. 단말기 호출 없이 기록만 됩니다."
                                        : `위약금을 ${rePaymentMethod === "pay" ? "간편결제" : "카드"} 단말기로 신규 결제합니다.`}
                                </div>
                            </div>
                        )}

                        {/* Summary */}
                        <div className="rounded-xl border border-[#F8DCE2] bg-gradient-to-b from-[#FCF7F8] to-white px-4 py-3">
                            <div className="text-[11px] font-extrabold text-[#8B3F50] mb-2">합계</div>
                            <div className="space-y-1.5 text-[12px]">
                                {membershipRefundTotal > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[#5C2A35] font-medium">회원권 정산</span>
                                        <span className="font-bold text-[#2A1F22] tabular-nums">+{formatWon(membershipRefundTotal)}</span>
                                    </div>
                                )}
                                {ticketsRefundTotal > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[#5C2A35] font-medium">단독 티켓 환불</span>
                                        <span className="font-bold text-[#2A1F22] tabular-nums">+{formatWon(ticketsRefundTotal)}</span>
                                    </div>
                                )}
                                <div className="border-t border-[#F8DCE2] mt-2 pt-2 flex justify-between items-center">
                                    <span className="text-[12px] font-bold text-[#8B5A66]">고객 환불액</span>
                                    <span className={`text-[18px] font-extrabold tabular-nums leading-none ${grandTotal > 0 ? "text-[#5C2A35]" : "text-[#C9A0A8]"}`}>
                                        {formatWon(grandTotal)}
                                    </span>
                                </div>
                                {deductionTotal > 0 && (
                                    <div className="mt-1.5 flex justify-between items-center bg-[#FCEBEF]/40 -mx-1 px-2 py-1.5 rounded-md">
                                        <span className="text-[12px] font-extrabold text-[#8B3F50]">공제액 (위약금+사용분)</span>
                                        <span className="text-[20px] font-black tabular-nums leading-none text-[#D27A8C]">
                                            {formatWon(deductionTotal)}
                                        </span>
                                    </div>
                                )}
                                {autoRefundTotal > 0 && manualRefundTotal > 0 && (
                                    <div className="mt-2 space-y-0.5 text-[11px]">
                                        <div className="flex justify-between text-[#5C2A35]">
                                            <span>· 단말기 자동 환불 (카드/페이)</span>
                                            <span className="font-bold tabular-nums">{formatWon(autoRefundTotal)}</span>
                                        </div>
                                        <div className="flex justify-between text-[#99354E]">
                                            <span>· 수기 환불 필요 (현금/계좌)</span>
                                            <span className="font-bold tabular-nums">{formatWon(manualRefundTotal)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {manualRefundTotal > 0 && (
                            <div className="rounded-lg border border-[#F4C7CE] bg-[#FCEBEF] px-3 py-2 text-[10.5px] text-[#8B3F50] leading-snug">
                                <div className="font-extrabold mb-0.5">⚠ 수기 환불 {formatWon(manualRefundTotal)} 별도 처리 필요</div>
                                <div className="text-[#8B5A66]">현금/계좌이체 환불분은 단말기 호출 없이 DB만 기록됩니다. 직원이 현금 출금 또는 계좌 이체를 직접 수행해 주세요.</div>
                            </div>
                        )}

                        {/* Terminal info */}
                        {terminalSelections.length > 0 && (
                            <div className="rounded-lg border border-[#F8DCE2] bg-[#FCEBEF]/30 px-3 py-2 text-[10px] text-[#5C2A35] space-y-1">
                                <div className="font-bold flex items-center gap-1">
                                    <CreditCard className="h-3 w-3" />
                                    단말기 자동 환불: {terminalSelections.length}건
                                </div>
                                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800 leading-relaxed">
                                    ⚠ 원결제와 <b>같은 단말기</b>에서만 자동 취소 가능합니다.<br/>
                                    다른 단말기면 본 결제 진행 후 그 단말기에서 직접 취소해야 합니다.
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer pt-1">
                                    <input
                                        type="checkbox"
                                        checked={manualSkipTerminal}
                                        onChange={(e) => setManualSkipTerminal(e.target.checked)}
                                        className="h-4 w-4 accent-[#D27A8C]"
                                    />
                                    <span className="text-[12px] font-bold text-[#99354E]">다른 단말기로 결제</span>
                                </label>
                            </div>
                        )}

                        {/* 영수증 보고 단말기 정보 수기 입력 — 원거래 정보 부족한 항목별 inline */}
                        {terminalSelections.filter(s => !isTerminalReady(s)).map(sel => {
                            const draft = terminalInfoDraft[sel.paymentDetailId] || { authNo: "", authDate: "", vanKey: "" };
                            const updateDraft = (patch: Partial<typeof draft>) => {
                                setTerminalInfoDraft(prev => ({ ...prev, [sel.paymentDetailId]: { ...draft, ...patch } }));
                            };
                            return (
                                <div key={sel.paymentDetailId} className="rounded-lg border border-[#F4C7CE] bg-[#FCEBEF]/60 px-3 py-2.5 text-[11px] text-[#8B3F50] space-y-2">
                                    <div className="font-extrabold">⚠ [{sel.itemName}] 원거래 정보 미등록</div>
                                    <div className="text-[10.5px] text-[#8B5A66] leading-snug">
                                        영수증을 보고 아래 3개 항목을 입력하면 단말기에서 자동으로 환불 처리할 수 있습니다.<br/>한 번 입력한 정보는 다음에 또 환불할 일이 있어도 자동으로 채워집니다.
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        <input
                                            type="text"
                                            value={draft.authNo}
                                            onChange={(e) => updateDraft({ authNo: e.target.value })}
                                            placeholder="승인번호"
                                            className="h-8 rounded-md border border-[#F4C7CE] bg-white px-2 text-[11px] outline-none focus:border-[#D27A8C]"
                                        />
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={8}
                                            value={draft.authDate}
                                            onChange={(e) => updateDraft({ authDate: e.target.value.replace(/\D/g, "") })}
                                            placeholder="거래일시 YYYYMMDD"
                                            className="h-8 rounded-md border border-[#F4C7CE] bg-white px-2 text-[11px] outline-none focus:border-[#D27A8C]"
                                        />
                                        <input
                                            type="text"
                                            value={draft.vanKey}
                                            onChange={(e) => updateDraft({ vanKey: e.target.value })}
                                            placeholder="VANKEY"
                                            className="h-8 rounded-md border border-[#F4C7CE] bg-white px-2 text-[11px] outline-none focus:border-[#D27A8C]"
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => void saveTerminalInfoFor(sel)}
                                            disabled={savingTerminalInfoFor === sel.paymentDetailId}
                                            className="h-7 rounded-md bg-[#D27A8C] px-3 text-[11px] font-bold text-white hover:bg-[#8B3F50] disabled:opacity-50 transition-colors"
                                        >
                                            {savingTerminalInfoFor === sel.paymentDetailId ? "저장 중..." : "단말기 정보 저장"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Progress overlay during submission */}
                {submitting && progress.phase !== "idle" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#2A1F22]/40 backdrop-blur-sm">
                        <div className="rounded-2xl border border-[#F8DCE2] bg-white px-8 py-6 shadow-2xl text-center">
                            <div className="h-10 w-10 mx-auto mb-3 rounded-full border-4 border-[#F8DCE2] border-t-[#D27A8C] animate-spin" />
                            {progress.phase === "repayment" && (
                                <>
                                    <div className="text-[14px] font-extrabold text-[#5C2A35]">
                                        위약금 결제 진행 중 ({progress.current}/{progress.total})
                                    </div>
                                    <div className="text-[11px] text-[#8B5A66] mt-1">{progress.itemName}</div>
                                    <div className="text-[12px] text-[#D27A8C] font-bold mt-2 tabular-nums">{formatWon(progress.amount)}</div>
                                    <div className="text-[10px] text-[#8B5A66] mt-1">고객 카드에 위약금이 신규 결제됩니다</div>
                                </>
                            )}
                            {progress.phase === "void" && (
                                <>
                                    <div className="text-[14px] font-extrabold text-[#5C2A35]">
                                        원래 결제 카드 환불 진행 중 ({progress.current}/{progress.total})
                                    </div>
                                    <div className="text-[11px] text-[#8B5A66] mt-1">{progress.itemName}</div>
                                    <div className="text-[12px] text-[#D27A8C] font-bold mt-2 tabular-nums">{formatWon(progress.amount)}</div>
                                    <div className="text-[10px] text-[#8B5A66] mt-1">원거래 전체 금액이 카드사에 환불됩니다</div>
                                </>
                            )}
                            {progress.phase === "backend" && (
                                <>
                                    <div className="text-[14px] font-extrabold text-[#5C2A35]">환불 기록 저장 중</div>
                                    <div className="text-[11px] text-[#8B5A66] mt-1">{progress.itemName}</div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-[#F8DCE2] px-6 py-3 bg-gradient-to-b from-[#FCF7F8] to-white shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="h-10 rounded-xl border border-[#F8DCE2] bg-white px-5 text-[13px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF] disabled:opacity-50 transition-all"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={refundDisabled}
                        className="h-10 rounded-xl px-6 text-[13px] font-extrabold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-[1px] disabled:hover:translate-y-0"
                        style={{
                            background: refundDisabled
                                ? "linear-gradient(135deg, #E5B5C0 0%, #D4A5B0 100%)"
                                : "linear-gradient(135deg, #D27A8C 0%, #8B3F50 100%)",
                            boxShadow: refundDisabled ? "none" : "0 8px 22px rgba(210, 122, 140, 0.38)",
                        }}
                    >
                        {submitting ? "처리 중..." : (deductionTotal > 0 ? `공제액 ${formatWon(deductionTotal)} 결제 및 환불` : `${formatWon(grandTotal)} 환불 처리`)}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ============================================================
// Sub-components
// ============================================================

interface MembershipPreview {
    selection: UnifiedRefundSelection;
    info: MembershipSettlementInfo | null;
    total: number;
    balance: number;
    ticketsTotal: number;
    penalty: number;
}

function MembershipPreviewCard({ preview }: { preview: MembershipPreview }) {
    const { selection, info, total, balance, ticketsTotal, penalty } = preview;

    if (!info) {
        return (
            <div className="rounded-xl border border-[#F8DCE2] bg-white px-4 py-3">
                <div className="text-[12px] font-bold text-[#2A1F22]">{selection.itemName}</div>
                <div className="text-[10px] text-[#C9A0A8] italic mt-1">조회 중...</div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-[#D27A8C]/40 bg-gradient-to-br from-[#FCEBEF]/30 to-white px-4 py-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold text-[#8B3F50] tracking-wider">📒 회원권 정산</span>
                {info.membershipAlreadyRefunded && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#FCEBEF] text-[#8B3F50]">이미 환불됨</span>
                )}
            </div>
            <div className="text-[13px] font-bold text-[#2A1F22] mb-2">{info.membershipName}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] mb-2">
                <div className="flex justify-between">
                    <span className="text-[#8B5A66]">잔액 회수</span>
                    <span className="font-bold text-[#2A1F22] tabular-nums">+{formatWon(balance)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-[#8B5A66]">티켓 환불</span>
                    <span className="font-bold text-[#2A1F22] tabular-nums">+{formatWon(ticketsTotal)}</span>
                </div>
                {penalty > 0 && (
                    <div className="flex justify-between col-span-2">
                        <span className="text-[#8B5A66]">위약금</span>
                        <span className="font-bold text-[#C53030] tabular-nums">−{formatWon(penalty)}</span>
                    </div>
                )}
            </div>
            {info.linkedTickets.filter((t) => !t.alreadyRefunded).length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#F8DCE2]">
                    <div className="text-[10px] font-bold text-[#8B5A66] mb-1.5">🔗 연결 티켓 {info.linkedTickets.filter((t) => !t.alreadyRefunded).length}건</div>
                    <div className="space-y-1">
                        {info.linkedTickets.filter((t) => !t.alreadyRefunded).map((t) => {
                            const single = Number(t.singleSessionPrice || 0);
                            const usageDeduction = Math.round(single * Number(t.usedCount || 0));
                            return (
                                <div key={t.paymentDetailId} className="rounded-md bg-white border border-[#F8DCE2] px-2 py-1.5">
                                    <div className="text-[11px] font-semibold text-[#2A1F22] break-words" title={t.ticketName}>{t.ticketName}</div>
                                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-[#8B5A66]">
                                        <div className="flex justify-between"><span>결제액</span><span className="tabular-nums text-[#2A1F22]">{formatWon(t.paidViaMembership)}</span></div>
                                        <div className="flex justify-between"><span>환불액</span><span className="tabular-nums font-bold text-[#D27A8C]">+{formatWon(t.estimatedRefund)}</span></div>
                                        {single > 0 && (
                                            <div className="col-span-2 flex justify-between text-rose-500">
                                                <span>사용 차감 ({t.usedCount}/{t.totalCount}회)</span>
                                                <span className="tabular-nums">−{formatWon(usageDeduction)} <span className="text-[9px] text-rose-400">(1회 {formatWon(single)} × {t.usedCount}회)</span></span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            <div className="mt-2 pt-2 border-t border-[#F8DCE2] flex justify-between items-center">
                <span className="text-[11px] font-bold text-[#5C2A35]">소계</span>
                <span className="text-[16px] font-black text-[#D27A8C] tabular-nums">{formatWon(total)}</span>
            </div>
        </div>
    );
}

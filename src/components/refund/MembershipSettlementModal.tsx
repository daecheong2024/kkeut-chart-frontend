import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import {
    paymentService,
    type MembershipSettlementInfo,
    type MembershipSettlementLinkedTicket,
    type RefundType,
} from "../../services/paymentService";
import { kisTerminalService } from "../../services/kisTerminalService";
import { isManualPaymentMode } from "../../utils/terminalMode";
import { useAlert } from "../ui/AlertDialog";

const SETTLEMENT_REFUND_TYPES: Array<{ value: RefundType; label: string; description: string }> = [
    { value: "customer_change", label: "위약금/정상가 차감", description: "잔액 + 티켓별 (결제액 - 1회 정상가 × 사용횟수) - 위약금" },
    { value: "hospital_fault", label: "n/1 차감", description: "잔액 + 티켓별 (결제액 ÷ 총횟수 × 잔여횟수). 위약금 없음" },
    { value: "manual", label: "기타", description: "직원이 총 환불액을 직접 입력 (사유 필수)" },
];

export interface MembershipSettlementModalProps {
    open: boolean;
    /** Either membershipRootId OR paymentDetailId must be provided */
    membershipRootId?: number;
    paymentDetailId?: number;
    membershipName?: string;
    /** 회원권 본체(카드 결제분) 2단계 패턴용 원거래 정보. 없으면 단말기 호출 생략. */
    membershipCardTerminalInfo?: {
        authNo?: string;
        authDate?: string;
        vanKey?: string;
        paymentType?: string;
    };
    onClose: () => void;
    onRefunded: (totalRefund: number) => void;
}

type SettlementProgressState =
    | { phase: "idle" }
    | { phase: "repayment"; amount: number }
    | { phase: "void"; amount: number }
    | { phase: "backend" };

function formatWon(value: number): string {
    return `${Math.max(0, Math.round(value)).toLocaleString()}원`;
}

function buildSettlementOperationKey(membershipRootId: number, paymentDetailId?: number): string {
    return `membership-settlement-${membershipRootId}-${paymentDetailId || 0}`;
}

function createOperationIdempotencyKey(prefix: string): string {
    const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${suffix}`;
}

export function MembershipSettlementModal({
    open,
    membershipRootId,
    paymentDetailId,
    membershipName,
    membershipCardTerminalInfo,
    onClose,
    onRefunded,
}: MembershipSettlementModalProps) {
    const { showAlert, showConfirm } = useAlert();
    const [info, setInfo] = useState<MembershipSettlementInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refundType, setRefundType] = useState<RefundType>("customer_change");
    const [selectedDetailIds, setSelectedDetailIds] = useState<Set<number>>(new Set());
    const [penaltyRatePct, setPenaltyRatePct] = useState<string>("");
    const [manualAmount, setManualAmount] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [rePaymentMethod, setRePaymentMethod] = useState<"card" | "cash" | "pay">("card");
    const [submitting, setSubmitting] = useState(false);
    const [progress, setProgress] = useState<SettlementProgressState>({ phase: "idle" });

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
        if (!open) return;
        setError(null);
        setInfo(null);
        setRefundType("customer_change");
        setSelectedDetailIds(new Set());
        setPenaltyRatePct("");
        setManualAmount("");
        setReason("");
        setLoading(true);

        const loader = membershipRootId
            ? paymentService.getMembershipSettlement(membershipRootId)
            : paymentDetailId
                ? paymentService.getMembershipSettlementByPaymentDetail(paymentDetailId)
                : Promise.reject(new Error("membershipRootId 또는 paymentDetailId 가 필요합니다."));

        loader
            .then((data) => {
                setInfo(data);
                // Default-select all non-refunded linked tickets
                const eligible = data.linkedTickets.filter((t) => !t.alreadyRefunded);
                setSelectedDetailIds(new Set(eligible.map((t) => t.paymentDetailId)));
                setPenaltyRatePct((data.defaultPenaltyRate * 100).toString());
            })
            .catch((e: any) => {
                const message = e?.response?.data?.message || e?.message || "정산 정보 로드 실패";
                setError(message);
            })
            .finally(() => setLoading(false));
    }, [open, membershipRootId, paymentDetailId]);

    const toggleSelect = (id: number) => {
        setSelectedDetailIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (!info) return;
        const eligible = info.linkedTickets.filter((t) => !t.alreadyRefunded);
        if (selectedDetailIds.size === eligible.length) {
            setSelectedDetailIds(new Set());
        } else {
            setSelectedDetailIds(new Set(eligible.map((t) => t.paymentDetailId)));
        }
    };

    // Compute per-ticket refund amount based on refund type
    const ticketRefundForType = (t: MembershipSettlementLinkedTicket, type: RefundType): number => {
        if (t.alreadyRefunded) return 0;
        if (type === "customer_change") {
            return t.estimatedRefund; // already calculated as max(0, paid - singlePrice * usedCount)
        }
        if (type === "hospital_fault") {
            if (t.totalCount <= 0) return 0;
            return Math.round((t.paidViaMembership * t.remainingCount) / t.totalCount);
        }
        return 0; // manual: per-ticket not used
    };

    // Live preview based on selection + refund type
    const preview = useMemo(() => {
        if (!info) return null;

        if (refundType === "manual") {
            const total = manualAmount === "" ? 0 : Math.max(0, Number(manualAmount));
            return {
                refundType,
                rate: 0,
                balanceRefund: 0,
                ticketsTotal: 0,
                penalty: 0,
                total,
            };
        }

        const rate = refundType === "hospital_fault"
            ? 0
            : (penaltyRatePct === "" ? info.defaultPenaltyRate : Math.max(0, Math.min(0.99, Number(penaltyRatePct) / 100)));

        const balanceRefund = info.membershipAlreadyRefunded ? 0 : info.currentCashBalance;
        const ticketsTotal = info.linkedTickets
            .filter((t) => selectedDetailIds.has(t.paymentDetailId) && !t.alreadyRefunded)
            .reduce((s, t) => s + ticketRefundForType(t, refundType), 0);
        const penalty = info.membershipAlreadyRefunded ? 0 : Math.round(info.discountedPurchasePrice * rate);
        const total = Math.max(0, balanceRefund + ticketsTotal - penalty);
        return { refundType, rate, balanceRefund, ticketsTotal, penalty, total };
    }, [info, refundType, selectedDetailIds, penaltyRatePct, manualAmount]);

    const handleSubmit = async () => {
        if (!info || !preview) return;
        const operationKey = buildSettlementOperationKey(info.membershipRootId, paymentDetailId);
        if (preview.total <= 0) {
            showAlert({ message: "환불 가능 금액이 없습니다.", type: "warning" });
            return;
        }
        if (refundType === "manual" && !reason.trim()) {
            showAlert({ message: "직접 입력 환불은 사유가 필수입니다.", type: "warning" });
            return;
        }

        // 2단계 패턴: 카드 결제된 회원권이면 (1) 위약금 재결제 → (2) 원거래 전체취소 → BE 기록
        const cardInfo = membershipCardTerminalInfo;
        const isCardRefundable =
            !isManualPaymentMode()
            && refundType !== "manual"
            && !!cardInfo
            && ((cardInfo.paymentType || "").toUpperCase() === "CARD" || (cardInfo.paymentType || "").toUpperCase() === "PAY")
            && !!cardInfo.authNo && !!cardInfo.authDate && !!cardInfo.vanKey
            && !info.membershipAlreadyRefunded;

        setSubmitting(true);

        let rePaymentAuth: {
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
        } | undefined;
        let voidAuth: { amount: number; authNo: string; authDate: string; vanKey: string } | undefined;

        if (isCardRefundable && cardInfo) {
            const connectOk = await kisTerminalService.connect().catch(() => false);
            if (!connectOk) {
                const proceed = await showConfirm({
                    message: "단말기 연결에 실패했습니다.\n수동 환불(단말기 없이 진행)으로 진행하시겠습니까?\n\n※ 카드 환불은 별도로 카드사에 직접 요청해야 합니다.",
                    type: "warning",
                    confirmText: "수동 진행",
                    cancelText: "취소",
                });
                if (!proceed) { setSubmitting(false); return; }
            }

            const tradePayType = (cardInfo.paymentType?.toUpperCase() === "PAY") ? "v1" as const : "D1" as const;
            const tradeRefType = (cardInfo.paymentType?.toUpperCase() === "PAY") ? "v2" as const : "D2" as const;
            const penaltyAmount = preview.penalty;
            const paidAmount = info.discountedPurchasePrice;

            if (penaltyAmount > 0) {
                setProgress({ phase: "repayment", amount: penaltyAmount });
                if (rePaymentMethod === "cash") {
                    rePaymentAuth = { amount: penaltyAmount, authNo: "", authDate: "", vanKey: "" };
                } else {
                    const repayTradeType = (rePaymentMethod === "pay") ? "v1" as const : "D1" as const;
                    try {
                        const r = await kisTerminalService.requestPayment({ tradeType: repayTradeType, amount: penaltyAmount });
                        if (!r.success) {
                            setProgress({ phase: "idle" });
                            setSubmitting(false);
                            showAlert({ message: `위약금 재결제 실패: ${r.displayMsg || r.replyCode}`, type: "error" });
                            return;
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
                        setProgress({ phase: "idle" });
                        setSubmitting(false);
                        showAlert({ message: `위약금 재결제 호출 실패: ${e?.message || "오류"}`, type: "error" });
                        return;
                    }
                }
            }

            if (rePaymentAuth && penaltyAmount > 0) {
                await showConfirm({
                    message: "위약금 결제가 완료되었습니다.\n\n카드를 단말기에서 빼신 후 [확인]을 눌러주세요.\n→ 원거래 전체취소를 진행합니다.",
                    type: "info",
                    confirmText: "확인",
                    cancelText: "",
                });
            }

            setProgress({ phase: "void", amount: paidAmount });
            try {
                const r = await kisTerminalService.requestRefund({
                    tradeType: tradeRefType,
                    amount: paidAmount,
                    orgAuthDate: cardInfo.authDate!,
                    orgAuthNo: cardInfo.authNo!,
                    vanKey: cardInfo.vanKey!,
                });
                if (!r.success) {
                    setProgress({ phase: "idle" });
                    setSubmitting(false);
                    const warn = rePaymentAuth
                        ? `\n⚠ 위약금 재결제(${formatWon(rePaymentAuth.amount)}, 승인번호 ${rePaymentAuth.authNo})는 이미 승인됨 → 직원 수동 환불 필요`
                        : "";
                    showAlert({ message: `원거래 전체취소 실패: ${r.displayMsg || r.replyCode}${warn}`, type: "error" });
                    return;
                }
                voidAuth = { amount: paidAmount, authNo: r.authNo, authDate: r.replyDate, vanKey: r.vanKey };
            } catch (e: any) {
                setProgress({ phase: "idle" });
                setSubmitting(false);
                const warn = rePaymentAuth
                    ? `\n⚠ 위약금 재결제(${formatWon(rePaymentAuth.amount)}, 승인번호 ${rePaymentAuth.authNo})는 이미 승인됨 → 직원 수동 환불 필요`
                    : "";
                showAlert({ message: `원거래 전체취소 호출 실패: ${e?.message || "오류"}${warn}`, type: "error" });
                return;
            }
        }

        if (!rePaymentAuth && preview.penalty > 0) {
            rePaymentAuth = { amount: preview.penalty, authNo: "", authDate: "", vanKey: "" };
        }

        setProgress({ phase: "backend" });
        try {
            const result = await paymentService.executeMembershipSettlement(info.membershipRootId, {
                refundType,
                includedPaymentDetailIds: refundType === "manual" ? [] : Array.from(selectedDetailIds),
                penaltyRate: refundType === "hospital_fault" ? 0 : preview.rate,
                manualAmount: refundType === "manual" ? preview.total : undefined,
                reason: reason.trim() || undefined,
                membershipCardRefundAmount: voidAuth?.amount,
                membershipCardRefundAuthNo: voidAuth?.authNo,
                membershipCardRefundDate: voidAuth?.authDate,
                membershipCardRefundVanKey: voidAuth?.vanKey,
                refundMethod: voidAuth ? "AUTO" : "MANUAL",
                rePaymentAmount: rePaymentAuth?.amount,
                rePaymentMethod: rePaymentAuth ? rePaymentMethod.toUpperCase() : undefined,
                rePaymentTerminalAuthNo: rePaymentAuth?.authNo,
                rePaymentTerminalAuthDate: rePaymentAuth?.authDate,
                rePaymentVanKey: rePaymentAuth?.vanKey,
                rePaymentCardCompany: rePaymentAuth?.cardCompany,
                rePaymentInstallment: rePaymentAuth?.installment,
                rePaymentTerminalCardNo: rePaymentAuth?.cardNo,
                rePaymentTerminalTranNo: rePaymentAuth?.tranNo,
                rePaymentTerminalAccepterName: rePaymentAuth?.accepterName,
                rePaymentTerminalCatId: rePaymentAuth?.catId,
                rePaymentTerminalMerchantRegNo: rePaymentAuth?.merchantRegNo,
                operationKey,
                idempotencyKey: createOperationIdempotencyKey(`membership-settlement-${info.membershipRootId}`),
            });
            if (result.success) {
                showAlert({
                    message: `${formatWon(result.totalRefundAmount)} 정산 환불 완료\n· 회원권 잔액 ${formatWon(result.membershipBalanceRefund)}\n· 티켓 ${formatWon(result.linkedTicketsRefundTotal)}\n· 위약금 −${formatWon(result.membershipPenaltyAmount)}`,
                    type: "success",
                });
            } else {
                showAlert({
                    message: `${result.message}\n총 환불 ${formatWon(result.totalRefundAmount)}`,
                    type: "warning",
                });
            }
            onRefunded(result.totalRefundAmount);
            onClose();
        } catch (e: any) {
            const message = e?.response?.data?.message || e?.message || "정산 처리 실패";
            const warn = rePaymentAuth
                ? `\n⚠ 단말기 카드 처리는 모두 정상이지만 시스템 기록 실패 → 운영자 문의 필요 (위약금 결제 승인번호 ${rePaymentAuth.authNo}, 카드 환불 승인번호 ${voidAuth?.authNo})`
                : "";
            showAlert({ message: `${message}${warn}`, type: "error" });
        } finally {
            setProgress({ phase: "idle" });
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const eligibleTickets = info?.linkedTickets.filter((t) => !t.alreadyRefunded) ?? [];
    const allSelected = info != null && eligibleTickets.length > 0 && selectedDetailIds.size === eligibleTickets.length;

    return createPortal(
        <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] px-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative w-full max-w-[920px] rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150 overflow-hidden">
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-[#F8DCE2] px-6 py-3 bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#D27A8C] to-[#8B3F50]" />
                    <div className="pl-2 min-w-0">
                        <div className="text-[15px] font-extrabold text-[#5C2A35]">회원권 정산 환불</div>
                        <div className="text-[11px] text-[#8B5A66] truncate max-w-[560px]">
                            {info?.membershipName || membershipName || ""}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#F8DCE2] bg-white text-[#8B3F50] hover:text-[#5C2A35] hover:bg-[#FCEBEF] hover:border-[#D27A8C]/40 transition-all shadow-sm"
                        title="닫기"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="h-10 w-10 rounded-full border-2 border-[#F8DCE2] border-t-[#D27A8C] animate-spin" />
                    </div>
                ) : error ? (
                    <div className="px-6 py-10 text-center text-[#C53030] text-sm">{error}</div>
                ) : info ? (
                    <>
                        {/* Body */}
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 px-6 py-4 max-h-[68vh] overflow-y-auto">
                            {/* LEFT — Membership info + linked tickets */}
                            <div className="space-y-3">
                                {/* Membership header card */}
                                <div className="rounded-xl border border-[#F8DCE2] bg-gradient-to-br from-[#FCEBEF]/60 to-[#FCF7F8] px-4 py-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-extrabold text-[#8B3F50] tracking-[0.2px]">회원권 본체</span>
                                        {info.membershipAlreadyRefunded && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FCEBEF] text-[#8B3F50]">환불됨</span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                                        <div className="flex justify-between">
                                            <span className="text-[#8B5A66]">실결제</span>
                                            <span className="font-bold text-[#2A1F22] tabular-nums">{formatWon(info.discountedPurchasePrice)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8B5A66]">보너스</span>
                                            <span className="font-bold text-[#2A1F22] tabular-nums">+{formatWon(info.snapshotBonusPoint)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8B5A66]">현재 잔액 <span className="text-[10px]">(현금)</span></span>
                                            <span className="font-bold text-[#D27A8C] tabular-nums">{formatWon(info.currentCashBalance)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8B5A66]">현재 잔액 <span className="text-[10px]">(포인트)</span></span>
                                            <span className="font-bold text-[#8B5A66] tabular-nums">{formatWon(info.currentPointBalance)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Linked tickets */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[11px] font-extrabold text-[#8B3F50] tracking-[0.2px]">
                                            연결 티켓 ({info.linkedTickets.length}건)
                                        </span>
                                        {eligibleTickets.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={toggleAll}
                                                className="text-[10px] font-bold text-[#8B3F50] hover:underline"
                                            >
                                                {allSelected ? "전체 해제" : "전체 선택"}
                                            </button>
                                        )}
                                    </div>
                                    {eligibleTickets.length === 0 ? (
                                        <div className="text-[11px] text-[#C9A0A8] italic px-3 py-3 rounded-lg border border-dashed border-[#F8DCE2] text-center">
                                            환불 가능한 티켓이 없습니다.
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-[#F8DCE2] divide-y divide-[#F8DCE2]/60 max-h-[330px] overflow-y-auto">
                                            {info.linkedTickets.filter((t: MembershipSettlementLinkedTicket) => !t.alreadyRefunded).map((ticket: MembershipSettlementLinkedTicket) => {
                                                const isSelected = selectedDetailIds.has(ticket.paymentDetailId);
                                                const disabled = ticket.alreadyRefunded;
                                                return (
                                                    <button
                                                        key={ticket.paymentDetailId}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => !disabled && toggleSelect(ticket.paymentDetailId)}
                                                        className={`w-full text-left px-3 py-2.5 transition-colors ${
                                                            disabled
                                                                ? "bg-[#FCF7F8] cursor-not-allowed opacity-60"
                                                                : isSelected
                                                                ? "bg-[#FCEBEF]/60 hover:bg-[#FCEBEF]"
                                                                : "hover:bg-[#FCF7F8]"
                                                        }`}
                                                    >
                                                        <div className="flex items-start gap-2.5">
                                                            <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                                                disabled ? "border-[#F8DCE2] bg-[#F8DCE2]" :
                                                                isSelected ? "border-[#D27A8C] bg-[#D27A8C]" : "border-[#F8DCE2] bg-white"
                                                            }`}>
                                                                {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[12px] font-bold text-[#2A1F22] truncate">{ticket.ticketName}</span>
                                                                    {disabled && <span className="text-[9px] font-bold text-[#8B5A66] bg-[#F8DCE2] px-1 py-0.5 rounded">환불됨</span>}
                                                                </div>
                                                                <div className="text-[10px] text-[#8B5A66] mt-0.5">
                                                                    {formatWon(ticket.paidViaMembership)} · 사용 {ticket.usedCount}/{ticket.totalCount}회
                                                                    {ticket.singleSessionPrice ? ` · 1회 ${formatWon(ticket.singleSessionPrice)}` : ""}
                                                                </div>
                                                            </div>
                                                                            {(() => {
                                                                const liveRefund = ticketRefundForType(ticket, refundType);
                                                                return (
                                                                    <div className={`text-[13px] font-extrabold tabular-nums shrink-0 ${
                                                                        disabled || liveRefund <= 0 ? "text-[#C9A0A8]" : "text-[#D27A8C]"
                                                                    }`}>
                                                                        {formatWon(liveRefund)}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT — Type + penalty/manual + reason + summary */}
                            <div className="space-y-3">
                                {/* Refund type selector */}
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-bold text-[#8B3F50]">정산 유형</label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {SETTLEMENT_REFUND_TYPES.map((opt) => {
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
                                    <div className="mt-1.5 text-[10px] text-[#8B5A66] leading-snug">
                                        {SETTLEMENT_REFUND_TYPES.find((o) => o.value === refundType)?.description}
                                    </div>
                                </div>

                                {refundType === "customer_change" && (
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-[#8B3F50]">
                                            회원권 위약률 (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="99"
                                            value={penaltyRatePct}
                                            onChange={(e) => setPenaltyRatePct(e.target.value)}
                                            placeholder={`기본 ${(info.defaultPenaltyRate * 100).toFixed(0)}%`}
                                            className="w-full h-9 rounded-lg border border-[#F8DCE2] bg-white px-3 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                        />
                                        <div className="mt-1 text-[10px] text-[#8B5A66]">
                                            회원권 본체 결제액 기준 1회 부과 (티켓별 별도 위약금 없음)
                                        </div>
                                    </div>
                                )}

                                {refundType === "manual" && (
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-[#8B3F50]">
                                            총 환불 금액 (직접 입력)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={manualAmount}
                                            onChange={(e) => setManualAmount(e.target.value)}
                                            placeholder="환불할 금액을 직접 입력"
                                            className="w-full h-9 rounded-lg border border-[#F8DCE2] bg-white px-3 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                        />
                                        <div className="mt-1 text-[10px] text-[#8B5A66]">
                                            회원권 본체에 환불 처리됩니다. 연결 티켓은 별도 처리되지 않습니다.
                                        </div>
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
                                        placeholder={refundType === "manual" ? "직접 입력 환불은 사유가 필수입니다." : "환불 사유 (선택)"}
                                        className="w-full rounded-lg border border-[#F8DCE2] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20 resize-none"
                                    />
                                </div>

                                {(preview?.penalty ?? 0) > 0 && refundType !== "hospital_fault" && (
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
                                                            active ? "border-[#D27A8C] bg-[#FCEBEF] text-[#8B3F50]" : "border-[#F8DCE2] bg-white text-[#5C2A35] hover:bg-[#FCF7F8]"
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
                                    <div className="text-[11px] font-extrabold text-[#8B3F50] mb-2">정산 합계</div>
                                    {preview && (
                                        <div className="space-y-1.5 text-[12px]">
                                            {refundType !== "manual" && (
                                                <>
                                                    <div className="flex justify-between">
                                                        <span className="text-[#5C2A35] font-medium">회원권 잔액 회수</span>
                                                        <span className="font-bold text-[#2A1F22] tabular-nums">+{formatWon(preview.balanceRefund)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-[#5C2A35] font-medium">선택 티켓 환불</span>
                                                        <span className="font-bold text-[#2A1F22] tabular-nums">+{formatWon(preview.ticketsTotal)}</span>
                                                    </div>
                                                    {preview.penalty > 0 && (
                                                        <div className="flex justify-between">
                                                            <span className="text-[#5C2A35] font-medium">위약금 ({(preview.rate * 100).toFixed(1)}%)</span>
                                                            <span className="font-bold text-[#C53030] tabular-nums">−{formatWon(preview.penalty)}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {refundType === "manual" && (
                                                <div className="flex justify-between">
                                                    <span className="text-[#5C2A35] font-medium">직접 입력 금액</span>
                                                    <span className="font-bold text-[#2A1F22] tabular-nums">+{formatWon(preview.total)}</span>
                                                </div>
                                            )}
                                            <div className="border-t border-[#F8DCE2] mt-2 pt-2 flex justify-between items-center">
                                                <span className="text-[14px] font-extrabold text-[#5C2A35]">총 환불액</span>
                                                <span className={`text-[22px] font-black tabular-nums leading-none ${preview.total > 0 ? "text-[#D27A8C]" : "text-[#C9A0A8]"}`}>
                                                    {formatWon(preview.total)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-lg bg-[#FCF7F8] border border-[#F8DCE2] px-3 py-2 text-[10px] text-[#8B5A66] leading-relaxed space-y-1">
                                    <div>💡 <b>처리 흐름:</b> 선택된 티켓이 먼저 환불되어 회원권 잔액이 복구되고, 그 합계에서 위약금을 차감한 금액이 고객에게 환불됩니다.</div>
                                    <div>🚫 보너스 포인트({formatWon(info.snapshotBonusPoint)})는 무상지급분이라 환불에서 제외됩니다.</div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-2 border-t border-[#F8DCE2] px-6 py-3 bg-gradient-to-b from-[#FCF7F8] to-white">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={submitting}
                                className="h-10 rounded-xl border border-[#F8DCE2] bg-white px-5 text-[13px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF] hover:border-[#D27A8C]/40 disabled:opacity-50 transition-all"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitting || info.membershipAlreadyRefunded || !preview || preview.total <= 0}
                                className="h-10 rounded-xl px-6 text-[13px] font-extrabold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-[1px] disabled:hover:translate-y-0"
                                style={{
                                    background: submitting || info.membershipAlreadyRefunded || !preview || preview.total <= 0
                                        ? "linear-gradient(135deg, #E5B5C0 0%, #D4A5B0 100%)"
                                        : "linear-gradient(135deg, #D27A8C 0%, #8B3F50 100%)",
                                    boxShadow: submitting || info.membershipAlreadyRefunded || !preview || preview.total <= 0
                                        ? "none"
                                        : "0 8px 22px rgba(210, 122, 140, 0.38)",
                                }}
                            >
                                {submitting ? "처리 중..." : ((preview?.penalty ?? 0) > 0 ? `공제액 ${formatWon(preview?.penalty ?? 0)} 결제 및 환불` : "정산 환불 처리")}
                            </button>
                        </div>
                    </>
                ) : null}

                {submitting && progress.phase !== "idle" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#2A1F22]/40 backdrop-blur-sm">
                        <div className="rounded-2xl border border-[#F8DCE2] bg-white px-8 py-6 shadow-2xl text-center">
                            <div className="h-10 w-10 mx-auto mb-3 rounded-full border-4 border-[#F8DCE2] border-t-[#D27A8C] animate-spin" />
                            {progress.phase === "repayment" && (
                                <>
                                    <div className="text-[14px] font-extrabold text-[#5C2A35]">위약금 결제 진행 중</div>
                                    <div className="text-[12px] text-[#D27A8C] font-bold mt-2 tabular-nums">{formatWon(progress.amount)}</div>
                                    <div className="text-[10px] text-[#8B5A66] mt-1">고객 카드에 위약금이 신규 결제됩니다</div>
                                </>
                            )}
                            {progress.phase === "void" && (
                                <>
                                    <div className="text-[14px] font-extrabold text-[#5C2A35]">원래 결제 카드 환불 진행 중</div>
                                    <div className="text-[12px] text-[#D27A8C] font-bold mt-2 tabular-nums">{formatWon(progress.amount)}</div>
                                    <div className="text-[10px] text-[#8B5A66] mt-1">원거래 전체 금액이 카드사에 환불됩니다</div>
                                </>
                            )}
                            {progress.phase === "backend" && (
                                <div className="text-[14px] font-extrabold text-[#5C2A35]">환불 기록 저장 중</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

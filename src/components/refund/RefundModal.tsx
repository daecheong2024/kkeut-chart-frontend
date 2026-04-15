import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, CreditCard } from "lucide-react";
import {
    paymentService,
    type RefundCalculateResult,
    type RefundType,
} from "../../services/paymentService";
import { kisTerminalService } from "../../services/kisTerminalService";
import { useAlert } from "../ui/AlertDialog";

export interface RefundModalProps {
    open: boolean;
    paymentMasterId: number;
    paymentDetailId: number;
    itemName: string;
    itemType: "ticket" | "membership" | string;
    /** 카드/페이 결제 단건 환불 시 2단계 패턴용 원거래 정보 */
    paymentType?: string;
    terminalInfo?: {
        authNo?: string;
        authDate?: string;
        vanKey?: string;
    };
    onClose: () => void;
    onRefunded: (result: { refundAmount: number; refundType: string }) => void;
}

type RefundProgressState =
    | { phase: "idle" }
    | { phase: "repayment"; amount: number }
    | { phase: "void"; amount: number }
    | { phase: "backend" };

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

function isTerminalPayment(paymentType?: string): boolean {
    const upper = (paymentType || "").toUpperCase();
    return upper === "CARD" || upper === "PAY";
}

const REFUND_TYPE_OPTIONS: Array<{ value: RefundType; label: string; description: string }> = [
    { value: "customer_change", label: "고객 단순변심", description: "결제액 - 위약금 - (1회 정상가 × 사용횟수)" },
    { value: "hospital_fault", label: "병원 귀책", description: "결제액 ÷ 총횟수 × 잔여횟수 (위약금 없음)" },
    { value: "manual", label: "기타 (직접 입력)", description: "직원이 환불액을 직접 입력 (사유 필수)" },
];

function formatWon(value: number): string {
    return `${Math.max(0, Math.round(value)).toLocaleString()}원`;
}

export function RefundModal({
    open,
    paymentMasterId,
    paymentDetailId,
    itemName,
    itemType,
    paymentType,
    terminalInfo,
    onClose,
    onRefunded,
}: RefundModalProps) {
    const { showAlert, showConfirm } = useAlert();
    const [progress, setProgress] = useState<RefundProgressState>({ phase: "idle" });
    const [skipTerminal, setSkipTerminal] = useState(false);
    // 위약금 결제수단 (직원 선택). 기본: 카드. 현금 선택 시 단말기 호출 스킵.
    const [rePaymentMethod, setRePaymentMethod] = useState<"card" | "cash" | "pay">("card");

    // 영수증 보고 직원이 단말기 정보를 직접 입력할 수 있게 로컬 상태로도 관리
    // (props.terminalInfo 가 없거나 부족할 때 inline 입력 → 저장 → 환불 진행)
    const [localTerminalAuthNo, setLocalTerminalAuthNo] = useState<string>("");
    const [localTerminalAuthDate, setLocalTerminalAuthDate] = useState<string>("");
    const [localTerminalVanKey, setLocalTerminalVanKey] = useState<string>("");
    const [savingTerminalInfo, setSavingTerminalInfo] = useState(false);
    const [terminalInfoSaved, setTerminalInfoSaved] = useState<{ authNo: string; authDate: string; vanKey: string } | null>(null);

    useEffect(() => {
        if (!open) return;
        setLocalTerminalAuthNo(terminalInfo?.authNo || "");
        setLocalTerminalAuthDate(terminalInfo?.authDate || "");
        setLocalTerminalVanKey(terminalInfo?.vanKey || "");
        setTerminalInfoSaved(null);
    }, [open, terminalInfo]);

    const effectiveTerminalInfo = useMemo(() => {
        if (terminalInfoSaved) return terminalInfoSaved;
        return {
            authNo: terminalInfo?.authNo || "",
            authDate: terminalInfo?.authDate || "",
            vanKey: terminalInfo?.vanKey || "",
        };
    }, [terminalInfo, terminalInfoSaved]);

    const canUseTerminal =
        isTerminalPayment(paymentType)
        && !!effectiveTerminalInfo.authNo
        && !!effectiveTerminalInfo.authDate
        && !!effectiveTerminalInfo.vanKey;

    const handleSaveTerminalInfo = async () => {
        const a = localTerminalAuthNo.trim();
        const d = localTerminalAuthDate.trim();
        const v = localTerminalVanKey.trim();
        if (!a || !d || !v) {
            showAlert({ message: "승인번호 / 거래일시(YYYYMMDD) / VANKEY 모두 입력해 주세요.", type: "warning" });
            return;
        }
        if (!/^\d{8}$/.test(d)) {
            showAlert({ message: "거래일시는 YYYYMMDD 8자리 숫자로 입력해 주세요. (예: 20260414)", type: "warning" });
            return;
        }
        setSavingTerminalInfo(true);
        try {
            await paymentService.updatePaymentDetailTerminalInfo(paymentDetailId, {
                authNo: a, terminalAuthDate: d, terminalVanKey: v,
            });
            setTerminalInfoSaved({ authNo: a, authDate: d, vanKey: v });
            showAlert({ message: "단말기 정보가 저장되었습니다. 환불 확정을 누르면 단말기에서 자동 환불 처리됩니다.", type: "success" });
        } catch (e: any) {
            showAlert({ message: `저장 실패: ${e?.response?.data?.message || e?.message || "오류"}`, type: "error" });
        } finally {
            setSavingTerminalInfo(false);
        }
    };
    const [refundType, setRefundType] = useState<RefundType>("customer_change");
    const [penaltyRatePct, setPenaltyRatePct] = useState<string>("");
    const [manualAmount, setManualAmount] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [calc, setCalc] = useState<RefundCalculateResult | null>(null);
    const [calcLoading, setCalcLoading] = useState(false);
    const [calcError, setCalcError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const isMembership = itemType === "membership";
    const availableTypes = useMemo(() => {
        if (isMembership) {
            return REFUND_TYPE_OPTIONS.filter((opt) => opt.value !== "hospital_fault");
        }
        return REFUND_TYPE_OPTIONS;
    }, [isMembership]);

    useEffect(() => {
        if (!open) return;
        setRefundType("customer_change");
        setPenaltyRatePct("");
        setManualAmount("");
        setReason("");
        setCalc(null);
        setCalcError(null);
    }, [open, paymentDetailId]);

    const runCalculate = useCallback(async () => {
        if (!open) return;
        setCalcLoading(true);
        setCalcError(null);
        try {
            const penaltyRate = penaltyRatePct === "" ? undefined : Number(penaltyRatePct) / 100;
            const manualNum = manualAmount === "" ? undefined : Number(manualAmount);
            const result = await paymentService.calculateRefund({
                paymentMasterId,
                paymentDetailId,
                refundType,
                penaltyRate,
                manualAmount: manualNum,
                reason: reason.trim() || undefined,
            });
            setCalc(result);
        } catch (e: any) {
            const message = e?.response?.data?.message || e?.message || "계산 실패";
            setCalcError(message);
            setCalc(null);
        } finally {
            setCalcLoading(false);
        }
    }, [open, paymentMasterId, paymentDetailId, refundType, penaltyRatePct, manualAmount, reason]);

    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => { void runCalculate(); }, 250);
        return () => clearTimeout(timer);
    }, [open, runCalculate]);

    const handleSubmit = async () => {
        if (!calc?.canRefund || calc.estimatedRefund <= 0) {
            showAlert({ message: calc?.reason || "환불 가능 금액이 없습니다.", type: "warning" });
            return;
        }
        if (refundType === "manual" && !reason.trim()) {
            showAlert({ message: "직접 입력 환불은 사유가 필수입니다.", type: "warning" });
            return;
        }

        const useTerminal = canUseTerminal && !skipTerminal;

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

        // 카드/페이 위약금 + 카드 원거래 = 디커플링 흐름 (deduction-pay → finalize)
        // 그 외 (현금 위약금 / 위약금 0 / 단말기 미사용) = atomic 흐름 (executeRefund) 유지
        const useDecoupled =
            useTerminal
            && kisTerminalService.isConnected()
            && (calc.penaltyAmount ?? 0) > 0
            && rePaymentMethod !== "cash";

        if (useDecoupled) {
            // === 디커플링 흐름 ===
            const repayTradeType = (rePaymentMethod === "pay") ? "v1" as const : "D1" as const;
            const tradeRefType = (paymentType?.toUpperCase() === "PAY") ? "v2" as const : "D2" as const;
            const paidAmount = calc.paidAmount;
            const penaltyAmount = calc.penaltyAmount;

            // Step A: 단말기 위약금 결제
            setProgress({ phase: "repayment", amount: penaltyAmount });
            let rePayResult;
            try {
                rePayResult = await kisTerminalService.requestPayment({ tradeType: repayTradeType, amount: penaltyAmount });
                if (!rePayResult.success) {
                    setProgress({ phase: "idle" });
                    setSubmitting(false);
                    showAlert({ message: `위약금 결제 실패: ${rePayResult.displayMsg || rePayResult.replyCode}`, type: "error" });
                    return;
                }
            } catch (e: any) {
                setProgress({ phase: "idle" });
                setSubmitting(false);
                showAlert({ message: `위약금 결제 호출 실패: ${e?.message || "오류"}`, type: "error" });
                return;
            }

            // Step A 직후: BE 에 deduction-pay 호출 (위약금 detail 즉시 저장 + DEDUCTION_PAID 마킹)
            let rePaymentDetailId: number | undefined;
            try {
                const dp = await paymentService.deductionPay({
                    paymentMasterId,
                    originPaymentDetailId: paymentDetailId,
                    amount: penaltyAmount,
                    method: rePaymentMethod.toUpperCase(),
                    terminalAuthNo: rePayResult.authNo,
                    terminalAuthDate: rePayResult.replyDate,
                    vanKey: rePayResult.vanKey,
                    cardCompany: rePayResult.issuerName || rePayResult.accepterName,
                    installment: rePayResult.installment,
                    terminalCardNo: rePayResult.cardNo,
                    terminalTranNo: rePayResult.tranNo,
                    terminalAccepterName: rePayResult.accepterName,
                    terminalCatId: rePayResult.catId,
                    terminalMerchantRegNo: rePayResult.merchantRegNo,
                });
                rePaymentDetailId = dp.rePaymentDetailId;
            } catch (e: any) {
                setProgress({ phase: "idle" });
                setSubmitting(false);
                showAlert({
                    message: `위약금 단말기 결제는 승인되었으나 시스템 저장 실패\n승인번호: ${rePayResult.authNo}\n오류: ${e?.response?.data?.message || e?.message || "알 수 없음"}\n→ 운영자 문의 필요`,
                    type: "error"
                });
                return;
            }

            // Step B: 단말기 원거래 전체취소
            setProgress({ phase: "void", amount: paidAmount });
            let voidResult;
            try {
                voidResult = await kisTerminalService.requestRefund({
                    tradeType: tradeRefType,
                    amount: paidAmount,
                    orgAuthDate: effectiveTerminalInfo.authDate,
                    orgAuthNo: effectiveTerminalInfo.authNo,
                    vanKey: effectiveTerminalInfo.vanKey,
                });
            } catch (e: any) {
                voidResult = { success: false, displayMsg: e?.message || "호출 실패", replyCode: "", authNo: "", replyDate: "", vanKey: "" } as any;
            }

            if (!voidResult.success) {
                setProgress({ phase: "idle" });
                setSubmitting(false);
                showAlert({
                    message: `원거래 전체취소 실패\n${voidResult.displayMsg || voidResult.replyCode}\n\n✅ 위약금 ${formatWon(penaltyAmount)} 결제는 시스템 저장 완료 (DEDUCTION_PAID)\n원거래 단말기에서 직접 취소 후 [결제/환불 탭] 의 [원거래 취소 재시도] 로 마무리하세요.`,
                    type: "error"
                });
                // 환불 모달 닫고 결제/환불 탭으로 돌아가도록 callback
                onRefunded({ refundAmount: 0, refundType: "deduction_paid" });
                onClose();
                return;
            }

            // Step B 성공 → finalize
            setProgress({ phase: "backend" });
            try {
                const penaltyRate = penaltyRatePct === "" ? undefined : Number(penaltyRatePct) / 100;
                const manualNum = manualAmount === "" ? undefined : Number(manualAmount);
                const result = await paymentService.finalizeRefund(paymentMasterId, {
                    originPaymentDetailId: paymentDetailId,
                    rePaymentDetailId,
                    refundType,
                    penaltyRate,
                    manualAmount: manualNum,
                    reason: reason.trim() || undefined,
                    terminalRefundAuthNo: voidResult.authNo,
                    terminalRefundDate: voidResult.replyDate,
                    terminalVanKey: voidResult.vanKey,
                    refundMethod: "AUTO",
                });
                showAlert({ message: `${formatWon(result.refundAmount)} 환불 처리되었습니다.`, type: "success" });
                onRefunded({ refundAmount: result.refundAmount, refundType: result.refundType });
                onClose();
            } catch (e: any) {
                showAlert({
                    message: `단말기 카드 처리는 정상이지만 시스템 기록 실패\n위약금 승인번호: ${rePayResult.authNo}\n원거래 취소 승인번호: ${voidResult.authNo}\n오류: ${e?.response?.data?.message || e?.message || "알 수 없음"}\n→ 운영자 문의 필요`,
                    type: "error"
                });
            } finally {
                setProgress({ phase: "idle" });
                setSubmitting(false);
            }
            return;
        }

        // === Atomic 흐름 (현금 위약금 / 위약금 0 / 단말기 미사용) ===
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

        if (useTerminal && kisTerminalService.isConnected()) {
            const tradeRefType = (paymentType?.toUpperCase() === "PAY") ? "v2" as const : "D2" as const;
            const paidAmount = calc.paidAmount;
            const penaltyAmount = calc.penaltyAmount;

            if (penaltyAmount > 0 && rePaymentMethod === "cash") {
                // 현금 위약금: 단말기 호출 스킵, amount 만 기록
                rePaymentAuth = { amount: penaltyAmount, authNo: "", authDate: "", vanKey: "" };
            }

            setProgress({ phase: "void", amount: paidAmount });
            try {
                const r = await kisTerminalService.requestRefund({
                    tradeType: tradeRefType,
                    amount: paidAmount,
                    orgAuthDate: effectiveTerminalInfo.authDate,
                    orgAuthNo: effectiveTerminalInfo.authNo,
                    vanKey: effectiveTerminalInfo.vanKey,
                });
                if (!r.success) {
                    setProgress({ phase: "idle" });
                    setSubmitting(false);
                    showAlert({ message: `원거래 전체취소 실패: ${r.displayMsg || r.replyCode}`, type: "error" });
                    return;
                }
                voidAuth = { amount: paidAmount, authNo: r.authNo, authDate: r.replyDate, vanKey: r.vanKey };
            } catch (e: any) {
                setProgress({ phase: "idle" });
                setSubmitting(false);
                showAlert({ message: `원거래 전체취소 호출 실패: ${e?.message || "오류"}`, type: "error" });
                return;
            }
        }

        setProgress({ phase: "backend" });
        try {
            const penaltyRate = penaltyRatePct === "" ? undefined : Number(penaltyRatePct) / 100;
            const manualNum = manualAmount === "" ? undefined : Number(manualAmount);
            const result = await paymentService.executeRefund({
                paymentMasterId,
                paymentDetailId,
                refundType,
                penaltyRate,
                manualAmount: manualNum,
                reason: reason.trim() || undefined,
                terminalRefundAuthNo: voidAuth?.authNo,
                terminalRefundDate: voidAuth?.authDate,
                terminalVanKey: voidAuth?.vanKey,
                refundMethod: voidAuth ? "AUTO" : (skipTerminal ? "MANUAL" : undefined),
                rePaymentAmount: rePaymentAuth?.amount,
                rePaymentMethod: rePaymentAuth ? rePaymentMethod.toUpperCase() : undefined,
            });
            showAlert({ message: `${formatWon(result.refundAmount)} 환불 처리되었습니다.`, type: "success" });
            onRefunded({ refundAmount: result.refundAmount, refundType: result.refundType });
            onClose();
        } catch (e: any) {
            const message = e?.response?.data?.message || e?.message || "환불 처리 실패";
            showAlert({ message, type: "error" });
        } finally {
            setProgress({ phase: "idle" });
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const refundDisabled = submitting || !calc?.canRefund || (calc?.estimatedRefund ?? 0) <= 0;

    return createPortal(
        <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] px-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative w-full max-w-[760px] rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150 overflow-hidden">
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-[#F8DCE2] px-6 py-3 bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#D27A8C] to-[#8B3F50]" />
                    <div className="pl-2 min-w-0">
                        <div className="text-[15px] font-extrabold text-[#5C2A35]">환불 처리</div>
                        <div className="text-[11px] text-[#8B5A66] truncate max-w-[560px]">{itemName}</div>
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

                {/* Body — 2-column layout */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 px-6 py-4">
                    {/* LEFT: Form fields */}
                    <div className="space-y-3.5">
                        {/* Refund type — horizontal grid */}
                        <div>
                            <label className="mb-1.5 block text-[11px] font-bold text-[#8B3F50] tracking-[0.2px]">환불 유형</label>
                            <div className={`grid gap-1.5 ${availableTypes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                                {availableTypes.map((opt) => {
                                    const active = refundType === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setRefundType(opt.value)}
                                            className={`text-center rounded-lg border px-2 py-2 transition-all ${
                                                active
                                                    ? "border-[#D27A8C] bg-gradient-to-br from-[#FCEBEF] to-white shadow-[0_3px_10px_rgba(226,107,124,0.18)]"
                                                    : "border-[#F8DCE2] bg-white hover:border-[#D27A8C]/50 hover:bg-[#FCF7F8]"
                                            }`}
                                            title={opt.description}
                                        >
                                            <div className={`text-[12px] font-extrabold leading-tight ${active ? "text-[#8B3F50]" : "text-[#5C2A35]"}`}>{opt.label}</div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-1.5 text-[11px] text-[#8B5A66] leading-snug">
                                {availableTypes.find((o) => o.value === refundType)?.description}
                            </div>
                        </div>

                        {/* Inline 위약률 / manual amount */}
                        {refundType === "customer_change" && !isMembership && (
                            <div>
                                <label className="mb-1 block text-[11px] font-bold text-[#8B3F50] tracking-[0.2px]">위약률 (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="99"
                                    value={penaltyRatePct}
                                    onChange={(e) => setPenaltyRatePct(e.target.value)}
                                    placeholder="비워두면 티켓/시스템 기본값 사용"
                                    className="w-full h-9 rounded-lg border border-[#F8DCE2] bg-white px-3 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                />
                            </div>
                        )}

                        {refundType === "manual" && (
                            <div>
                                <label className="mb-1 block text-[11px] font-bold text-[#8B3F50] tracking-[0.2px]">환불 금액 (직접 입력)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={manualAmount}
                                    onChange={(e) => setManualAmount(e.target.value)}
                                    placeholder="환불할 금액을 직접 입력"
                                    className="w-full h-9 rounded-lg border border-[#F8DCE2] bg-white px-3 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                />
                            </div>
                        )}

                        <div>
                            <label className="mb-1 block text-[11px] font-bold text-[#8B3F50] tracking-[0.2px]">
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

                        {/* 위약금 결제수단 — 위약금 발생 시에만 노출 */}
                        {(calc?.penaltyAmount ?? 0) > 0 && refundType !== "hospital_fault" && (
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

                        {canUseTerminal && (
                            <div className="rounded-lg border border-[#F8DCE2] bg-[#FCEBEF]/30 px-3 py-2 text-[10px] text-[#5C2A35] space-y-1">
                                <div className="font-bold flex items-center gap-1">
                                    <CreditCard className="h-3 w-3" />
                                    {paymentTypeLabel(paymentType)} · 단말기 환불 대상
                                </div>
                                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800 leading-relaxed">
                                    ⚠ 원결제와 <b>같은 단말기</b>에서만 자동 취소 가능합니다.<br/>
                                    다른 단말기면 본 결제 진행 후 그 단말기에서 직접 취소해야 합니다.
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer pt-1">
                                    <input
                                        type="checkbox"
                                        checked={skipTerminal}
                                        onChange={(e) => setSkipTerminal(e.target.checked)}
                                        className="h-4 w-4 accent-[#D27A8C]"
                                    />
                                    <span className="text-[12px] font-bold text-[#99354E]">다른 단말기로 결제</span>
                                </label>
                            </div>
                        )}
                        {!canUseTerminal && isTerminalPayment(paymentType) && (
                            <div className="rounded-lg border border-[#F4C7CE] bg-[#FCEBEF]/60 px-3 py-2.5 text-[11px] text-[#8B3F50] space-y-2">
                                <div className="font-extrabold">⚠ {paymentTypeLabel(paymentType)} 결제 — 원거래 정보가 등록되어 있지 않습니다</div>
                                <div className="text-[10.5px] text-[#8B5A66] leading-snug">
                                    영수증을 보고 아래 3개 항목을 입력하면 단말기에서 자동으로 환불 처리할 수 있습니다.<br/>한 번 입력한 정보는 다음에 또 환불할 일이 있어도 자동으로 채워집니다.
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                    <input
                                        type="text"
                                        value={localTerminalAuthNo}
                                        onChange={(e) => setLocalTerminalAuthNo(e.target.value)}
                                        placeholder="승인번호"
                                        className="h-8 rounded-md border border-[#F4C7CE] bg-white px-2 text-[11px] outline-none focus:border-[#D27A8C]"
                                    />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={8}
                                        value={localTerminalAuthDate}
                                        onChange={(e) => setLocalTerminalAuthDate(e.target.value.replace(/\D/g, ""))}
                                        placeholder="거래일시 YYYYMMDD"
                                        className="h-8 rounded-md border border-[#F4C7CE] bg-white px-2 text-[11px] outline-none focus:border-[#D27A8C]"
                                    />
                                    <input
                                        type="text"
                                        value={localTerminalVanKey}
                                        onChange={(e) => setLocalTerminalVanKey(e.target.value)}
                                        placeholder="VANKEY"
                                        className="h-8 rounded-md border border-[#F4C7CE] bg-white px-2 text-[11px] outline-none focus:border-[#D27A8C]"
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleSaveTerminalInfo}
                                        disabled={savingTerminalInfo}
                                        className="h-7 rounded-md bg-[#D27A8C] px-3 text-[11px] font-bold text-white hover:bg-[#8B3F50] disabled:opacity-50 transition-colors"
                                    >
                                        {savingTerminalInfo ? "저장 중..." : "단말기 정보 저장"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Calculation panel */}
                    <div className="rounded-xl border border-[#F8DCE2] bg-gradient-to-b from-[#FCF7F8] to-white px-4 py-3 flex flex-col">
                        <div className="text-[11px] font-extrabold text-[#8B3F50] mb-2 tracking-[0.2px]">자동 계산</div>
                        {calcLoading ? (
                            <div className="flex-1 flex items-center justify-center py-10">
                                <div className="h-7 w-7 rounded-full border-2 border-[#F8DCE2] border-t-[#D27A8C] animate-spin" />
                            </div>
                        ) : calc ? (
                            <div className="flex-1 flex flex-col">
                                <div className="space-y-2 text-[13px] flex-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[#5C2A35] font-medium">결제액</span>
                                        <span className="font-bold text-[#2A1F22] tabular-nums">{formatWon(calc.paidAmount)}</span>
                                    </div>
                                    {calc.penaltyAmount > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-[#5C2A35] font-medium">위약금 <span className="text-[11px] text-[#8B5A66]">({(calc.penaltyRate * 100).toFixed(1)}%)</span></span>
                                            <span className="font-bold text-[#C53030] tabular-nums">−{formatWon(calc.penaltyAmount)}</span>
                                        </div>
                                    )}
                                    {calc.usageDeduction > 0 && (
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-[#5C2A35] font-medium leading-tight">
                                                사용 차감
                                                <div className="text-[10px] text-[#8B5A66] mt-0.5">
                                                    {isMembership ? "(순사용)" : `1회 ${formatWon(calc.singleSessionPrice ?? 0)} × ${calc.usedCount}회`}
                                                </div>
                                            </span>
                                            <span className="font-bold text-[#C53030] tabular-nums shrink-0">−{formatWon(calc.usageDeduction)}</span>
                                        </div>
                                    )}
                                    {refundType === "hospital_fault" && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-[#5C2A35] font-medium">잔여 횟수</span>
                                            <span className="font-bold text-[#2A1F22] tabular-nums">{calc.remainingCount} / {calc.totalCount}회</span>
                                        </div>
                                    )}
                                </div>

                                <div className="border-t border-[#F8DCE2] mt-3 pt-3 flex justify-between items-center">
                                    <span className="text-[14px] font-extrabold text-[#5C2A35]">환불 예상액</span>
                                    <span className={`text-[22px] font-black tabular-nums leading-none ${calc.canRefund && calc.estimatedRefund > 0 ? "text-[#D27A8C]" : "text-[#C9A0A8]"}`}>
                                        {formatWon(calc.estimatedRefund)}
                                    </span>
                                </div>

                                {calc.formula && (
                                    <div className="mt-2 rounded-md bg-[#FCF7F8] px-2.5 py-1.5 text-[10.5px] text-[#8B5A66] font-mono leading-snug break-all">
                                        {calc.formula}
                                    </div>
                                )}

                                {(!calc.canRefund || calc.estimatedRefund <= 0) && (
                                    <div className="mt-2 rounded-lg border border-[#F4C7CE] bg-[#FCEBEF] px-3 py-2">
                                        <div className="text-[12px] font-extrabold text-[#8B3F50]">⚠ 환불 불가</div>
                                        <div className="mt-0.5 text-[11px] text-[#8B3F50] leading-snug">
                                            {calc.reason || "위약금과 사용 차감액의 합이 결제액을 초과하여 환불 가능 금액이 없습니다."}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : calcError ? (
                            <div className="flex-1 flex items-center justify-center text-[12px] text-[#C53030]">{calcError}</div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-[12px] text-[#C9A0A8]">유형을 선택하면 계산됩니다.</div>
                        )}
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
                        disabled={refundDisabled}
                        className="h-10 rounded-xl px-6 text-[13px] font-extrabold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-[1px] disabled:hover:translate-y-0"
                        style={{
                            background: refundDisabled
                                ? "linear-gradient(135deg, #E5B5C0 0%, #D4A5B0 100%)"
                                : "linear-gradient(135deg, #D27A8C 0%, #8B3F50 100%)",
                            boxShadow: refundDisabled
                                ? "none"
                                : "0 8px 22px rgba(226, 107, 124, 0.38), inset 0 1px 0 rgba(255,255,255,0.18)",
                        }}
                    >
                        {submitting ? "처리 중..." : (() => {
                            const deduction = Math.max(0, (calc?.paidAmount ?? 0) - (calc?.estimatedRefund ?? 0));
                            return deduction > 0 ? `공제액 ${formatWon(deduction)} 결제 및 환불` : `${formatWon(calc?.estimatedRefund ?? 0)} 환불 처리`;
                        })()}
                    </button>
                </div>

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

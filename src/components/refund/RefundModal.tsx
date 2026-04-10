import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
    paymentService,
    type RefundCalculateResult,
    type RefundType,
} from "../../services/paymentService";
import { useAlert } from "../ui/AlertDialog";

export interface RefundModalProps {
    open: boolean;
    paymentMasterId: number;
    paymentDetailId: number;
    itemName: string;
    itemType: "ticket" | "membership" | string;
    onClose: () => void;
    onRefunded: (result: { refundAmount: number; refundType: string }) => void;
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
    onClose,
    onRefunded,
}: RefundModalProps) {
    const { showAlert } = useAlert();
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
        setSubmitting(true);
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
            });
            showAlert({
                message: `${formatWon(result.refundAmount)} 환불 처리되었습니다.`,
                type: "success",
            });
            onRefunded({ refundAmount: result.refundAmount, refundType: result.refundType });
            onClose();
        } catch (e: any) {
            const message = e?.response?.data?.message || e?.message || "환불 처리 실패";
            showAlert({ message, type: "error" });
        } finally {
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
            <div className="w-full max-w-[760px] rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150 overflow-hidden">
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
                        {submitting ? "처리 중..." : "환불 확정"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
            if (!result.canRefund && result.reason) {
                setCalcError(result.reason);
            }
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

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(226,107,124,0.18)]">
                <div className="flex items-start justify-between border-b border-[#F8DCE2] px-6 py-4 bg-gradient-to-b from-white to-[#FCF7F8] rounded-t-2xl">
                    <div>
                        <div className="text-[16px] font-bold text-[#5C2A35]">환불 처리</div>
                        <div className="mt-1 text-[12px] text-[#7C6066] truncate max-w-[380px]">{itemName}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-[#7C6066] hover:bg-[#FCEBEF] hover:text-[#5C2A35] transition-colors"
                        title="닫기"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-4 px-6 py-5">
                    <div>
                        <label className="mb-2 block text-[11px] font-bold text-[#7C6066] tracking-[0.2px]">환불 유형</label>
                        <div className="grid grid-cols-1 gap-2">
                            {availableTypes.map((opt) => {
                                const active = refundType === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setRefundType(opt.value)}
                                        className={`text-left rounded-xl border px-3 py-2.5 transition-all ${
                                            active
                                                ? "border-[#E26B7C] bg-[#FCEBEF] shadow-[0_2px_8px_rgba(226,107,124,0.12)]"
                                                : "border-[#F8DCE2] bg-white hover:border-[#E26B7C]/50"
                                        }`}
                                    >
                                        <div className={`text-[13px] font-bold ${active ? "text-[#99354E]" : "text-[#2A1F22]"}`}>{opt.label}</div>
                                        <div className="mt-0.5 text-[11px] text-[#7C6066]">{opt.description}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {refundType === "customer_change" && !isMembership && (
                        <div>
                            <label className="mb-1 block text-[11px] font-bold text-[#7C6066] tracking-[0.2px]">위약률 (%)</label>
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="99"
                                value={penaltyRatePct}
                                onChange={(e) => setPenaltyRatePct(e.target.value)}
                                placeholder="비워두면 티켓/시스템 기본값 사용"
                                className="w-full h-10 rounded-lg border border-[#F8DCE2] bg-white px-3 text-[13px] outline-none focus:border-[#E26B7C] focus:ring-2 focus:ring-[#F49EAF]/20"
                            />
                        </div>
                    )}

                    {refundType === "manual" && (
                        <div>
                            <label className="mb-1 block text-[11px] font-bold text-[#7C6066] tracking-[0.2px]">환불 금액 (직접 입력)</label>
                            <input
                                type="number"
                                min="0"
                                value={manualAmount}
                                onChange={(e) => setManualAmount(e.target.value)}
                                placeholder="환불할 금액을 직접 입력"
                                className="w-full h-10 rounded-lg border border-[#F8DCE2] bg-white px-3 text-[13px] outline-none focus:border-[#E26B7C] focus:ring-2 focus:ring-[#F49EAF]/20"
                            />
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-[11px] font-bold text-[#7C6066] tracking-[0.2px]">
                            환불 사유 {refundType === "manual" && <span className="text-[#E26B7C]">*</span>}
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={2}
                            placeholder={refundType === "manual" ? "직접 입력 환불은 사유가 필수입니다." : "환불 사유 (선택)"}
                            className="w-full rounded-lg border border-[#F8DCE2] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#E26B7C] focus:ring-2 focus:ring-[#F49EAF]/20"
                        />
                    </div>

                    <div className="rounded-xl border border-[#F8DCE2] bg-[#FCF7F8] px-4 py-3">
                        <div className="text-[11px] font-bold text-[#7C6066] mb-2">자동 계산</div>
                        {calcLoading ? (
                            <div className="text-[12px] text-[#7C6066]">계산 중...</div>
                        ) : calcError ? (
                            <div className="text-[12px] text-[#C53030]">{calcError}</div>
                        ) : calc ? (
                            <div className="space-y-1.5 text-[12px]">
                                <div className="flex justify-between">
                                    <span className="text-[#7C6066]">결제액</span>
                                    <span className="font-medium text-[#2A1F22] tabular-nums">{formatWon(calc.paidAmount)}</span>
                                </div>
                                {calc.penaltyAmount > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[#7C6066]">위약금 ({(calc.penaltyRate * 100).toFixed(2)}%)</span>
                                        <span className="font-medium text-[#C53030] tabular-nums">−{formatWon(calc.penaltyAmount)}</span>
                                    </div>
                                )}
                                {calc.usageDeduction > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[#7C6066]">
                                            {isMembership ? "사용 차감 (순사용)" : `사용 차감 (1회 ${formatWon(calc.singleSessionPrice ?? 0)} × ${calc.usedCount}회)`}
                                        </span>
                                        <span className="font-medium text-[#C53030] tabular-nums">−{formatWon(calc.usageDeduction)}</span>
                                    </div>
                                )}
                                {refundType === "hospital_fault" && (
                                    <div className="flex justify-between">
                                        <span className="text-[#7C6066]">잔여 횟수</span>
                                        <span className="font-medium text-[#2A1F22] tabular-nums">{calc.remainingCount} / {calc.totalCount}회</span>
                                    </div>
                                )}
                                <div className="border-t border-[#F8DCE2] mt-2 pt-2 flex justify-between">
                                    <span className="text-[13px] font-bold text-[#5C2A35]">환불 예상액</span>
                                    <span className="text-[15px] font-extrabold text-[#E26B7C] tabular-nums">{formatWon(calc.estimatedRefund)}</span>
                                </div>
                                {calc.formula && (
                                    <div className="mt-1 text-[10px] text-[#7C6066] font-mono leading-tight">{calc.formula}</div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[12px] text-[#9CA3AF]">유형을 선택하면 계산됩니다.</div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-[#F8DCE2] px-6 py-4 bg-gradient-to-b from-[#FCF7F8] to-white rounded-b-2xl">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="min-h-[36px] rounded-lg border border-[#F8DCE2] bg-white px-4 text-[12px] font-medium text-[#7C6066] hover:bg-[#FCEBEF] disabled:opacity-50 transition-all"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !calc?.canRefund || calc.estimatedRefund <= 0}
                        className="min-h-[36px] rounded-lg px-5 text-[12px] font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: submitting || !calc?.canRefund || calc.estimatedRefund <= 0
                                ? "linear-gradient(135deg, #E5B5C0 0%, #D4A5B0 100%)"
                                : "linear-gradient(135deg, #E26B7C 0%, #C9485B 100%)",
                            boxShadow: submitting || !calc?.canRefund || calc.estimatedRefund <= 0
                                ? "none"
                                : "0 4px 14px rgba(226, 107, 124, 0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
                        }}
                    >
                        {submitting ? "처리 중..." : "환불 확정"}
                    </button>
                </div>
            </div>
        </div>
    );
}

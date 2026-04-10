import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
    paymentService,
    type RefundType,
    type BulkRefundItemResult,
    type RefundCalculateResult,
} from "../../services/paymentService";
import { useAlert } from "../ui/AlertDialog";

export interface BulkRefundModalItem {
    paymentMasterId: number;
    paymentDetailId: number;
    itemName: string;
    itemType: "ticket" | "membership" | string;
}

export interface BulkRefundModalProps {
    open: boolean;
    items: BulkRefundModalItem[];
    onClose: () => void;
    onRefunded: (totalRefund: number) => void;
}

const REFUND_TYPE_OPTIONS: Array<{ value: RefundType; label: string; description: string }> = [
    { value: "customer_change", label: "고객 단순변심", description: "결제액 - 위약금 - (1회 정상가 × 사용횟수)" },
    { value: "hospital_fault", label: "병원 귀책", description: "결제액 ÷ 총횟수 × 잔여횟수 (위약금 없음)" },
    { value: "manual", label: "기타 (직접 입력)", description: "직원이 환불액을 직접 입력 (사유 필수)" },
];

function formatWon(value: number): string {
    return `${Math.max(0, Math.round(value)).toLocaleString()}원`;
}

export function BulkRefundModal({ open, items, onClose, onRefunded }: BulkRefundModalProps) {
    const { showAlert } = useAlert();
    const [refundType, setRefundType] = useState<RefundType>("customer_change");
    const [penaltyRatePct, setPenaltyRatePct] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [calcs, setCalcs] = useState<Record<number, RefundCalculateResult>>({});
    const [calcLoading, setCalcLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Membership items can't use hospital_fault
    const hasMembership = items.some((it) => it.itemType === "membership");
    const availableTypes = hasMembership
        ? REFUND_TYPE_OPTIONS.filter((opt) => opt.value !== "hospital_fault")
        : REFUND_TYPE_OPTIONS;

    useEffect(() => {
        if (!open) return;
        setRefundType("customer_change");
        setPenaltyRatePct("");
        setReason("");
        setCalcs({});
    }, [open, items]);

    const runCalculate = useCallback(async () => {
        if (!open || items.length === 0) return;
        setCalcLoading(true);
        try {
            const penaltyRate = penaltyRatePct === "" ? undefined : Number(penaltyRatePct) / 100;
            const results: Record<number, RefundCalculateResult> = {};
            for (const item of items) {
                try {
                    const r = await paymentService.calculateRefund({
                        paymentMasterId: item.paymentMasterId,
                        paymentDetailId: item.paymentDetailId,
                        refundType,
                        penaltyRate,
                        reason: reason.trim() || undefined,
                    });
                    results[item.paymentDetailId] = r;
                } catch (e: any) {
                    results[item.paymentDetailId] = {
                        canRefund: false,
                        reason: e?.response?.data?.message || e?.message || "계산 실패",
                        itemName: item.itemName,
                        itemType: item.itemType,
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
            setCalcs(results);
        } finally {
            setCalcLoading(false);
        }
    }, [open, items, refundType, penaltyRatePct, reason]);

    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => { void runCalculate(); }, 250);
        return () => clearTimeout(timer);
    }, [open, runCalculate]);

    const totalPaid = Object.values(calcs).reduce((s, c) => s + (c.paidAmount || 0), 0);
    const totalPenalty = Object.values(calcs).reduce((s, c) => s + (c.penaltyAmount || 0), 0);
    const totalUsage = Object.values(calcs).reduce((s, c) => s + (c.usageDeduction || 0), 0);
    const totalRefund = Object.values(calcs).reduce((s, c) => s + (c.estimatedRefund || 0), 0);
    const allCanRefund = items.length > 0 && items.every((it) => calcs[it.paymentDetailId]?.canRefund && calcs[it.paymentDetailId]?.estimatedRefund > 0);

    const handleSubmit = async () => {
        if (!allCanRefund) {
            showAlert({ message: "환불 불가 항목이 포함되어 있습니다. 선택을 조정해 주세요.", type: "warning" });
            return;
        }
        setSubmitting(true);
        try {
            const penaltyRate = penaltyRatePct === "" ? undefined : Number(penaltyRatePct) / 100;
            const result = await paymentService.executeBulkRefund({
                items: items.map((it) => ({
                    paymentMasterId: it.paymentMasterId,
                    paymentDetailId: it.paymentDetailId,
                    refundType,
                    penaltyRate,
                    reason: reason.trim() || undefined,
                })),
                commonReason: reason.trim() || undefined,
            });

            if (result.allSucceeded) {
                showAlert({
                    message: `${result.successCount}건 / 총 ${formatWon(result.totalRefundAmount)} 환불 완료`,
                    type: "success",
                });
            } else {
                const failed = result.results.filter((r: BulkRefundItemResult) => !r.success);
                const failNames = failed.map((f: BulkRefundItemResult) => f.itemName).join(", ");
                showAlert({
                    message: `성공 ${result.successCount}건 / 실패 ${result.failureCount}건\n실패 항목: ${failNames}`,
                    type: "warning",
                });
            }
            onRefunded(result.totalRefundAmount);
            onClose();
        } catch (e: any) {
            const message = e?.response?.data?.message || e?.message || "환불 처리 실패";
            showAlert({ message, type: "error" });
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const refundDisabled = submitting || !allCanRefund || totalRefund <= 0;

    return createPortal(
        <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] px-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-[920px] rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150 overflow-hidden">
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-[#F8DCE2] px-6 py-3 bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#D27A8C] to-[#8B3F50]" />
                    <div className="pl-2 min-w-0">
                        <div className="text-[15px] font-extrabold text-[#5C2A35]">일괄 환불</div>
                        <div className="text-[11px] text-[#8B5A66]">{items.length}건 항목 동시 환불</div>
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

                {/* Body */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 px-6 py-4 max-h-[70vh] overflow-y-auto">
                    {/* LEFT — Item list */}
                    <div className="space-y-2">
                        <div className="text-[11px] font-extrabold text-[#8B3F50] tracking-[0.2px] mb-1">선택된 항목 ({items.length})</div>
                        <div className="rounded-xl border border-[#F8DCE2] bg-[#FCF7F8]/40 divide-y divide-[#F8DCE2]/60 max-h-[440px] overflow-y-auto">
                            {items.map((item) => {
                                const calc = calcs[item.paymentDetailId];
                                const isMembership = item.itemType === "membership";
                                const failed = calc && !calc.canRefund;
                                return (
                                    <div key={item.paymentDetailId} className={`px-3 py-2.5 ${failed ? "bg-[#FCEBEF]/60" : ""}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isMembership ? "bg-violet-100 text-violet-700" : "bg-[#FCEBEF] text-[#8B3F50]"}`}>
                                                        {isMembership ? "회원권" : "티켓"}
                                                    </span>
                                                    <span className="text-[12px] font-bold text-[#2A1F22] truncate">{item.itemName}</span>
                                                </div>
                                                {calc ? (
                                                    <div className="text-[11px] text-[#8B5A66]">
                                                        결제 {formatWon(calc.paidAmount)}
                                                        {calc.usedCount > 0 && ` · 사용 ${calc.usedCount}회`}
                                                        {calc.penaltyAmount > 0 && ` · 위약금 −${formatWon(calc.penaltyAmount)}`}
                                                        {calc.usageDeduction > 0 && ` · 사용차감 −${formatWon(calc.usageDeduction)}`}
                                                    </div>
                                                ) : (
                                                    <div className="text-[10px] text-[#C9A0A8]">계산 중...</div>
                                                )}
                                                {failed && calc?.reason && (
                                                    <div className="mt-1 text-[10px] font-bold text-[#99354E]">⚠ {calc.reason}</div>
                                                )}
                                            </div>
                                            <div className={`text-[14px] font-extrabold tabular-nums shrink-0 ${calc?.canRefund && (calc?.estimatedRefund ?? 0) > 0 ? "text-[#D27A8C]" : "text-[#C9A0A8]"}`}>
                                                {calc ? formatWon(calc.estimatedRefund) : "-"}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT — Form + summary */}
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-[11px] font-bold text-[#8B3F50]">공통 환불 유형</label>
                            <div className={`grid gap-1.5 ${availableTypes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                                {availableTypes.map((opt) => {
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
                                            <div className={`text-[12px] font-extrabold leading-tight ${active ? "text-[#8B3F50]" : "text-[#5C2A35]"}`}>{opt.label}</div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-1.5 text-[10px] text-[#8B5A66]">
                                {availableTypes.find((o) => o.value === refundType)?.description}
                            </div>
                        </div>

                        {refundType === "customer_change" && (
                            <div>
                                <label className="mb-1 block text-[11px] font-bold text-[#8B3F50]">위약률 (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="99"
                                    value={penaltyRatePct}
                                    onChange={(e) => setPenaltyRatePct(e.target.value)}
                                    placeholder="비워두면 티켓/시스템 기본값"
                                    className="w-full h-9 rounded-lg border border-[#F8DCE2] bg-white px-3 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20"
                                />
                            </div>
                        )}

                        <div>
                            <label className="mb-1 block text-[11px] font-bold text-[#8B3F50]">공통 환불 사유</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={2}
                                placeholder="환불 사유 (선택)"
                                className="w-full rounded-lg border border-[#F8DCE2] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#F49EAF]/20 resize-none"
                            />
                        </div>

                        {/* Summary */}
                        <div className="rounded-xl border border-[#F8DCE2] bg-gradient-to-b from-[#FCF7F8] to-white px-4 py-3">
                            <div className="text-[11px] font-extrabold text-[#8B3F50] mb-2">합계</div>
                            {calcLoading ? (
                                <div className="flex items-center justify-center py-6">
                                    <div className="h-6 w-6 rounded-full border-2 border-[#F8DCE2] border-t-[#D27A8C] animate-spin" />
                                </div>
                            ) : (
                                <div className="space-y-1.5 text-[12px]">
                                    <div className="flex justify-between">
                                        <span className="text-[#5C2A35] font-medium">총 결제액</span>
                                        <span className="font-bold text-[#2A1F22] tabular-nums">{formatWon(totalPaid)}</span>
                                    </div>
                                    {totalPenalty > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-[#5C2A35] font-medium">총 위약금</span>
                                            <span className="font-bold text-[#C53030] tabular-nums">−{formatWon(totalPenalty)}</span>
                                        </div>
                                    )}
                                    {totalUsage > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-[#5C2A35] font-medium">총 사용차감</span>
                                            <span className="font-bold text-[#C53030] tabular-nums">−{formatWon(totalUsage)}</span>
                                        </div>
                                    )}
                                    <div className="border-t border-[#F8DCE2] mt-2 pt-2 flex justify-between items-center">
                                        <span className="text-[14px] font-extrabold text-[#5C2A35]">총 환불액</span>
                                        <span className={`text-[22px] font-black tabular-nums leading-none ${totalRefund > 0 ? "text-[#D27A8C]" : "text-[#C9A0A8]"}`}>
                                            {formatWon(totalRefund)}
                                        </span>
                                    </div>
                                </div>
                            )}
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
                        disabled={refundDisabled}
                        className="h-10 rounded-xl px-6 text-[13px] font-extrabold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-[1px] disabled:hover:translate-y-0"
                        style={{
                            background: refundDisabled
                                ? "linear-gradient(135deg, #E5B5C0 0%, #D4A5B0 100%)"
                                : "linear-gradient(135deg, #D27A8C 0%, #8B3F50 100%)",
                            boxShadow: refundDisabled ? "none" : "0 8px 22px rgba(210, 122, 140, 0.38)",
                        }}
                    >
                        {submitting ? "처리 중..." : `${items.length}건 환불 확정`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

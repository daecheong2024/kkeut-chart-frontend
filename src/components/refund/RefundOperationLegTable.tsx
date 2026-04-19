import { AlertTriangle, CheckCircle2, CreditCard, HelpCircle, RotateCcw, Wrench } from "lucide-react";
import type { PaymentOperationLeg, PaymentOperationSummary } from "../../services/paymentService";
import { StepBullet } from "../ui/StepBullet";

function formatWon(amount: number): string {
    return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")}원`;
}

function formatDateTime(value?: string): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getRoleLabel(role?: string): string {
    const value = String(role || "").toLowerCase();
    if (value === "refund") return "원거래 취소";
    if (value === "repayment") return "위약금 결제";
    return "결제";
}

function getLegMethodLabel(leg: PaymentOperationLeg): string {
    if (leg.paymentSubMethodLabel?.trim()) return leg.paymentSubMethodLabel.trim();
    if (leg.paymentCategory === "cash") return "현금";
    if (leg.paymentCategory === "pay") return "간편결제";
    if (leg.paymentCategory === "platform") return "플랫폼";
    if (leg.paymentCategory === "other") return "기타";
    return "카드";
}

function getStatusMeta(status?: string): { label: string; className: string; icon: JSX.Element } {
    const value = String(status || "").toLowerCase();
    if (value === "succeeded" || value === "completed") {
        return {
            label: "완료",
            className: "border-emerald-200 bg-emerald-50 text-emerald-700",
            icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        };
    }
    if (value === "unknown") {
        return {
            label: "단말 확인 필요",
            className: "border-rose-200 bg-rose-50 text-rose-700",
            icon: <HelpCircle className="h-3.5 w-3.5" />,
        };
    }
    if (value === "needs_manual_action") {
        return {
            label: "수기 마감 가능",
            className: "border-amber-200 bg-amber-50 text-amber-800",
            icon: <Wrench className="h-3.5 w-3.5" />,
        };
    }
    if (value === "failed") {
        return {
            label: "재시도 필요",
            className: "border-rose-200 bg-rose-50 text-rose-700",
            icon: <AlertTriangle className="h-3.5 w-3.5" />,
        };
    }
    if (value === "pending" || value === "in_progress") {
        return {
            label: "진행 중",
            className: "border-sky-200 bg-sky-50 text-sky-700",
            icon: <RotateCcw className="h-3.5 w-3.5" />,
        };
    }
    return {
        label: status || "대기",
        className: "border-slate-200 bg-slate-50 text-slate-600",
        icon: <RotateCcw className="h-3.5 w-3.5" />,
    };
}

interface RefundOperationLegTableProps {
    operation?: PaymentOperationSummary | null;
}

export function RefundOperationLegTable({ operation }: RefundOperationLegTableProps) {
    const legs = [...(operation?.legs || [])].sort((a, b) => a.sequence - b.sequence);

    if (legs.length === 0) {
        return (
            <div className="rounded-[12px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[12px] text-slate-500">
                현재 표시할 분할건 상세가 없습니다.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {legs.map((leg, index) => {
                const statusMeta = getStatusMeta(leg.status);
                const approvalSummary = [leg.terminalAuthNo, leg.terminalAuthDate, leg.terminalVanKey]
                    .filter((value) => String(value || "").trim().length > 0)
                    .join(" · ");

                return (
                    <div key={leg.legKey || `${leg.sequence}-${index}`} className="rounded-[14px] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <StepBullet n={leg.sequence || index + 1} size="md" />
                                    <span className="text-[11px] font-bold text-slate-500">{getRoleLabel(leg.role)}</span>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-[#F8DCE2] bg-[#FCF7F8] px-2 py-0.5 text-[11px] font-bold text-[#5C2A35]">
                                        <CreditCard className="h-3 w-3" />
                                        {getLegMethodLabel(leg)}
                                    </span>
                                </div>
                                <div className="mt-2 text-[13px] font-extrabold text-slate-900">
                                    {formatWon(leg.completedAmount || leg.requestedAmount || 0)}
                                </div>
                                <div className="mt-1 space-y-1 text-[11px] text-slate-500">
                                    <div>승인 정보: {approvalSummary || "없음"}</div>
                                    <div>마지막 완료 시각: {formatDateTime(leg.completedAt)}</div>
                                    {leg.errorMessage && (
                                        <div className="rounded-md bg-rose-50 px-2 py-1 text-rose-700">
                                            {leg.errorMessage}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusMeta.className}`}>
                                {statusMeta.icon}
                                {statusMeta.label}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

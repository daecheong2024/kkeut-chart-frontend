import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CreditCard, ReceiptText, TerminalSquare, Wrench } from "lucide-react";
import type { PaymentWorkCenterItem, PaymentWorkCenterSummary } from "../../services/paymentService";
import { RefundOperationLegTable } from "./RefundOperationLegTable";

function formatWon(amount: number): string {
    return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")}원`;
}

function formatDateTime(value?: string): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function toneClass(tone?: string): string {
    const value = String(tone || "").toLowerCase();
    if (value === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
    if (value === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
    if (value === "info") return "border-sky-200 bg-sky-50 text-sky-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
}

function workTypeLabel(workType?: string): string {
    const value = String(workType || "").toLowerCase();
    if (value === "collection") return "잔액 수납";
    if (value === "refund_follow_up") return "환불 후속";
    if (value === "manual_close") return "수기 마감";
    if (value === "terminal_info") return "단말 정보";
    return "작업";
}

interface RefundWorkCenterPanelProps {
    workCenter?: PaymentWorkCenterSummary | null;
    disabled?: boolean;
    onAction: (actionCode: string, item: PaymentWorkCenterItem) => void;
}

export function RefundWorkCenterPanel({ workCenter, disabled, onAction }: RefundWorkCenterPanelProps) {
    const items = workCenter?.items || [];
    const [selectedKey, setSelectedKey] = useState<string | null>(items[0]?.workItemKey || null);

    useEffect(() => {
        if (items.length === 0) {
            setSelectedKey(null);
            return;
        }
        if (!selectedKey || !items.some((item) => item.workItemKey === selectedKey)) {
            setSelectedKey(items[0]?.workItemKey ?? null);
        }
    }, [items, selectedKey]);

    const selectedItem = useMemo(
        () => items.find((item) => item.workItemKey === selectedKey) || items[0] || null,
        [items, selectedKey]
    );

    return (
        <div className="rounded-[18px] border border-[#F8DCE2] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[#F8DCE2] bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-[15px] font-extrabold text-[#5C2A35]">직원 작업센터</div>
                        <div className="mt-1 text-[11px] text-[#8B5A66]">
                            현재 상태와 다음 행동을 한 곳에서 확인하고 이어서 처리합니다.
                        </div>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#F4C7CE] bg-white px-2.5 py-1 text-[11px] font-bold text-[#8B3F50]">
                        미완료 {workCenter?.totalWorkItemCount || 0}
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {(() => {
                        const tiles = [
                            { label: "주의 필요", count: workCenter?.needsAttentionCount || 0, tone: "danger" as const },
                            { label: "잔액 수납", count: workCenter?.outstandingCollectionCount || 0, tone: "success" as const },
                            { label: "환불 후속", count: workCenter?.refundFollowUpCount || 0, tone: "warning" as const },
                            { label: "정보 입력", count: workCenter?.terminalInfoRequiredCount || 0, tone: "info" as const },
                        ];
                        const toneStyle = (tone: "danger" | "warning" | "info" | "success", hasCount: boolean) => {
                            if (!hasCount) return "border-slate-200 bg-slate-50 text-slate-400";
                            switch (tone) {
                                case "danger": return "border-rose-200 bg-rose-50 text-rose-700";
                                case "warning": return "border-amber-200 bg-amber-50 text-amber-700";
                                case "info": return "border-sky-200 bg-sky-50 text-sky-700";
                                case "success": return "border-emerald-200 bg-emerald-50 text-emerald-700";
                            }
                        };
                        return tiles.map((t) => {
                            const hasCount = t.count > 0;
                            return (
                                <div key={t.label} className={`rounded-[12px] border px-3 py-2 transition-colors ${toneStyle(t.tone, hasCount)}`}>
                                    <div className="text-[10px] font-bold opacity-80">{t.label}</div>
                                    <div className={`mt-1 text-[18px] font-extrabold ${hasCount ? "" : "opacity-60"}`}>{t.count}</div>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            <div className="px-3 py-3 space-y-3">
                {items.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                        <div className="text-[13px] font-bold text-slate-600">지금 바로 처리할 미완료 작업이 없습니다.</div>
                        <div className="mt-1 text-[11px] text-slate-500">새로고침 후에도 완료된 작업은 다시 표시되지 않습니다.</div>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            {items.map((item) => {
                                const selected = item.workItemKey === selectedItem?.workItemKey;
                                return (
                                    <button
                                        key={item.workItemKey}
                                        type="button"
                                        onClick={() => setSelectedKey(item.workItemKey)}
                                        className={`w-full rounded-[14px] border px-3 py-3 text-left transition-all ${selected
                                            ? "border-[#D27A8C] bg-[#FCF7F8] shadow-[0_0_0_1px_rgba(210,122,140,0.18)]"
                                            : "border-slate-200 bg-white hover:border-[#D27A8C]/40 hover:bg-[#FCF7F8]/70"}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClass(item.statusTone)}`}>
                                                        {item.statusLabel}
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-slate-500">{workTypeLabel(item.workType)}</span>
                                                </div>
                                                <div className="mt-1 text-[13px] font-extrabold text-slate-900">{item.headline}</div>
                                                <div className="mt-1 text-[11px] text-slate-500">{item.itemSummary}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-[10px] text-slate-400">{formatDateTime(item.lastUpdatedAt)}</div>
                                                {item.outstandingAmount > 0 && (
                                                    <div className="mt-1 text-[12px] font-extrabold text-[#8B3F50]">{formatWon(item.outstandingAmount)}</div>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {selectedItem && (
                            <div className="rounded-[16px] border border-slate-200 bg-slate-50/50 px-3 py-3 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClass(selectedItem.statusTone)}`}>
                                                {selectedItem.statusLabel}
                                            </span>
                                            <span className="text-[10px] font-semibold text-slate-500">
                                                결제 #{selectedItem.paymentMasterId}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-[15px] font-extrabold text-slate-900">{selectedItem.headline}</div>
                                        <div className="mt-1 text-[12px] leading-relaxed text-slate-600">{selectedItem.description}</div>
                                    </div>
                                    <div className="shrink-0 rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-right">
                                        <div className="text-[10px] text-slate-500">업데이트</div>
                                        <div className="mt-1 text-[11px] font-bold text-slate-700">{formatDateTime(selectedItem.lastUpdatedAt)}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded-[12px] border border-white bg-white px-3 py-2">
                                        <div className="text-[10px] font-bold text-slate-500">완료된 분할건</div>
                                        <div className="mt-1 text-[16px] font-extrabold text-slate-900">
                                            {selectedItem.succeededLegCount}/{selectedItem.totalLegCount || selectedItem.succeededLegCount}
                                        </div>
                                    </div>
                                    <div className="rounded-[12px] border border-white bg-white px-3 py-2">
                                        <div className="text-[10px] font-bold text-slate-500">남은 작업 금액</div>
                                        <div className="mt-1 text-[16px] font-extrabold text-slate-900">
                                            {selectedItem.outstandingAmount > 0 ? formatWon(selectedItem.outstandingAmount) : formatWon(selectedItem.totalAmount - selectedItem.completedAmount)}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    {selectedItem.unknownLegCount > 0 && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">
                                            <AlertTriangle className="h-3 w-3" />
                                            단말 확인 {selectedItem.unknownLegCount}건
                                        </span>
                                    )}
                                    {selectedItem.manualActionLegCount > 0 && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
                                            <Wrench className="h-3 w-3" />
                                            수기 확인 {selectedItem.manualActionLegCount}건
                                        </span>
                                    )}
                                    {selectedItem.missingTerminalDetailCount > 0 && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700">
                                            <TerminalSquare className="h-3 w-3" />
                                            단말 정보 부족 {selectedItem.missingTerminalDetailCount}건
                                        </span>
                                    )}
                                    {selectedItem.outstandingAmount > 0 && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                                            <CreditCard className="h-3 w-3" />
                                            잔액 수납 필요
                                        </span>
                                    )}
                                </div>

                                {selectedItem.availableActions.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-[11px] font-bold text-slate-600">다음 행동</div>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedItem.availableActions.map((action) => (
                                                <button
                                                    key={`${selectedItem.workItemKey}-${action.actionCode}`}
                                                    type="button"
                                                    disabled={disabled}
                                                    onClick={() => onAction(action.actionCode, selectedItem)}
                                                    className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-bold transition-all ${action.isPrimary
                                                        ? "bg-[#D27A8C] text-white shadow-[0_4px_12px_rgba(210,122,140,0.24)] hover:bg-[#8B3F50]"
                                                        : "border border-[#F8DCE2] bg-white text-[#8B3F50] hover:bg-[#FCF7F8]"} disabled:cursor-not-allowed disabled:opacity-50`}
                                                >
                                                    {action.label}
                                                    <ArrowRight className="h-3.5 w-3.5" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedItem.missingTerminalDetails.length > 0 && (
                                    <div className="rounded-[14px] border border-sky-100 bg-white px-3 py-3">
                                        <div className="flex items-center gap-2 text-[11px] font-bold text-sky-700">
                                            <ReceiptText className="h-3.5 w-3.5" />
                                            영수증 보고 보완할 정보
                                        </div>
                                        <div className="mt-2 space-y-2">
                                            {selectedItem.missingTerminalDetails.map((detail, idx) => (
                                                <div key={detail.paymentDetailId} className="rounded-[10px] border border-slate-100 bg-slate-50 px-3 py-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-[11px] font-bold text-slate-700">
                                                            {idx + 1}. {detail.paymentSubMethodLabel || detail.cardCompany || "결제수단 미지정"}
                                                        </div>
                                                        <div className="text-[11px] font-extrabold text-slate-900">{formatWon(detail.amount)}</div>
                                                    </div>
                                                    <div className="mt-1 text-[10px] text-slate-500">
                                                        {detail.cardCompany && detail.paymentSubMethodLabel ? `${detail.cardCompany} · ` : ""}{detail.missingFieldSummary}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div className="text-[11px] font-bold text-slate-600">분할건 상태</div>
                                    <RefundOperationLegTable operation={selectedItem.operation} />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

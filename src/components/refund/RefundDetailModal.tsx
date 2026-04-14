import { useEffect, useState } from "react";
import { paymentService, RefundSummaryResult } from "../../services/paymentService";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { X } from "lucide-react";

interface Props {
    open: boolean;
    membershipHistId: number | null;
    onClose: () => void;
}

export function RefundDetailModal({ open, membershipHistId, onClose }: Props) {
    const [info, setInfo] = useState<RefundSummaryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        if (!open || !membershipHistId) {
            setInfo(null);
            setError("");
            return;
        }
        setLoading(true);
        setError("");
        paymentService
            .getRefundSummaryByMembershipHist(membershipHistId)
            .then((data) => setInfo(data))
            .catch((e: any) => setError(e?.response?.data?.message || e?.message || "환불 상세 조회 실패"))
            .finally(() => setLoading(false));
    }, [open, membershipHistId]);

    if (!open) return null;

    const formatWon = (n: number) => `${n.toLocaleString()}원`;
    const paymentTypeLabel = (pt?: string): string => {
        switch (pt) {
            case "CARD": return "카드";
            case "CASH": return "현금";
            case "BANKING": return "계좌이체";
            case "PAY": return "간편결제";
            case "MEMBERSHIP_CASH": return "회원권 현금 잔액";
            case "MEMBERSHIP_POINT": return "회원권 포인트";
            default: return pt || "";
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="w-full max-w-md max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F8DCE2] bg-gradient-to-r from-[#FCEBEF]/50 to-[#FCF7F8] shrink-0">
                    <h2 className="text-[15px] font-extrabold text-[#5C2A35]">환불 상세 내역</h2>
                    <button type="button" onClick={onClose} className="text-[#8B5A66] hover:text-[#5C2A35]">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1">
                    {loading && <div className="text-center text-[13px] text-[#8B5A66] py-6">로딩 중...</div>}
                    {error && <div className="text-center text-[13px] text-red-600 py-6">{error}</div>}
                    {info && !loading && !error && (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-[#F8DCE2] bg-[#FCF7F8] p-3 space-y-1.5">
                                <div className="flex justify-between text-[12px]">
                                    <span className="text-[#8B5A66]">환불 일시</span>
                                    <span className="font-semibold text-[#5C2A35]">{format(new Date(info.refundDateTime), "yyyy.MM.dd HH:mm:ss", { locale: ko })}</span>
                                </div>
                                {info.collectorName && (
                                    <div className="flex justify-between text-[12px]">
                                        <span className="text-[#8B5A66]">처리자</span>
                                        <span className="font-semibold text-[#5C2A35]">{info.collectorName}</span>
                                    </div>
                                )}
                                {info.refundMethod && (
                                    <div className="flex justify-between text-[12px]">
                                        <span className="text-[#8B5A66]">환불 수단</span>
                                        <span className="font-semibold text-[#5C2A35]">{paymentTypeLabel(info.refundMethod)}</span>
                                    </div>
                                )}
                            </div>

                            {(() => {
                                const customerRefundItems = info.items.filter(i => i.paymentType !== "MEMBERSHIP_CASH" && i.paymentType !== "MEMBERSHIP_POINT");
                                const balanceRestoreItems = info.items.filter(i => i.paymentType === "MEMBERSHIP_CASH" || i.paymentType === "MEMBERSHIP_POINT");
                                const balanceRestoreTotal = balanceRestoreItems.reduce((s, i) => s + i.amount, 0);

                                const renderItem = (item: typeof info.items[number], idx: number) => (
                                    <div key={idx} className="px-3 py-2.5 bg-white">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                        item.type === "ticket" ? "bg-rose-50 text-rose-600" :
                                                        item.type === "membership_balance" ? "bg-violet-50 text-violet-700" :
                                                        "bg-gray-100 text-gray-600"
                                                    }`}>
                                                        {item.type === "ticket" ? "티켓" : item.type === "membership_balance" ? "회원권 잔액" : "기타"}
                                                    </span>
                                                </div>
                                                <div className="text-[13px] font-semibold text-[#242424] break-words">{item.name}</div>
                                                {item.paymentType && (
                                                    <div className="text-[10px] text-[#8B5A66] mt-0.5">{paymentTypeLabel(item.paymentType)}</div>
                                                )}
                                            </div>
                                            <div className="text-[14px] font-extrabold tabular-nums text-rose-600 shrink-0">
                                                {formatWon(item.amount)}
                                            </div>
                                        </div>
                                        {item.type === "ticket" && (item.paidAmount != null || item.usageDeduction != null) && (
                                            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-[#8B5A66] space-y-0.5">
                                                {item.paidAmount != null && (
                                                    <div className="flex justify-between"><span>결제액</span><span className="tabular-nums text-[#2A1F22]">{formatWon(item.paidAmount)}</span></div>
                                                )}
                                                {(item.usageDeduction ?? 0) > 0 && (
                                                    <div className="flex justify-between text-rose-500">
                                                        <span>사용 차감 ({item.usedCount}/{item.totalCount}회)</span>
                                                        <span className="tabular-nums">−{formatWon(item.usageDeduction!)} <span className="text-[9px] text-rose-400">(1회 {formatWon(item.singleSessionPrice || 0)} × {item.usedCount}회)</span></span>
                                                    </div>
                                                )}
                                                {item.paidAmount != null && (
                                                    <div className="flex justify-between text-[10px] text-slate-500 pt-0.5 border-t border-slate-100/60">
                                                        <span>= 결제액 − 사용차감</span>
                                                        <span className="tabular-nums">{formatWon(item.paidAmount - (item.usageDeduction ?? 0))}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );

                                return (
                                    <>
                                        <div>
                                            <div className="text-[12px] font-bold text-[#5C2A35] mb-1.5">💳 고객 환불 (실제 출금)</div>
                                            <div className="rounded-xl border border-[#F8DCE2] divide-y divide-[#F8DCE2]/60 overflow-hidden">
                                                {customerRefundItems.length === 0 ? (
                                                    <div className="text-[12px] text-[#8B5A66] italic px-3 py-3 text-center">고객 환불 항목이 없습니다.</div>
                                                ) : customerRefundItems.map(renderItem)}
                                            </div>
                                        </div>

                                        {balanceRestoreItems.length > 0 && (
                                            <div>
                                                <div className="text-[12px] font-bold text-violet-700 mb-1.5">🔄 회원권 잔액 복구 <span className="font-normal text-[10px] text-violet-500">(고객 출금 아님 · 잔액으로 되돌아감)</span></div>
                                                <div className="rounded-xl border border-violet-200 divide-y divide-violet-100 overflow-hidden">
                                                    {balanceRestoreItems.map(renderItem)}
                                                </div>
                                                <div className="mt-1 text-right text-[10px] text-violet-600 tabular-nums">복구 합계 {formatWon(balanceRestoreTotal)}</div>
                                            </div>
                                        )}

                                        <div className="rounded-xl border-2 border-[#D27A8C] bg-[#FCEBEF]/40 p-3 flex justify-between items-center">
                                            <span className="text-[13px] font-bold text-[#5C2A35]">총 고객 환불액</span>
                                            <span className="text-[18px] font-extrabold tabular-nums text-[#8B3F50]">{formatWon(info.totalRefunded)}</span>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-[#F8DCE2] bg-[#FCF7F8] flex justify-end shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg bg-[#D27A8C] hover:bg-[#8B3F50] text-white text-[13px] font-bold transition-all"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}

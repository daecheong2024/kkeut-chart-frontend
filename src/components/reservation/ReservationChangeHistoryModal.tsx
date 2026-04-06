import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { format } from "date-fns";
import { visitService } from "../../services/visitService";

interface ChangeHistoryItem {
    id: number;
    reservationId: number;
    changeType: string;
    previousValue?: string | null;
    newValue?: string | null;
    changedByUserName?: string | null;
    changedAt: string;
    remarks?: string | null;
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
    CREATED: "예약 생성",
    DATE_CHANGED: "일시 변경",
    CATEGORY_CHANGED: "카테고리 변경",
    MEMO_CHANGED: "메모 변경",
    CANCELLED: "예약 취소",
    NO_SHOW: "노쇼",
    CHECKED_IN: "접수",
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
    CREATED: "bg-[#E8EAF6] text-[#3F51B5]",
    DATE_CHANGED: "bg-amber-50 text-amber-700",
    CATEGORY_CHANGED: "bg-teal-50 text-teal-700",
    MEMO_CHANGED: "bg-sky-50 text-sky-700",
    CANCELLED: "bg-rose-50 text-rose-600",
    NO_SHOW: "bg-red-50 text-red-600",
    CHECKED_IN: "bg-emerald-50 text-emerald-700",
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    reservationId: number;
}

export function ReservationChangeHistoryModal({ isOpen, onClose, reservationId }: Props) {
    const [items, setItems] = useState<ChangeHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !reservationId) return;
        setLoading(true);
        visitService.getReservationChanges(reservationId)
            .then((data) => setItems(data))
            .finally(() => setLoading(false));
    }, [isOpen, reservationId]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div
                className="relative flex flex-col w-[800px] max-h-[80vh] rounded-2xl border border-[#C5CAE9] bg-white animate-in fade-in zoom-in-95 duration-200"
                style={{ boxShadow: "0 8px 32px rgba(63, 81, 181, 0.12)" }}
            >
                <div className="flex items-center justify-between px-6 py-4 bg-[#F8F9FD] rounded-t-2xl border-b border-[#C5CAE9]">
                    <h2 className="text-base font-bold text-[#1A237E] tracking-tight">예약 수정이력</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-[#616161] hover:bg-[#E8EAF6] transition-all duration-200"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="text-center text-[#616161] py-16 text-sm">불러오는 중...</div>
                    ) : items.length === 0 ? (
                        <div className="text-center text-[#616161] py-16 text-sm">수정이력이 없습니다.</div>
                    ) : (
                        <table className="w-full text-sm border-collapse">
                            <thead className="sticky top-0 bg-[#F8F9FD]">
                                <tr className="border-b border-[#C5CAE9]">
                                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1A237E] w-[108px]">변경유형</th>
                                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1A237E]">이전값</th>
                                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1A237E]">변경값</th>
                                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1A237E] w-[72px]">변경자</th>
                                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1A237E] w-[132px]">변경일시</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="border-b border-gray-100 hover:bg-[#E8EAF6]/40 transition-colors duration-200"
                                    >
                                        <td className="py-3 px-4 text-center">
                                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${CHANGE_TYPE_COLORS[item.changeType] || "bg-gray-100 text-gray-600"}`}>
                                                {CHANGE_TYPE_LABELS[item.changeType] || item.changeType}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center text-[#616161] break-words whitespace-pre-wrap">
                                            {item.previousValue || "-"}
                                        </td>
                                        <td className="py-3 px-4 text-center text-[#242424] font-medium break-words whitespace-pre-wrap">
                                            {item.newValue || "-"}
                                        </td>
                                        <td className="py-3 px-4 text-center text-[#242424] whitespace-nowrap">
                                            {item.changedByUserName || "-"}
                                        </td>
                                        <td className="py-3 px-4 text-center text-[#616161] whitespace-nowrap">
                                            {item.changedAt ? format(new Date(item.changedAt), "yyyy-MM-dd HH:mm") : "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex justify-end px-6 py-3 border-t border-[#C5CAE9] bg-[#F8F9FD] rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="h-10 px-6 rounded-lg border border-[#C5CAE9] text-sm font-medium text-[#242424] hover:bg-[#E8EAF6] transition-all duration-200"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

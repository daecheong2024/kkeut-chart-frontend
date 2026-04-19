import { format } from "date-fns";
import { Ticket } from "lucide-react";
import type { CardHoverOverlayState } from "./useCardHoverOverlay";

interface Props {
    overlay: CardHoverOverlayState;
}

export function PatientHoverOverlay({ overlay }: Props) {
    const {
        hoveredCard,
        hoverOverlayRef,
        hoverOverlayStyle,
        shouldShowHoverOverlay,
        hoveredCustomerId,
        hoveredTickets,
        isHoverTicketLoading,
        hoveredKeyRecords,
        isHoverKeyRecordLoading,
        hoveredPlannedSummary,
        hoverHistoryText,
        receptionMemoText,
    } = overlay;

    if (!shouldShowHoverOverlay || !hoveredCard) return null;

    return (
        <div
            ref={hoverOverlayRef}
            className="fixed z-[9999] kkeut-card-luxe p-3 animate-in fade-in duration-200 pointer-events-none"
            style={hoverOverlayStyle ?? {
                top: hoveredCard.rect.bottom + 12,
                left: hoveredCard.rect.left,
                width: hoveredCard.rect.width,
                minHeight: hoveredCard.rect.height,
            }}
        >
            <div className="space-y-3">
                {hoveredPlannedSummary.length > 0 && (
                    <div>
                        <div className="text-xs font-bold text-blue-800 mb-1">예약 시술</div>
                        <div className="flex flex-wrap gap-1.5">
                            {hoveredPlannedSummary.map((name, idx) => (
                                <span
                                    key={`hover-planned-${hoveredCustomerId}-${idx}-${name}`}
                                    className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50/70 px-2 py-1 text-[11px] font-medium text-blue-700"
                                >
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {(hoveredCustomerId > 0 || isHoverTicketLoading || hoveredTickets.length > 0) && (
                    <div>
                        <div className="text-xs font-bold text-cyan-800 mb-1">남은 시술권</div>
                        {isHoverTicketLoading ? (
                            <div className="text-xs text-slate-500">불러오는 중...</div>
                        ) : hoveredTickets.length === 0 ? (
                            <div className="text-xs text-slate-500">남은 시술권이 없습니다.</div>
                        ) : (
                            <div className="space-y-1.5">
                                {hoveredTickets.slice(0, 6).map((ticket) => (
                                    <div
                                        key={`hover-ticket-${hoveredCustomerId}-${ticket.ticketId}`}
                                        className={`rounded-lg border px-2.5 py-1.5 ${
                                            ticket.cycleBlocked
                                                ? "border-red-200 bg-red-50/50 opacity-70"
                                                : ticket.isReserved
                                                    ? "border-cyan-200 bg-cyan-50/60"
                                                    : "border-slate-200 bg-white/70"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                            <div className="min-w-0 flex items-center gap-1.5">
                                                <Ticket className="h-3 w-3 shrink-0 text-slate-500" />
                                                <span className="truncate font-semibold text-slate-700">{ticket.ticketName}</span>
                                                {ticket.isReserved && (
                                                    <span className="shrink-0 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700">
                                                        예약 매칭
                                                    </span>
                                                )}
                                                {ticket.isPeriod && (
                                                    <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                                                        주기권
                                                    </span>
                                                )}
                                            </div>
                                            <span className="shrink-0 font-bold text-[#D27A8C]">
                                                잔여 {ticket.remaining}회
                                            </span>
                                        </div>
                                        <div className={`mt-0.5 text-[10px] font-medium ${
                                            ticket.cycleBlocked ? "text-red-500" : "text-emerald-600"
                                        }`}>
                                            {ticket.cycleBlocked
                                                ? `⛔ ${ticket.cycleBlockReason || "사용 불가"}`
                                                : "즉시 차감 가능"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {(hoveredCustomerId > 0 || isHoverKeyRecordLoading || hoveredKeyRecords.length > 0) && (
                    <div>
                        <div className="text-xs font-bold text-amber-800 mb-1">중요기록</div>
                        {isHoverKeyRecordLoading ? (
                            <div className="text-xs text-slate-500">불러오는 중...</div>
                        ) : hoveredKeyRecords.length === 0 ? (
                            <div className="text-xs text-slate-500">중요기록이 없습니다.</div>
                        ) : (
                            <div className="space-y-1">
                                {hoveredKeyRecords.map((record) => {
                                    const createdAtLabel = (() => {
                                        if (!record.createdAt) return "";
                                        const parsed = new Date(record.createdAt);
                                        if (Number.isNaN(parsed.getTime())) return "";
                                        return format(parsed, "yyyy.MM.dd HH:mm");
                                    })();
                                    return (
                                        <div
                                            key={`hover-key-record-${hoveredCustomerId}-${record.id}`}
                                            className="rounded border border-amber-200/70 bg-amber-50/40 px-2 py-1.5"
                                        >
                                            <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                {record.content}
                                            </div>
                                            {(createdAtLabel || record.createdByName) && (
                                                <div className="mt-1 text-[10px] text-slate-500">
                                                    {createdAtLabel}
                                                    {createdAtLabel && record.createdByName ? " · " : ""}
                                                    {record.createdByName || ""}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                {receptionMemoText && (
                    <div>
                        <div className="text-xs font-bold text-rose-800 mb-1">접수메모</div>
                        <div className="rounded border border-rose-200/70 bg-rose-50/40 px-2 py-1.5 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {receptionMemoText}
                        </div>
                    </div>
                )}
                {hoverHistoryText && (
                    <div className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                        {hoverHistoryText}
                    </div>
                )}
            </div>
        </div>
    );
}

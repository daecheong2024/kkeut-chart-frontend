import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import type { Patient } from "../../../types/chart";
import { ticketService } from "../../../services/ticketService";
import { patientRecordService } from "../../../services/patientRecordService";
import type { HoverKeyRecordSummary, HoverTicketSummary } from "./types";
import {
    getHoverPlannedProcedures,
    getPlannedTicketNames,
    normalizeTicketKey,
    toPositiveInt,
    toStringArray,
} from "./helpers";

interface HoveredCard {
    id: number;
    data: Patient;
    rect: DOMRect;
    anchorEl: HTMLDivElement;
}

interface UseCardHoverOverlayOptions {
    ticketDefs?: any[];
    disabled?: boolean;
}

export interface CardHoverOverlayState {
    hoveredCard: HoveredCard | null;
    hoverOverlayRef: React.MutableRefObject<HTMLDivElement | null>;
    hoverOverlayStyle: { top: number; left: number; width: number; minHeight: number } | null;
    shouldShowHoverOverlay: boolean;
    hoveredCustomerId: number;
    hoveredTickets: HoverTicketSummary[];
    isHoverTicketLoading: boolean;
    hoveredKeyRecords: HoverKeyRecordSummary[];
    isHoverKeyRecordLoading: boolean;
    hoveredPlannedSummary: string[];
    hoverHistoryText: string;
    receptionMemoText: string;
    handleCardHover: (event: React.MouseEvent<HTMLDivElement>, data: Patient) => void;
    handleCardLeave: () => void;
}

export function useCardHoverOverlay(options: UseCardHoverOverlayOptions = {}): CardHoverOverlayState {
    const { ticketDefs = [], disabled = false } = options;

    const [hoveredCard, setHoveredCard] = useState<HoveredCard | null>(null);
    const [hoverTicketsByPatient, setHoverTicketsByPatient] = useState<Record<number, HoverTicketSummary[]>>({});
    const [hoverTicketLoadingPatientId, setHoverTicketLoadingPatientId] = useState<number | null>(null);
    const [hoverKeyRecordsByPatient, setHoverKeyRecordsByPatient] = useState<Record<number, HoverKeyRecordSummary[]>>({});
    const [hoverKeyRecordLoadingPatientId, setHoverKeyRecordLoadingPatientId] = useState<number | null>(null);
    const hoverOverlayRef = useRef<HTMLDivElement | null>(null);
    const [hoverOverlayStyle, setHoverOverlayStyle] = useState<{ top: number; left: number; width: number; minHeight: number } | null>(null);

    const loadHoverTickets = useCallback(async (patient: Patient) => {
        const customerId = Number(patient.patientId || patient.id);
        if (!Number.isFinite(customerId) || customerId <= 0) return;
        if (Object.prototype.hasOwnProperty.call(hoverTicketsByPatient, customerId)) return;
        if (hoverTicketLoadingPatientId === customerId) return;

        setHoverTicketLoadingPatientId(customerId);
        try {
            const tickets = await ticketService.getTickets(customerId);
            const plannedTicketIdKeys = new Set(
                toStringArray((patient as any).plannedTicketIds).map(normalizeTicketKey).filter(Boolean)
            );
            const plannedTicketNameKeys = new Set(
                getPlannedTicketNames(patient).map(normalizeTicketKey).filter(Boolean)
            );
            const mapped: HoverTicketSummary[] = (tickets || [])
                .filter((ticket: any) => (ticket as any)?.isActive !== false)
                .map((ticket: any) => {
                    const ticketDef = (ticketDefs || []).find((def: any) =>
                        normalizeTicketKey(def?.id) === normalizeTicketKey((ticket as any)?.itemId) ||
                        normalizeTicketKey(def?.code) === normalizeTicketKey((ticket as any)?.itemId) ||
                        normalizeTicketKey(def?.name) === normalizeTicketKey((ticket as any)?.itemName)
                    );
                    const usageUnit = normalizeTicketKey(
                        (ticket as any)?.itemType || ticketDef?.usageUnit || ""
                    );
                    const isPeriod = usageUnit === "period";
                    const minIntervalDays = toPositiveInt(
                        (ticket as any)?.minIntervalDays ?? ticketDef?.minIntervalDays ?? 0
                    );
                    const lastUsedRaw = (ticket as any)?.lastUsedAt || (ticket as any)?.lastUsedDate;

                    let cycleBlocked = false;
                    let cycleBlockReason: string | undefined;
                    let nextAvailableAt: string | undefined;

                    const weekTicketName = (ticket as any).weekTicketName || (ticket as any).snapshotWeekTicketName || ticketDef?.weekTicketName;
                    const availableDayValue = Number((ticket as any).availableDayValue ?? (ticket as any).snapshotAvailableDayValue ?? ticketDef?.availableDayValue ?? 0);
                    if (weekTicketName && availableDayValue > 0) {
                        const todayDow = new Date().getDay();
                        const dayBit = 1 << todayDow;
                        if ((availableDayValue & dayBit) === 0) {
                            const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
                            const allowedDays = dayNames.filter((_, i) => (availableDayValue & (1 << i)) !== 0).join(", ");
                            cycleBlocked = true;
                            cycleBlockReason = `요일권 제한: 오늘(${dayNames[todayDow]})은 사용 불가 (사용 가능: ${allowedDays})`;
                        }
                    }

                    if (!cycleBlocked && minIntervalDays > 0 && lastUsedRaw) {
                        const lastUsedDate = new Date(lastUsedRaw);
                        if (!Number.isNaN(lastUsedDate.getTime())) {
                            const nextDate = new Date(lastUsedDate);
                            nextDate.setDate(nextDate.getDate() + minIntervalDays);
                            if (Date.now() < nextDate.getTime()) {
                                cycleBlocked = true;
                                nextAvailableAt = format(nextDate, "yyyy-MM-dd HH:mm");
                                cycleBlockReason = `주기 제한 · ${nextAvailableAt} 이후 가능`;
                            }
                        }
                    }

                    const ticketId = String((ticket as any)?.id ?? (ticket as any)?.itemId ?? "");
                    const ticketName = String((ticket as any)?.itemName || "시술권");
                    const ticketIdKey = normalizeTicketKey(ticketId);
                    const ticketNameKey = normalizeTicketKey(ticketName);
                    const isReserved =
                        plannedTicketIdKeys.has(ticketIdKey) ||
                        plannedTicketNameKeys.has(ticketNameKey);

                    return {
                        ticketId,
                        ticketName,
                        remaining: toPositiveInt((ticket as any)?.remainingCount ?? (ticket as any)?.quantity),
                        isPeriod,
                        isReserved,
                        cycleBlocked,
                        cycleBlockReason,
                        nextAvailableAt,
                    };
                })
                .filter((ticket: HoverTicketSummary) => ticket.remaining > 0)
                .sort((a: HoverTicketSummary, b: HoverTicketSummary) => {
                    if (Number(a.isReserved) !== Number(b.isReserved)) return Number(b.isReserved) - Number(a.isReserved);
                    if (a.cycleBlocked !== b.cycleBlocked) return a.cycleBlocked ? 1 : -1;
                    if (a.remaining !== b.remaining) return b.remaining - a.remaining;
                    return a.ticketName.localeCompare(b.ticketName, "ko-KR");
                });

            setHoverTicketsByPatient((prev) => ({ ...prev, [customerId]: mapped }));
        } catch (error) {
            console.error("failed to load hover ticket summary", error);
            setHoverTicketsByPatient((prev) => ({ ...prev, [customerId]: [] }));
        } finally {
            setHoverTicketLoadingPatientId((current) => (current === customerId ? null : current));
        }
    }, [hoverTicketsByPatient, hoverTicketLoadingPatientId, ticketDefs]);

    const loadHoverKeyRecords = useCallback(async (patient: Patient) => {
        const customerId = Number(patient.patientId || patient.id);
        if (!Number.isFinite(customerId) || customerId <= 0) return;
        if (Object.prototype.hasOwnProperty.call(hoverKeyRecordsByPatient, customerId)) return;
        if (hoverKeyRecordLoadingPatientId === customerId) return;

        setHoverKeyRecordLoadingPatientId(customerId);
        try {
            const records = await patientRecordService.getByPatientId(customerId);
            const mapped: HoverKeyRecordSummary[] = (records || [])
                .filter((record: any) => Boolean(record?.isPinned) && String(record?.content || "").trim().length > 0)
                .sort((a: any, b: any) => {
                    const timeA = new Date(String(a?.createdAt || 0)).getTime();
                    const timeB = new Date(String(b?.createdAt || 0)).getTime();
                    return timeB - timeA;
                })
                .slice(0, 3)
                .map((record: any) => ({
                    id: Number(record?.id || 0),
                    content: String(record?.content || "").trim(),
                    createdAt: record?.createdAt ? String(record.createdAt) : undefined,
                    createdByName: record?.createdByName ? String(record.createdByName) : undefined,
                }));
            setHoverKeyRecordsByPatient((prev) => ({ ...prev, [customerId]: mapped }));
        } catch (error) {
            console.error("failed to load hover key records", error);
            setHoverKeyRecordsByPatient((prev) => ({ ...prev, [customerId]: [] }));
        } finally {
            setHoverKeyRecordLoadingPatientId((current) => (current === customerId ? null : current));
        }
    }, [hoverKeyRecordsByPatient, hoverKeyRecordLoadingPatientId]);

    const handleCardHover = useCallback((event: React.MouseEvent<HTMLDivElement>, data: Patient) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setHoveredCard({ id: data.id, data, rect, anchorEl: event.currentTarget });
        void loadHoverTickets(data);
        void loadHoverKeyRecords(data);
    }, [loadHoverTickets, loadHoverKeyRecords]);

    const handleCardLeave = useCallback(() => {
        setHoveredCard(null);
        setHoverOverlayStyle(null);
    }, []);

    const hoveredCustomerId = hoveredCard
        ? Number(hoveredCard.data.patientId || hoveredCard.data.id)
        : 0;
    const hoveredTickets =
        hoveredCustomerId > 0 ? (hoverTicketsByPatient[hoveredCustomerId] || []) : [];
    const hasHoverTicketSnapshot =
        hoveredCustomerId > 0 &&
        Object.prototype.hasOwnProperty.call(hoverTicketsByPatient, hoveredCustomerId);
    const isHoverTicketLoading =
        hoveredCustomerId > 0 && hoverTicketLoadingPatientId === hoveredCustomerId;
    const hoveredKeyRecords =
        hoveredCustomerId > 0 ? (hoverKeyRecordsByPatient[hoveredCustomerId] || []) : [];
    const hasHoverKeyRecordSnapshot =
        hoveredCustomerId > 0 &&
        Object.prototype.hasOwnProperty.call(hoverKeyRecordsByPatient, hoveredCustomerId);
    const isHoverKeyRecordLoading =
        hoveredCustomerId > 0 && hoverKeyRecordLoadingPatientId === hoveredCustomerId;
    const hoveredPlannedSummary = hoveredCard
        ? getHoverPlannedProcedures(hoveredCard.data, hoveredTickets, hasHoverTicketSnapshot)
        : [];
    const hoverHistoryText = hoveredCard?.data?.history
        ? String(hoveredCard.data.history)
            .split("\n")
            .filter((line) => {
                const trimmed = line.trim();
                if (!trimmed) return true;
                return !trimmed.includes("선택 시술권") && !trimmed.includes("예약 시술");
            })
            .join("\n")
            .trim()
        : "";
    const receptionMemoText = hoveredCard?.data
        ? String(
            (hoveredCard.data as any).receptionMemo
            || (hoveredCard.data as any).memo
            || ""
        ).trim()
        : "";

    const shouldShowHoverOverlay = Boolean(
        hoveredCard &&
        !disabled &&
        (
            hoveredPlannedSummary.length > 0 ||
            hoverHistoryText ||
            receptionMemoText ||
            hoveredTickets.length > 0 ||
            isHoverTicketLoading ||
            hasHoverTicketSnapshot ||
            hoveredKeyRecords.length > 0 ||
            isHoverKeyRecordLoading ||
            hasHoverKeyRecordSnapshot
        )
    );

    const updateHoverPosition = useCallback(() => {
        if (!hoveredCard) return;
        const margin = 8;
        const gap = 12;
        const overlayEl = hoverOverlayRef.current;
        const liveAnchorRect = hoveredCard.anchorEl?.getBoundingClientRect();
        const anchorRect = liveAnchorRect && liveAnchorRect.width > 0
            ? liveAnchorRect
            : hoveredCard.rect;

        const overlayHeight = overlayEl?.getBoundingClientRect().height ?? anchorRect.height;
        const overlayWidth = anchorRect.width;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        let left = anchorRect.left;
        const maxLeft = Math.max(margin, viewportWidth - overlayWidth - margin);
        left = Math.min(Math.max(margin, left), maxLeft);

        let top = anchorRect.bottom + gap;
        if (top + overlayHeight > viewportHeight - margin) {
            const topAbove = anchorRect.top - overlayHeight - gap;
            top = topAbove >= margin
                ? topAbove
                : Math.max(margin, viewportHeight - overlayHeight - margin);
        }

        setHoverOverlayStyle({
            top,
            left,
            width: overlayWidth,
            minHeight: anchorRect.height,
        });
    }, [hoveredCard]);

    useEffect(() => {
        if (!shouldShowHoverOverlay || !hoveredCard) {
            setHoverOverlayStyle(null);
            return;
        }

        updateHoverPosition();
        const frameId = window.requestAnimationFrame(updateHoverPosition);
        window.addEventListener("resize", updateHoverPosition);
        window.addEventListener("scroll", updateHoverPosition, true);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener("resize", updateHoverPosition);
            window.removeEventListener("scroll", updateHoverPosition, true);
        };
    }, [shouldShowHoverOverlay, hoveredCard, updateHoverPosition]);

    useEffect(() => {
        if (!shouldShowHoverOverlay || !hoveredCard) return;
        requestAnimationFrame(updateHoverPosition);
    }, [shouldShowHoverOverlay, hoveredCard, hoveredTickets.length, hoveredKeyRecords.length, isHoverTicketLoading, isHoverKeyRecordLoading, updateHoverPosition]);

    return {
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
        handleCardHover,
        handleCardLeave,
    };
}

import type { Patient } from "../../../types/chart";
import type { HoverTicketSummary } from "./types";

export function normalizeTicketKey(value: unknown): string {
    return String(value ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

export function toPositiveInt(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.trunc(n));
}

export function toStringArray(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
        } catch {
            return value.split(",").map((v) => v.trim()).filter(Boolean);
        }
    }
    return [];
}

export function getPlannedTicketNames(patient: Patient): string[] {
    return toStringArray((patient as any).plannedTicketNames);
}

export function getHoverPlannedProcedures(
    patient: Patient,
    tickets: HoverTicketSummary[],
    hasTicketSnapshot: boolean
): string[] {
    const explicitTreatments = toStringArray((patient as any).plannedTreatments)
        .map((value) => String(value).trim())
        .filter(Boolean);

    const matchedReservedKeys = new Set(
        tickets
            .filter((ticket) => ticket.isReserved)
            .flatMap((ticket) => [normalizeTicketKey(ticket.ticketId), normalizeTicketKey(ticket.ticketName)])
            .filter(Boolean)
    );

    const unmatchedTicketNames = hasTicketSnapshot
        ? getPlannedTicketNames(patient)
            .map((value) => String(value).trim())
            .filter(Boolean)
            .filter((name) => !matchedReservedKeys.has(normalizeTicketKey(name)))
        : [];

    return Array.from(new Set([...explicitTreatments, ...unmatchedTicketNames]));
}

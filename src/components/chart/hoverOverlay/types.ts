export interface HoverTicketSummary {
    ticketId: string;
    ticketName: string;
    remaining: number;
    isPeriod: boolean;
    isReserved: boolean;
    cycleBlocked: boolean;
    cycleBlockReason?: string;
    nextAvailableAt?: string;
}

export interface HoverKeyRecordSummary {
    id: number;
    content: string;
    createdAt?: string;
    createdByName?: string;
}

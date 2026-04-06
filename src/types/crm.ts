export type MessageChannel = "sms" | "kakao";
export type MessageStatus = "queued" | "sent" | "failed" | "skipped";
export type AutomationTrigger = "reservationCreated" | "reservationReminder" | "visitCompleted" | "ticketUsed" | "manual";
export type AutomationScheduleType = "immediate" | "before" | "after";
export type MessageTemplateStatus = "draft" | "published" | "archived";

export interface MessageTemplate {
    id: string;
    name: string;
    channel: MessageChannel;
    category: string;
    enabled: boolean;
    content: string;
    variables: string[];
    updatedAt: string;
    status?: MessageTemplateStatus;
    version?: number;
    publishedAt?: string;
}

export interface AutomationRule {
    id: string;
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    schedule: {
        type: AutomationScheduleType;
        days?: number;
        hours?: number;
        minutes?: number;
    };
    templateId: string;
    filters: {
        branchScope: "all" | "mine" | "selected";
        branchIds?: string[];
        excludeOptOut: boolean;
    };
    throttle?: {
        maxPerPatientPerDay?: number;
    };
}

export interface OutboxItem {
    id: string;
    createdAt: string;
    channel: MessageChannel;
    status: MessageStatus;
    reason?: string;
    patientId: string;
    patientName: string;
    phoneMasked: string; // e.g. 010-****-1234
    templateId?: string;
    templateName: string;
    contentRendered: string;
    related?: {
        type: "reservation" | "visit" | "ticket" | null;
        refId?: string;
    };
}

export interface PatientCommPref {
    patientId: string; // Key is usually patientId, but keeping it here for array operations if needed or just consistent object shape
    optOutAll: boolean;
    optOutSms: boolean;
    optOutKakao: boolean;
    updatedAt: string;
    memo?: string;
}

export interface CrmMessagesState {
    templates: MessageTemplate[];
    automations: AutomationRule[];
    outbox: OutboxItem[];
    patientCommPrefs: Record<string, PatientCommPref>;

    // Actions
    addTemplate: (t: MessageTemplate) => void;
    setTemplates: (templates: MessageTemplate[]) => void;
    updateTemplate: (id: string, patch: Partial<MessageTemplate>) => void;
    deleteTemplate: (id: string) => void;

    addAutomation: (a: AutomationRule) => void;
    setAutomations: (automations: AutomationRule[]) => void;
    updateAutomation: (id: string, patch: Partial<AutomationRule>) => void;
    deleteAutomation: (id: string) => void;

    addOutboxItem: (item: OutboxItem) => void;
    setOutbox: (outbox: OutboxItem[]) => void;
    updateOutboxItem: (id: string, patch: Partial<OutboxItem>) => void; // e.g. retry

    setPatientPref: (patientId: string, pref: Partial<PatientCommPref>) => void;
}

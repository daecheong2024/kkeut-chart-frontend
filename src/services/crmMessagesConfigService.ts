import apiClient from "./apiClient";
import type { AutomationRule, MessageTemplate, OutboxItem } from "../types/crm";

export interface CrmMessagesConfig {
    templates: MessageTemplate[];
    automations: AutomationRule[];
    outbox: OutboxItem[];
}

interface ChartConfigCrmResponse {
    crmTemplatesJson?: string;
    crmAutomationsJson?: string;
    crmOutboxJson?: string;
    CrmTemplatesJson?: string;
    CrmAutomationsJson?: string;
    CrmOutboxJson?: string;
}

const EMPTY_CONFIG: CrmMessagesConfig = {
    templates: [],
    automations: [],
    outbox: [],
};

function parseJsonArray<T>(raw: unknown): T[] {
    if (!raw || typeof raw !== "string") return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function parseConfig(data: ChartConfigCrmResponse | null | undefined): CrmMessagesConfig {
    if (!data) return { ...EMPTY_CONFIG };
    return {
        templates: parseJsonArray<MessageTemplate>(data.crmTemplatesJson ?? data.CrmTemplatesJson),
        automations: parseJsonArray<AutomationRule>(data.crmAutomationsJson ?? data.CrmAutomationsJson),
        outbox: parseJsonArray<OutboxItem>(data.crmOutboxJson ?? data.CrmOutboxJson),
    };
}

export const crmMessagesConfigService = {
    async get(branchId: string): Promise<CrmMessagesConfig> {
        const response = await apiClient.get<ChartConfigCrmResponse | null>(`/chart-config?branchId=${branchId}`);
        return parseConfig(response.data);
    },

    async update(
        branchId: string,
        patch: Partial<CrmMessagesConfig>
    ): Promise<CrmMessagesConfig> {
        const payload: Record<string, string> = {};
        if (patch.templates !== undefined) payload.crmTemplatesJson = JSON.stringify(patch.templates);
        if (patch.automations !== undefined) payload.crmAutomationsJson = JSON.stringify(patch.automations);
        if (patch.outbox !== undefined) payload.crmOutboxJson = JSON.stringify(patch.outbox);

        const response = await apiClient.post<ChartConfigCrmResponse>(`/chart-config?branchId=${branchId}`, payload);
        return parseConfig(response.data);
    },
};


import apiClient from './apiClient';
import type { ChartConfigSettings } from '../types/settings';

export interface ChartConfigResponse {
    id?: number;
    branchId: string;
    waitListsJson?: string;
    visitPurposesJson?: string;
    statusesJson?: string;
    statusRulesJson?: string;
    memoSectionsJson?: string;
    noteSectionsJson?: string;
    NoteSectionsJson?: string;
    couponsJson?: string;
    patientTagsJson?: string;
    ticketsJson?: string;
    phrasesJson?: string;
    formsJson?: string;
    integrationsJson?: string;
    updatedAt?: string;
}

function buildChartConfigUrl(branchId?: string): string {
    const raw = String(branchId || "").trim();
    const numericBranchId = Number(raw);
    if (Number.isFinite(numericBranchId) && numericBranchId > 0) {
        return `/chart-config?branchId=${numericBranchId}`;
    }
    return "/chart-config";
}

function parseConfigJson(source: any, camelKey: string, pascalKey: string, defaultVal: any) {
    const raw = source?.[camelKey] ?? source?.[pascalKey];
    if (!raw) return defaultVal;
    return JSON.parse(raw);
}

export const chartConfigService = {
    async get(branchId: string): Promise<ChartConfigSettings | null> {
        const response = await apiClient.get<ChartConfigResponse | null>(buildChartConfigUrl(branchId));

        if (!response.data) {
            return null;
        }

        const data = response.data as any;
        const memoSectionsRaw =
            data.memoSectionsJson ||
            data.MemoSectionsJson ||
            data.noteSectionsJson ||
            data.NoteSectionsJson;

        return {
            waitLists: parseConfigJson(data, 'waitListsJson', 'WaitListsJson', []),
            visitPurposes: parseConfigJson(data, 'visitPurposesJson', 'VisitPurposesJson', []),
            statuses: parseConfigJson(data, 'statusesJson', 'StatusesJson', []),
            statusRules: parseConfigJson(data, 'statusRulesJson', 'StatusRulesJson', undefined),
            memoSections: memoSectionsRaw ? JSON.parse(memoSectionsRaw) : [],
            coupons: parseConfigJson(data, 'couponsJson', 'CouponsJson', []),
            patientTags: parseConfigJson(data, 'patientTagsJson', 'PatientTagsJson', []),
            tickets: parseConfigJson(data, 'ticketsJson', 'TicketsJson', { items: [], presets: [] }),
            phrases: parseConfigJson(data, 'phrasesJson', 'PhrasesJson', { my: [], clinic: [] }),
            forms: parseConfigJson(data, 'formsJson', 'FormsJson', { templates: [] }),
            integrations: parseConfigJson(data, 'integrationsJson', 'IntegrationsJson', {
                crm: { enabled: true },
                nemonic: { enabled: false },
                devices: { markvu: false, metavu: false, evelab: false, janus: false },
                instagram: { enabled: false, accounts: [] },
                wechat: { enabled: false },
                line: { enabled: false },
            }),
            printConfig: parseConfigJson(data, 'printConfigJson', 'PrintConfigJson', []),
            staffRoleDept: parseConfigJson(data, 'staffRoleDeptJson', 'StaffRoleDeptJson', { counselor: [], doctor: [] }),
        };
    },

    async update(branchId: string, config: Partial<ChartConfigSettings>): Promise<ChartConfigSettings> {
        const request: Record<string, string | null> = {};

        if (config.waitLists !== undefined) request.waitListsJson = JSON.stringify(config.waitLists);
        if (config.visitPurposes !== undefined) request.visitPurposesJson = JSON.stringify(config.visitPurposes);
        if (config.statuses !== undefined) request.statusesJson = JSON.stringify(config.statuses);
        if (config.statusRules !== undefined) request.statusRulesJson = JSON.stringify(config.statusRules);
        if (config.memoSections !== undefined) request.memoSectionsJson = JSON.stringify(config.memoSections);
        if (config.coupons !== undefined) request.couponsJson = JSON.stringify(config.coupons);
        if (config.patientTags !== undefined) request.patientTagsJson = JSON.stringify(config.patientTags);
        if (config.tickets !== undefined) request.ticketsJson = JSON.stringify(config.tickets);
        if (config.phrases !== undefined) request.phrasesJson = JSON.stringify(config.phrases);
        if (config.forms !== undefined) request.formsJson = JSON.stringify(config.forms);
        if (config.integrations !== undefined) request.integrationsJson = JSON.stringify(config.integrations);
        if ((config as any).printConfig !== undefined) request.printConfigJson = JSON.stringify((config as any).printConfig);
        if ((config as any).staffRoleDept !== undefined) request.staffRoleDeptJson = JSON.stringify((config as any).staffRoleDept);

        const response = await apiClient.post<ChartConfigResponse>(buildChartConfigUrl(branchId), request);

        const d = response.data as any;

        const parse = (camelKey: string, pascalKey: string, defaultVal: any) => {
            const json = d[camelKey] || d[pascalKey];
            return json ? JSON.parse(json) : defaultVal;
        };

        return {
            waitLists: parse('waitListsJson', 'WaitListsJson', []),
            visitPurposes: parse('visitPurposesJson', 'VisitPurposesJson', []),
            statuses: parse('statusesJson', 'StatusesJson', []),
            statusRules: parse('statusRulesJson', 'StatusRulesJson', undefined),
            memoSections: d.memoSectionsJson
                ? JSON.parse(d.memoSectionsJson)
                : (d.noteSectionsJson || d.NoteSectionsJson)
                    ? JSON.parse(d.noteSectionsJson || d.NoteSectionsJson)
                    : [],
            coupons: parse('couponsJson', 'CouponsJson', []),
            patientTags: parse('patientTagsJson', 'PatientTagsJson', []),
            tickets: parse('ticketsJson', 'TicketsJson', { items: [], presets: [] }),
            phrases: parse('phrasesJson', 'PhrasesJson', { my: [], clinic: [] }),
            forms: parse('formsJson', 'FormsJson', { templates: [] }),
            integrations: parse('integrationsJson', 'IntegrationsJson', {
                crm: { enabled: true },
                nemonic: { enabled: false },
                devices: { markvu: false, metavu: false, evelab: false, janus: false },
                instagram: { enabled: false, accounts: [] },
                wechat: { enabled: false },
                line: { enabled: false },
            }),
            printConfig: parse('printConfigJson', 'PrintConfigJson', []),
            staffRoleDept: parse('staffRoleDeptJson', 'StaffRoleDeptJson', { counselor: [], doctor: [] }),
        };
    }
};

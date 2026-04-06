import apiClient from './apiClient';
import type { IntegrationsConfig } from '../types/settings';

const DEFAULT_INTEGRATIONS: IntegrationsConfig = {
    crm: { enabled: true },
    nemonic: { enabled: false },
    devices: { markvu: false, metavu: false, evelab: false, janus: false },
    instagram: { enabled: false, accounts: [] },
    wechat: { enabled: false },
    line: { enabled: false },
};

export const externalInterfaceService = {
    async getIntegrations(branchId: string | number): Promise<IntegrationsConfig> {
        const id = Number(branchId);
        if (!Number.isFinite(id) || id <= 0) return DEFAULT_INTEGRATIONS;

        const response = await apiClient.get<{ integrationsJson?: string }>(
            `/settings/external-interface/bulk/${id}`
        );

        const raw = response.data?.integrationsJson;
        if (!raw) return DEFAULT_INTEGRATIONS;

        const parsed = JSON.parse(raw);
        return {
            crm: { ...DEFAULT_INTEGRATIONS.crm, ...parsed.crm },
            nemonic: { ...DEFAULT_INTEGRATIONS.nemonic, ...parsed.nemonic },
            devices: { ...DEFAULT_INTEGRATIONS.devices, ...parsed.devices },
            instagram: { ...DEFAULT_INTEGRATIONS.instagram, ...parsed.instagram },
            wechat: { ...DEFAULT_INTEGRATIONS.wechat, ...parsed.wechat },
            line: { ...DEFAULT_INTEGRATIONS.line, ...parsed.line },
        };
    },

    async saveIntegrations(branchId: string | number, config: IntegrationsConfig): Promise<void> {
        const id = Number(branchId);
        if (!Number.isFinite(id) || id <= 0) return;

        await apiClient.post(`/settings/external-interface/bulk/${id}`, {
            integrationsJson: JSON.stringify(config),
        });
    },
};

import { create } from "zustand";
import type { CrmMessagesState } from "../types/crm";

export const useCrmMessagesStore = create<CrmMessagesState>((set) => ({
    templates: [],
    automations: [],
    outbox: [],
    patientCommPrefs: {},

    addTemplate: (t) => set((s) => ({ templates: [...s.templates, t] })),
    setTemplates: (templates) => set({ templates: Array.isArray(templates) ? templates : [] }),
    updateTemplate: (id, patch) => set((s) => ({
        templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t))
    })),
    deleteTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

    addAutomation: (a) => set((s) => ({ automations: [...s.automations, a] })),
    setAutomations: (automations) => set({ automations: Array.isArray(automations) ? automations : [] }),
    updateAutomation: (id, patch) => set((s) => ({
        automations: s.automations.map((a) => (a.id === id ? { ...a, ...patch } : a))
    })),
    deleteAutomation: (id) => set((s) => ({ automations: s.automations.filter((a) => a.id !== id) })),

    addOutboxItem: (item) => set((s) => ({ outbox: [item, ...s.outbox] })),
    setOutbox: (outbox) => set({ outbox: Array.isArray(outbox) ? outbox : [] }),
    updateOutboxItem: (id, patch) => set((s) => ({
        outbox: s.outbox.map((o) => (o.id === id ? { ...o, ...patch } : o))
    })),

    setPatientPref: (pid, pref) => set((s) => {
        const existing = s.patientCommPrefs[pid] || {
            patientId: pid,
            optOutAll: false,
            optOutSms: false,
            optOutKakao: false,
            updatedAt: new Date().toISOString()
        };
        return {
            patientCommPrefs: {
                ...s.patientCommPrefs,
                [pid]: { ...existing, ...pref, updatedAt: new Date().toISOString() }
            }
        };
    }),
}));

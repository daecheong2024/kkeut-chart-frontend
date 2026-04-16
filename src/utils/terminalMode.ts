import { useSettingsStore } from "../stores/useSettingsStore";

export type TerminalMode = "kis" | "manual" | "nice";

export function getTerminalMode(): TerminalMode {
    const mode = (useSettingsStore.getState().settings as any)?.hospital?.terminalMode;
    if (mode === "manual" || mode === "nice") return mode;
    return "kis";
}

export function isManualPaymentMode(): boolean {
    const mode = getTerminalMode();
    return mode !== "kis";
}

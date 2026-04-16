export interface PrintSection {
    label: string;
    content: string;
}

export interface ChartPrintData {
    header?: string;
    patientName?: string;
    chartNo?: string;
    birthDate?: string;
    gender?: string;
    phone?: string;
    visitDate?: string;
    doctor?: string;
    sections?: PrintSection[];
    footer?: string;
}

export interface ReceiptItem {
    name: string;
    qty: number;
    price: number;
}

export interface ReceiptPrintData {
    shopName?: string;
    title?: string;
    patientName?: string;
    items?: ReceiptItem[];
    total: number;
    paymentMethod?: string;
    cardApprovalNo?: string;
    issuedAt?: string;
    footer?: string;
}

interface AgentHealth {
    status: string;
    version: string;
    defaultPrinter?: string;
    installedPrinters?: string[];
    port: number;
}

export interface PrintAgentStatus {
    agentAvailable: boolean;
    agentVersion?: string;
    port?: number;
    defaultPrinter?: string;
    installedPrinters: string[];
    bixolonInstalled: boolean;
    bixolonIsDefault: boolean;
}

export const PRINT_AGENT_DOWNLOAD_URL =
    (import.meta as any).env?.VITE_PRINT_AGENT_DOWNLOAD_URL || "/downloads/KkeutPrintAgent_Setup_v1.0.0.exe";
export const BIXOLON_DRIVER_URL =
    (import.meta as any).env?.VITE_BIXOLON_DRIVER_URL || "https://kr.bixolon.com/support.php?kind=download";
const BIXOLON_NAME_KEYWORDS = ["BIXOLON", "SRP-350", "SRP350"];

const AGENT_CANDIDATE_PORTS = [9100, 9101, 9102];
const AGENT_PROBE_TIMEOUT_MS = 800;
const AGENT_CACHE_TTL_MS = 30_000;

let cachedAgent: { port: number; defaultPrinter?: string; expiresAt: number } | null = null;
let fallbackNotifiedAt = 0;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function probeAgent(): Promise<AgentHealth | null> {
    for (const port of AGENT_CANDIDATE_PORTS) {
        try {
            const res = await fetchWithTimeout(`http://localhost:${port}/health`, { method: "GET" }, AGENT_PROBE_TIMEOUT_MS);
            if (!res.ok) continue;
            const json = (await res.json()) as AgentHealth;
            if (json?.status === "ok") return json;
        } catch {
            // continue probing
        }
    }
    return null;
}

export async function isPrintAgentAvailable(forceRefresh = false): Promise<boolean> {
    const now = Date.now();
    if (!forceRefresh && cachedAgent && cachedAgent.expiresAt > now) return true;

    const health = await probeAgent();
    if (!health) {
        cachedAgent = null;
        return false;
    }
    cachedAgent = {
        port: health.port,
        defaultPrinter: health.defaultPrinter,
        expiresAt: now + AGENT_CACHE_TTL_MS,
    };
    return true;
}

async function postPrint(body: unknown): Promise<{ success: boolean; error?: string }> {
    if (!cachedAgent) {
        const ok = await isPrintAgentAvailable(true);
        if (!ok) return { success: false, error: "agent-unavailable" };
    }
    const port = cachedAgent!.port;
    try {
        const res = await fetchWithTimeout(
            `http://localhost:${port}/print`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
            15_000,
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.success !== true) {
            return { success: false, error: json?.error || `HTTP ${res.status}` };
        }
        return { success: true };
    } catch (e) {
        cachedAgent = null;
        return { success: false, error: (e as Error).message };
    }
}

function showFallbackToast(message: string) {
    if (typeof document === "undefined") return;
    const now = Date.now();
    if (now - fallbackNotifiedAt < 4000) return;
    fallbackNotifiedAt = now;

    const el = document.createElement("div");
    el.setAttribute("role", "status");
    el.textContent = message;
    el.style.cssText = [
        "position:fixed",
        "right:20px",
        "bottom:20px",
        "padding:10px 14px",
        "background:rgba(0,0,0,0.82)",
        "color:#fff",
        "border-radius:6px",
        "font-size:13px",
        "z-index:99999",
        "box-shadow:0 4px 12px rgba(0,0,0,0.2)",
        "max-width:320px",
    ].join(";");
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.transition = "opacity 400ms";
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 500);
    }, 3200);
}

function browserPrintSections(sections: PrintSection[], header?: string): void {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
        return;
    }

    const escape = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const headerHtml = header
        ? `<div style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #999;white-space:pre-wrap">${escape(header)}</div>`
        : '';

    const body = sections
        .map((s) => `<pre style="margin:0 0 14px 0;white-space:pre-wrap;font-family:inherit">${escape(s.content)}</pre>`)
        .join('');

    printWindow.document.write(`
        <html>
        <head>
            <title>차트 인쇄</title>
            <style>
                @page { size: 80mm auto; margin: 2mm 3mm; }
                body { margin: 0; padding: 2mm; font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; font-size: 9pt; line-height: 1.4; word-break: break-all; }
                pre { margin: 0 0 3mm 0; white-space: pre-wrap; font-family: inherit; font-size: 9pt; }
            </style>
        </head>
        <body>${headerHtml}${body}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
}

async function getPrintAgentStatus(): Promise<PrintAgentStatus> {
    const health = await probeAgent();
    if (!health) {
        return {
            agentAvailable: false,
            installedPrinters: [],
            bixolonInstalled: false,
            bixolonIsDefault: false,
        };
    }
    const installed = health.installedPrinters ?? [];
    const matchBixolon = (name: string) =>
        BIXOLON_NAME_KEYWORDS.some((kw) => name.toUpperCase().includes(kw));
    cachedAgent = {
        port: health.port,
        defaultPrinter: health.defaultPrinter,
        expiresAt: Date.now() + AGENT_CACHE_TTL_MS,
    };
    return {
        agentAvailable: true,
        agentVersion: health.version,
        port: health.port,
        defaultPrinter: health.defaultPrinter,
        installedPrinters: installed,
        bixolonInstalled: installed.some(matchBixolon),
        bixolonIsDefault: !!health.defaultPrinter && matchBixolon(health.defaultPrinter),
    };
}

export const printService = {
    isPrintAgentAvailable,
    getPrintAgentStatus,

    async printChartSections(sections: PrintSection[], header?: string): Promise<void> {
        const available = await isPrintAgentAvailable();
        if (available) {
            const result = await postPrint({
                type: "chart",
                data: { header, sections } satisfies ChartPrintData,
                copies: 1,
            });
            if (result.success) return;
            showFallbackToast(`인쇄 에이전트 오류: ${result.error ?? ""} → 브라우저 인쇄로 대체`);
        } else {
            showFallbackToast("인쇄 에이전트 미실행 → 브라우저 인쇄로 대체");
        }
        browserPrintSections(sections, header);
    },

    async printChart(data: ChartPrintData): Promise<{ usedAgent: boolean; error?: string }> {
        const available = await isPrintAgentAvailable();
        if (available) {
            const result = await postPrint({ type: "chart", data, copies: 1 });
            if (result.success) return { usedAgent: true };
            showFallbackToast(`인쇄 에이전트 오류: ${result.error ?? ""} → 브라우저 인쇄로 대체`);
        } else {
            showFallbackToast("인쇄 에이전트 미실행 → 브라우저 인쇄로 대체");
        }
        browserPrintSections(data.sections ?? [], data.header);
        return { usedAgent: false, error: "agent-unavailable" };
    },

    async printReceipt(data: ReceiptPrintData): Promise<{ usedAgent: boolean; error?: string }> {
        const available = await isPrintAgentAvailable();
        if (available) {
            const result = await postPrint({ type: "receipt", data, copies: 1 });
            if (result.success) return { usedAgent: true };
            showFallbackToast(`인쇄 에이전트 오류: ${result.error ?? ""} → 브라우저 인쇄로 대체`);
            return { usedAgent: false, error: result.error };
        }
        showFallbackToast("인쇄 에이전트 미실행 → 영수증은 브라우저 인쇄를 지원하지 않습니다.");
        return { usedAgent: false, error: "agent-unavailable" };
    },
};

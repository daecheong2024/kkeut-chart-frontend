const WS_URL = "ws://localhost:1516";

export interface TerminalPaymentRequest {
    tradeType: "D1" | "v1";
    amount: number;
    installment?: string;
    vatAmount?: number;
    svcAmount?: number;
    blockPin?: string;
    barCodeNumber?: string;
    merchantTel?: string;
}

export interface TerminalRefundRequest {
    tradeType: "D2" | "v2";
    amount: number;
    orgAuthDate: string;
    orgAuthNo: string;
    vanKey: string;
    installment?: string;
    blockPin?: string;
    merchantTel?: string;
}

export interface TerminalResult {
    success: boolean;
    replyCode: string;
    authNo: string;
    replyDate: string;
    cardNo: string;
    installment: string;
    tranAmt: string;
    vatAmt: string;
    svcAmt: string;
    accepterCode: string;
    accepterName: string;
    issuerCode: string;
    issuerName: string;
    tranNo: string;
    merchantRegNo: string;
    vanKey: string;
    catId: string;
    displayMsg: string;
    rawResponse: Record<string, string>;
}

type ResolveReject = {
    resolve: (result: TerminalResult) => void;
    reject: (error: Error) => void;
};

let ws: WebSocket | null = null;
let pending: ResolveReject | null = null;

function parseResponse(data: string): TerminalResult {
    const json = JSON.parse(data);
    const r = json?.KIS_ICApprovalResult || json || {};
    const replyCode = String(r.outReplyCode || "").trim();
    return {
        success: replyCode === "0000",
        replyCode,
        authNo: String(r.outAuthNo || "").trim(),
        replyDate: String(r.outReplyDate || "").trim(),
        cardNo: String(r.outCardNo || "").trim(),
        installment: String(r.outInstallment || "").trim(),
        tranAmt: String(r.outTranAmt || "").trim(),
        vatAmt: String(r.outVatAmt || "").trim(),
        svcAmt: String(r.outSvcAmt || "").trim(),
        accepterCode: String(r.outAccepterCode || "").trim(),
        accepterName: String(r.outAccepterName || "").trim(),
        issuerCode: String(r.outIssuerCode || "").trim(),
        issuerName: String(r.outIssuerName || "").trim(),
        tranNo: String(r.outTranNo || "").trim(),
        merchantRegNo: String(r.outMerchantRegNo || "").trim(),
        vanKey: (() => {
            const msg4 = String(r.outReplyMsg4 || "").trim();
            const vanKeyMatch = msg4.match(/VANKEY[:\s]*(\d+)/i);
            if (vanKeyMatch?.[1]) return vanKeyMatch[1];
            const msg1 = String(r.outReplyMsg1 || "").trim();
            if (/^\d+$/.test(msg1)) return msg1;
            return String(r.outAddInfo || "").trim();
        })(),
        catId: String(r.outCatId || "").trim(),
        displayMsg: String(r.outDisplayMsg || r.outDisplayMsg2 || "").trim(),
        rawResponse: r,
    };
}

function ensureConnection(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            resolve(ws);
            return;
        }
        try {
            ws = new WebSocket(WS_URL);
            ws.onopen = () => resolve(ws!);
            ws.onerror = () => reject(new Error("KIS 단말기 연결 실패"));
            ws.onclose = () => { ws = null; };
            ws.onmessage = (event) => {
                if (!pending) return;
                try {
                    const result = parseResponse(String(event.data));
                    pending.resolve(result);
                } catch (e) {
                    pending.reject(new Error("응답 파싱 실패"));
                } finally {
                    pending = null;
                }
            };
        } catch {
            reject(new Error("WebSocket 생성 실패"));
        }
    });
}

let onSendLog: ((json: string) => void) | null = null;

function sendRequest(payload: Record<string, unknown>): Promise<TerminalResult> {
    return new Promise(async (resolve, reject) => {
        try {
            const socket = await ensureConnection();
            if (pending) {
                reject(new Error("이전 거래가 진행 중입니다."));
                return;
            }
            pending = { resolve, reject };
            const json = JSON.stringify(payload);
            onSendLog?.(json);
            socket.send(json);

            setTimeout(() => {
                if (pending) {
                    pending.reject(new Error("단말기 응답 시간 초과 (120초)"));
                    pending = null;
                }
            }, 120000);
        } catch (e) {
            reject(e);
        }
    });
}

export const kisTerminalService = {
    setSendLogger(fn: ((json: string) => void) | null) {
        onSendLog = fn;
    },

    isConnected(): boolean {
        return ws !== null && ws.readyState === WebSocket.OPEN;
    },

    async connect(): Promise<boolean> {
        try {
            await ensureConnection();
            return true;
        } catch {
            return false;
        }
    },

    disconnect() {
        if (ws) {
            ws.close();
            ws = null;
        }
        pending = null;
    },

    async requestPayment(params: TerminalPaymentRequest): Promise<TerminalResult> {
        return sendRequest({
            KIS_ICApproval: {
                inTranCode: "UC",
                inTradeType: params.tradeType,
                inCatId: "",
                inTranGubun: "",
                inBarCodeNumber: params.barCodeNumber || "",
                inInstallment: params.installment || "00",
                inTranAmt: String(params.amount),
                inVatAmt: params.vatAmount != null ? String(params.vatAmount) : "",
                inSvcAmt: params.svcAmount != null ? String(params.svcAmount) : "",
                inOrgAuthDate: "",
                inOrgAuthNo: "",
                inCatTranGubun: "",
                inTranNo: "",
                inBlockPin: params.blockPin || "",
                inBusinessNo: "",
                inOwnerNm: "",
                inMerchantNm: "",
                inMerchantAddress: "",
                inMerchantTel: params.merchantTel || "",
                inPrintYN: "Y",
            },
        });
    },

    async requestRefund(params: TerminalRefundRequest): Promise<TerminalResult> {
        return sendRequest({
            KIS_ICApproval: {
                inTranCode: "UC",
                inTradeType: params.tradeType,
                inCatId: "",
                inTranGubun: "",
                inBarCodeNumber: "",
                inInstallment: params.installment || "00",
                inTranAmt: String(params.amount),
                inVatAmt: "",
                inSvcAmt: "",
                inOrgAuthDate: params.orgAuthDate,
                inOrgAuthNo: params.orgAuthNo,
                inCatTranGubun: "1",
                inTranNo: "",
                inBlockPin: params.blockPin || "",
                inBusinessNo: "",
                inOwnerNm: "",
                inMerchantNm: params.vanKey,
                inMerchantAddress: "",
                inMerchantTel: params.merchantTel || "",
                inPrintYN: "Y",
            },
        });
    },

    cancelTransaction() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ KIS_Agent_Stop: {} }));
        }
        if (pending) {
            pending.reject(new Error("거래가 취소되었습니다."));
            pending = null;
        }
    },
};

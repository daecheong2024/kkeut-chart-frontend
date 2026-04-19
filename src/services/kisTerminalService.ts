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

export interface TerminalCashReceiptIssueRequest {
    amount: number;
    vatAmount?: number;
    svcAmount?: number;
    purpose: "consumer" | "business" | "voluntary";
    identifierType: "phone" | "business_no" | "self_issued";
    identifierValue?: string;
    merchantTel?: string;
}

export interface TerminalCashReceiptCancelRequest {
    amount: number;
    purpose?: "consumer" | "business" | "voluntary";
    orgAuthDate: string;
    orgAuthNo: string;
    cancelReasonCode?: string;
    addInfo?: string;
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
    addInfo: string;
    replyMsg1: string;
    replyMsg2: string;
    replyMsg3: string;
    replyMsg4: string;
    rawResponse: Record<string, string>;
}

type ResolveReject = {
    resolve: (result: TerminalResult) => void;
    reject: (error: Error) => void;
};

let ws: WebSocket | null = null;
let pending: ResolveReject | null = null;
let pendingRequestId = 0;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

function clearPendingTimeout() {
    if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
    }
}

function finishPending() {
    clearPendingTimeout();
    pending = null;
}

function rejectPending(error: Error) {
    if (!pending) return;
    const currentPending = pending;
    finishPending();
    currentPending.reject(error);
}

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
        addInfo: String(r.outAddInfo || "").trim(),
        replyMsg1: String(r.outReplyMsg1 || "").trim(),
        replyMsg2: String(r.outReplyMsg2 || "").trim(),
        replyMsg3: String(r.outReplyMsg3 || "").trim(),
        replyMsg4: String(r.outReplyMsg4 || "").trim(),
        rawResponse: r,
    };
}

const CONNECT_TIMEOUT_MS = 3000;
const RESPONSE_TIMEOUT_MS = 120000;
const CASH_RECEIPT_BUSINESS_CODE = ((import.meta as any).env?.VITE_KIS_CASH_RECEIPT_BUSINESS_CODE as string | undefined)?.trim() || "01";
const CASH_RECEIPT_PERSONAL_CODE = ((import.meta as any).env?.VITE_KIS_CASH_RECEIPT_PERSONAL_CODE as string | undefined)?.trim() || "02";
const CASH_RECEIPT_SELF_ISSUED_ID = ((import.meta as any).env?.VITE_KIS_CASH_RECEIPT_SELF_ISSUED_ID as string | undefined)?.trim() || "0100001234";

function resolveCashReceiptKindCode(purpose: "consumer" | "business" | "voluntary"): string {
    if (purpose === "business") return CASH_RECEIPT_BUSINESS_CODE;
    return CASH_RECEIPT_PERSONAL_CODE;
}

function normalizeCashReceiptIdentifier(
    params: Pick<TerminalCashReceiptIssueRequest, "identifierType" | "identifierValue">
): string {
    if (params.identifierType === "self_issued") {
        return CASH_RECEIPT_SELF_ISSUED_ID;
    }

    return String(params.identifierValue || "").replace(/\D/g, "").trim();
}

function ensureConnection(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            resolve(ws);
            return;
        }

        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        try {
            const socket = new WebSocket(WS_URL);
            ws = socket;

            timer = setTimeout(() => {
                if (settled) return;

                settled = true;
                try {
                    socket.close();
                } catch {
                    // noop
                }
                ws = null;
                reject(new Error(`KIS 단말기 연결 시간 초과 (${CONNECT_TIMEOUT_MS}ms). 단말기 에이전트가 실행 중인지 확인해 주세요.`));
            }, CONNECT_TIMEOUT_MS);

            socket.onopen = () => {
                if (settled) return;

                settled = true;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                resolve(socket);
            };

            socket.onerror = () => {
                if (settled) return;

                settled = true;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                ws = null;
                reject(new Error("KIS 단말기 연결 실패. 단말기 에이전트(localhost:1516)가 실행 중인지 확인해 주세요."));
            };

            socket.onclose = () => {
                ws = null;
                rejectPending(new Error("단말기 연결이 종료되었습니다."));
            };

            socket.onmessage = (event) => {
                if (!pending) return;

                const currentPending = pending;
                try {
                    const result = parseResponse(String(event.data));
                    finishPending();
                    currentPending.resolve(result);
                } catch {
                    rejectPending(new Error("단말기 응답 해석에 실패했습니다."));
                }
            };
        } catch (e: any) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            ws = null;
            reject(new Error(`WebSocket 생성 실패: ${e?.message || "알 수 없는 오류"}`));
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

            clearPendingTimeout();
            const requestId = ++pendingRequestId;
            pending = { resolve, reject };

            const json = JSON.stringify(payload);
            onSendLog?.(json);
            socket.send(json);

            pendingTimeout = setTimeout(() => {
                if (!pending || pendingRequestId !== requestId) {
                    return;
                }

                rejectPending(new Error("단말기 응답 시간 초과 (120초)"));
            }, RESPONSE_TIMEOUT_MS);
        } catch (e) {
            finishPending();
            reject(e instanceof Error ? e : new Error("단말기 요청 전송에 실패했습니다."));
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
        finishPending();
    },

    async requestPayment(params: TerminalPaymentRequest): Promise<TerminalResult> {
        const result = await sendRequest({
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

        if (result.success && result.catId) {
            try {
                localStorage.setItem("kis_current_cat_id", result.catId);
            } catch {
                // noop
            }
        }

        return result;
    },

    getCurrentCatId(): string | null {
        try {
            return localStorage.getItem("kis_current_cat_id");
        } catch {
            return null;
        }
    },

    async requestRefund(params: TerminalRefundRequest): Promise<TerminalResult> {
        const orgAuthDate6 = (params.orgAuthDate || "").replace(/\D/g, "").substring(0, 6);
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
                inOrgAuthDate: orgAuthDate6,
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

    async requestCashReceiptIssue(params: TerminalCashReceiptIssueRequest): Promise<TerminalResult> {
        const identifierValue = normalizeCashReceiptIdentifier(params);
        if (!identifierValue) {
            throw new Error("현금영수증 식별값이 필요합니다.");
        }

        const result = await sendRequest({
            KIS_ICApproval: {
                inTranCode: "UC",
                inTradeType: "CC",
                inCatId: "",
                inTranGubun: "",
                inBarCodeNumber: identifierValue,
                // POS-KIS 샘플 기준: 현금영수증 개인/법인 코드는 installment 위치에 전달된다.
                inInstallment: resolveCashReceiptKindCode(params.purpose),
                inTranAmt: String(params.amount),
                inVatAmt: params.vatAmount != null ? String(params.vatAmount) : "",
                inSvcAmt: params.svcAmount != null ? String(params.svcAmount) : "",
                inOrgAuthDate: "",
                inOrgAuthNo: "",
                inCatTranGubun: "",
                inTranNo: "",
                inBlockPin: "",
                inBusinessNo: "",
                inOwnerNm: "",
                inMerchantNm: "",
                inMerchantAddress: "",
                inMerchantTel: params.merchantTel || "",
                inPrintYN: "Y",
            },
        });

        if (result.success && result.catId) {
            try {
                localStorage.setItem("kis_current_cat_id", result.catId);
            } catch {
                // noop
            }
        }

        return result;
    },

    async requestCashReceiptCancel(params: TerminalCashReceiptCancelRequest): Promise<TerminalResult> {
        const orgAuthDate6 = (params.orgAuthDate || "").replace(/\D/g, "").substring(0, 6);
        return sendRequest({
            KIS_ICApproval: {
                inTranCode: "UC",
                inTradeType: "CR",
                inCatId: "",
                inTranGubun: "",
                inBarCodeNumber: "",
                inInstallment: resolveCashReceiptKindCode(params.purpose || "consumer"),
                inTranAmt: String(params.amount),
                inVatAmt: "",
                inSvcAmt: "",
                inOrgAuthDate: orgAuthDate6,
                inOrgAuthNo: params.orgAuthNo,
                inCatTranGubun: params.cancelReasonCode || "1",
                inTranNo: "",
                inBlockPin: "",
                inBusinessNo: "",
                inOwnerNm: "",
                inMerchantNm: "",
                inMerchantAddress: "",
                inMerchantTel: params.merchantTel || "",
                inAddInfo: params.addInfo || "",
                inPrintYN: "Y",
            },
        });
    },

    cancelTransaction() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ KIS_Agent_Stop: {} }));
        }
        rejectPending(new Error("거래가 취소되었습니다."));
    },
};

import React, { useState, useRef, useMemo } from "react";
import { kisTerminalService, TerminalResult } from "../../services/kisTerminalService";
import { useSettingsStore } from "../../stores/useSettingsStore";

export default function TerminalTestPage() {
    const { settings } = useSettingsStore();
    const merchantTel = useMemo(() => {
        const name = settings.hospital?.hospitalNameKo || "";
        const tel = settings.hospital?.phone || "";
        return name && tel ? `${name}(${tel})` : name || tel || "";
    }, [settings.hospital]);
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<{ time: string; type: string; data: string }[]>([]);
    const [payAmount, setPayAmount] = useState("1004");
    const [payInstallment, setPayInstallment] = useState("00");
    const [payTradeType, setPayTradeType] = useState<"D1" | "v1">("D1");
    const [refundOrgAuthNo, setRefundOrgAuthNo] = useState("");
    const [refundOrgAuthDate, setRefundOrgAuthDate] = useState("");
    const [refundVanKey, setRefundVanKey] = useState("");
    const [refundAmount, setRefundAmount] = useState("");
    const [refundTradeType, setRefundTradeType] = useState<"D2" | "v2">("D2");
    const logEndRef = useRef<HTMLDivElement>(null);

    const addLog = (type: string, data: string) => {
        const time = new Date().toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLogs((prev) => [...prev, { time, type, data }]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

    const handleConnect = async () => {
        setLoading(true);
        kisTerminalService.setSendLogger((json) => addLog("SEND", json));
        const ok = await kisTerminalService.connect();
        setConnected(ok);
        addLog(ok ? "OK" : "ERR", ok ? "KIS Agent 연결 성공 (ws://localhost:1516)" : "KIS Agent 연결 실패");
        setLoading(false);
    };

    const handleDisconnect = () => {
        kisTerminalService.disconnect();
        setConnected(false);
        addLog("INFO", "연결 해제됨");
    };

    const handlePayment = async () => {
        if (!connected) { addLog("ERR", "단말기 미연결"); return; }
        const amt = Number(payAmount);
        if (!amt || amt <= 0) { addLog("ERR", "금액을 입력하세요"); return; }
        setLoading(true);
        addLog("REQ", JSON.stringify({ tradeType: payTradeType, amount: amt, installment: payInstallment }, null, 2));
        try {
            const result = await kisTerminalService.requestPayment({ tradeType: payTradeType, amount: amt, installment: payInstallment, merchantTel });
            addLog(result.success ? "OK" : "ERR", JSON.stringify(result, null, 2));
            if (result.success) {
                setRefundOrgAuthNo(result.authNo);
                setRefundOrgAuthDate(result.replyDate.substring(0, 6));
                setRefundVanKey(result.vanKey);
                setRefundAmount(String(amt));
            }
        } catch (e: any) {
            addLog("ERR", e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRefund = async () => {
        if (!connected) { addLog("ERR", "단말기 미연결"); return; }
        if (!refundOrgAuthNo || !refundOrgAuthDate || !refundVanKey) { addLog("ERR", "원승인 정보를 입력하세요"); return; }
        const amt = Number(refundAmount);
        if (!amt || amt <= 0) { addLog("ERR", "환불 금액을 입력하세요"); return; }
        setLoading(true);
        addLog("REQ", JSON.stringify({ tradeType: refundTradeType, amount: amt, orgAuthDate: refundOrgAuthDate, orgAuthNo: refundOrgAuthNo, vanKey: refundVanKey }, null, 2));
        try {
            const result = await kisTerminalService.requestRefund({ tradeType: refundTradeType, amount: amt, orgAuthDate: refundOrgAuthDate, orgAuthNo: refundOrgAuthNo, vanKey: refundVanKey, merchantTel });
            addLog(result.success ? "OK" : "ERR", JSON.stringify(result, null, 2));
        } catch (e: any) {
            addLog("ERR", e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        kisTerminalService.cancelTransaction();
        addLog("INFO", "거래 취소 요청");
        setLoading(false);
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-[#1A237E]">KIS 단말기 테스트</h1>
                    <p className="text-sm text-[#616161] mt-1">WebSocket 통신 테스트 (admin 전용)</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-400"}`} />
                    <span className="text-sm font-medium text-[#242424]">{connected ? "연결됨" : "미연결"}</span>
                    {!connected ? (
                        <button onClick={handleConnect} disabled={loading} className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#303F9F] disabled:opacity-50 transition-all">
                            연결
                        </button>
                    ) : (
                        <button onClick={handleDisconnect} className="rounded-lg border border-[#C5CAE9] bg-white px-4 py-2 text-sm font-medium text-[#616161] hover:bg-[#E8EAF6] transition-all">
                            연결 해제
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#C5CAE9] overflow-hidden">
                    <div className="px-4 py-3 bg-[#F8F9FD] border-b border-[#C5CAE9]">
                        <div className="text-[14px] font-semibold text-[#1A237E]">결제 테스트</div>
                    </div>
                    <div className="p-4 space-y-3">
                        <div>
                            <label className="text-[12px] font-medium text-[#616161]">거래유형</label>
                            <select value={payTradeType} onChange={(e) => setPayTradeType(e.target.value as "D1" | "v1")}
                                className="w-full mt-1 rounded-lg border border-[#C5CAE9] px-3 py-2 text-[13px]">
                                <option value="D1">D1 - 신용카드 승인</option>
                                <option value="v1">v1 - 간편결제 승인</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[12px] font-medium text-[#616161]">결제 금액</label>
                            <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                                className="w-full mt-1 rounded-lg border border-[#C5CAE9] px-3 py-2 text-[13px]" />
                        </div>
                        <div>
                            <label className="text-[12px] font-medium text-[#616161]">할부 (00=일시불)</label>
                            <input value={payInstallment} onChange={(e) => setPayInstallment(e.target.value)}
                                className="w-full mt-1 rounded-lg border border-[#C5CAE9] px-3 py-2 text-[13px]" />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={handlePayment} disabled={loading || !connected}
                                className="flex-1 rounded-lg bg-[#3F51B5] py-2.5 text-sm font-medium text-white hover:bg-[#303F9F] disabled:opacity-50 transition-all">
                                {loading ? "대기 중..." : "결제 요청"}
                            </button>
                            {loading && (
                                <button onClick={handleCancel} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-all">
                                    취소
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-[#C5CAE9] overflow-hidden">
                    <div className="px-4 py-3 bg-[#F8F9FD] border-b border-[#C5CAE9]">
                        <div className="text-[14px] font-semibold text-[#1A237E]">환불 테스트</div>
                    </div>
                    <div className="p-4 space-y-3">
                        <div>
                            <label className="text-[12px] font-medium text-[#616161]">거래유형</label>
                            <select value={refundTradeType} onChange={(e) => setRefundTradeType(e.target.value as "D2" | "v2")}
                                className="w-full mt-1 rounded-lg border border-[#C5CAE9] px-3 py-2 text-[13px]">
                                <option value="D2">D2 - 신용카드 취소</option>
                                <option value="v2">v2 - 간편결제 취소</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[12px] font-medium text-[#616161]">원승인번호</label>
                            <input value={refundOrgAuthNo} onChange={(e) => setRefundOrgAuthNo(e.target.value)}
                                className="w-full mt-1 rounded-lg border border-[#C5CAE9] px-3 py-2 text-[13px]" placeholder="결제 성공 시 자동 입력" />
                        </div>
                        <div>
                            <label className="text-[12px] font-medium text-[#616161]">원승인일자 (YYMMDD)</label>
                            <input value={refundOrgAuthDate} onChange={(e) => setRefundOrgAuthDate(e.target.value)}
                                className="w-full mt-1 rounded-lg border border-[#C5CAE9] px-3 py-2 text-[13px]" placeholder="결제 성공 시 자동 입력" />
                        </div>
                        <div>
                            <label className="text-[12px] font-medium text-[#616161]">VANKEY</label>
                            <input value={refundVanKey} onChange={(e) => setRefundVanKey(e.target.value)}
                                className="w-full mt-1 rounded-lg border border-[#C5CAE9] px-3 py-2 text-[13px]" placeholder="결제 성공 시 자동 입력" />
                        </div>
                        <div>
                            <label className="text-[12px] font-medium text-[#616161]">환불 금액</label>
                            <input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}
                                className="w-full mt-1 rounded-lg border border-[#C5CAE9] px-3 py-2 text-[13px]" />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={handleRefund} disabled={loading || !connected}
                                className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-all">
                                {loading ? "대기 중..." : "환불 요청"}
                            </button>
                            {loading && (
                                <button onClick={handleCancel} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-all">
                                    취소
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-[#C5CAE9] overflow-hidden">
                <div className="px-4 py-3 bg-[#F8F9FD] border-b border-[#C5CAE9] flex items-center justify-between">
                    <div className="text-[14px] font-semibold text-[#1A237E]">통신 로그</div>
                    <button onClick={() => setLogs([])} className="text-[11px] text-[#616161] hover:text-[#3F51B5]">초기화</button>
                </div>
                <div className="p-4 max-h-[400px] overflow-y-auto bg-[#1a1a2e] rounded-b-xl">
                    {logs.length === 0 && <div className="text-[12px] text-gray-500 text-center py-4">로그가 없습니다.</div>}
                    {logs.map((log, i) => (
                        <div key={i} className="text-[11px] font-mono leading-relaxed mb-1">
                            <span className="text-gray-500">[{log.time}]</span>{" "}
                            <span className={log.type === "OK" ? "text-green-400" : log.type === "ERR" ? "text-red-400" : log.type === "REQ" ? "text-blue-400" : "text-gray-400"}>
                                [{log.type}]
                            </span>{" "}
                            <span className="text-gray-300 whitespace-pre-wrap">{log.data}</span>
                        </div>
                    ))}
                    <div ref={logEndRef} />
                </div>
            </div>
        </div>
    );
}

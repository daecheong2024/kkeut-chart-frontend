import React, { useState, useRef, useMemo } from "react";
import { kisTerminalService } from "../../services/kisTerminalService";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { hospitalSettingsService } from "../../services/hospitalSettingsService";
import { TopBar } from "../../components/layout/TopBar";

const QUICK_AMOUNTS = [100, 1004, 5000, 10000, 50000];

type TerminalModeOption = "kis" | "manual" | "nice";

export default function TerminalTestPage() {
    const { settings, updateSettings } = useSettingsStore();
    const currentMode: TerminalModeOption = ((settings.hospital as any)?.terminalMode as TerminalModeOption) || "kis";
    const [savingMode, setSavingMode] = useState<TerminalModeOption | null>(null);
    const [modeMessage, setModeMessage] = useState<string>("");

    const handleModeChange = async (next: TerminalModeOption) => {
        if (next === currentMode || savingMode) return;
        const branchIdRaw = (settings.hospital as any)?.branchId
            || localStorage.getItem("kkeut_active_branch_id")
            || "";
        const branchId = String(branchIdRaw || "").trim();
        if (!branchId) {
            setModeMessage("지점 정보가 없어 저장할 수 없습니다.");
            return;
        }
        setSavingMode(next);
        setModeMessage("");
        try {
            const payload = { ...(settings.hospital as any || {}), branchId, terminalMode: next };
            await hospitalSettingsService.update(payload);
            updateSettings({ hospital: { ...(settings.hospital as any || {}), terminalMode: next } as any });
            setModeMessage(next === "kis" ? "KIS 단말기 연동 모드로 변경되었습니다." : next === "manual" ? "수기 결제 모드로 변경되었습니다." : "");
            setTimeout(() => setModeMessage(""), 3000);
        } catch (err: any) {
            setModeMessage(err?.response?.data?.message || "모드 변경에 실패했습니다.");
        } finally {
            setSavingMode(null);
        }
    };
    const merchantTel = useMemo(() => {
        const name = settings.hospital?.hospitalNameKo || "";
        const tel = settings.hospital?.phone || "";
        return name && tel ? `${name}(${tel})` : name || tel || "";
    }, [settings.hospital]);
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(false);
    const [verified, setVerified] = useState(() => localStorage.getItem("kkeut_terminal_verified") === "true");
    const [lastVerifiedAt, setLastVerifiedAt] = useState(() => localStorage.getItem("kkeut_terminal_verified_at") || "");
    const [logs, setLogs] = useState<{ time: string; type: string; summary: string; detail?: string }[]>([]);
    const [expandedLog, setExpandedLog] = useState<number | null>(null);
    const [payAmount, setPayAmount] = useState("1004");
    const [payInstallment, setPayInstallment] = useState("00");
    const [payTradeType, setPayTradeType] = useState<"D1" | "v1">("D1");
    const [refundOrgAuthNo, setRefundOrgAuthNo] = useState("");
    const [refundOrgAuthDate, setRefundOrgAuthDate] = useState("");
    const [refundVanKey, setRefundVanKey] = useState("");
    const [refundAmount, setRefundAmount] = useState("");
    const [refundTradeType, setRefundTradeType] = useState<"D2" | "v2">("D2");
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    const addLog = (type: string, summary: string, detail?: string) => {
        const time = new Date().toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLogs((prev) => [...prev, { time, type, summary, detail }]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

    const stripEmpty = (obj: any): any => {
        if (Array.isArray(obj)) return obj;
        if (obj && typeof obj === "object") {
            const out: any = {};
            for (const [k, v] of Object.entries(obj)) {
                if (v === "" || v === null || v === undefined) continue;
                out[k] = typeof v === "object" ? stripEmpty(v) : v;
            }
            return out;
        }
        return obj;
    };

    const formatResult = (result: any): { summary: string; detail: string } => {
        const cleaned = stripEmpty(result);
        if (result.success) {
            const parts = [`승인번호: ${result.authNo}`, `금액: ${Number(result.tranAmt).toLocaleString()}원`];
            if (result.cardNo) parts.push(`카드: ${result.cardNo}`);
            if (result.installment && result.installment !== "00") parts.push(`할부: ${result.installment}개월`);
            if (result.vanKey) parts.push(`VANKEY: ${result.vanKey}`);
            return { summary: parts.join(" / "), detail: JSON.stringify(cleaned, null, 2) };
        }
        const msg = result.rawResponse?.outReplyMsg1 || result.displayMsg || result.replyCode || "알 수 없는 오류";
        return { summary: `${msg} (${result.replyCode})`, detail: JSON.stringify(cleaned, null, 2) };
    };

    const handleConnect = async () => {
        setLoading(true);
        kisTerminalService.setSendLogger((json) => addLog("SEND", "단말기 전문 송신", json));
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
        addLog("REQ", `결제 요청: ${payTradeType === "D1" ? "신용카드" : "간편결제"} ${amt.toLocaleString()}원 ${payInstallment === "00" ? "일시불" : payInstallment + "개월"}`);
        try {
            const result = await kisTerminalService.requestPayment({ tradeType: payTradeType, amount: amt, installment: payInstallment, merchantTel });
            const { summary, detail } = formatResult(result);
            addLog(result.success ? "OK" : "ERR", summary, detail);
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
        addLog("REQ", `환불 요청: ${refundTradeType === "D2" ? "신용카드" : "간편결제"} ${amt.toLocaleString()}원 (원승인: ${refundOrgAuthNo})`);
        try {
            const result = await kisTerminalService.requestRefund({ tradeType: refundTradeType, amount: amt, orgAuthDate: refundOrgAuthDate, orgAuthNo: refundOrgAuthNo, vanKey: refundVanKey, merchantTel });
            const { summary, detail } = formatResult(result);
            addLog(result.success ? "OK" : "ERR", summary, detail);
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

    const handleVerify = async () => {
        setLoading(true);
        kisTerminalService.setSendLogger((json) => addLog("SEND", "단말기 전문 송신", json));
        const ok = await kisTerminalService.connect();
        if (ok) {
            const now = new Date().toLocaleString("ko-KR");
            setVerified(true);
            setLastVerifiedAt(now);
            setConnected(true);
            localStorage.setItem("kkeut_terminal_verified", "true");
            localStorage.setItem("kkeut_terminal_verified_at", now);
            addLog("OK", "단말기 연동 확인 완료");
        } else {
            addLog("ERR", "단말기 연결 실패 - 에이전트가 실행 중인지 확인하세요");
        }
        setLoading(false);
    };

    const handleUnverify = () => {
        setVerified(false);
        setLastVerifiedAt("");
        localStorage.removeItem("kkeut_terminal_verified");
        localStorage.removeItem("kkeut_terminal_verified_at");
    };

    const copyLog = (idx: number, data: string) => {
        navigator.clipboard.writeText(data);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 1500);
    };

    const logColor: Record<string, string> = {
        OK: "#22c55e", ERR: "#ef4444", REQ: "#3b82f6", SEND: "#a78bfa", INFO: "#94a3b8",
    };

    const inputCls = "w-full rounded border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none focus:border-[#D27A8C] focus:ring-2 focus:ring-[#D27A8C]/20 transition-all placeholder:text-gray-400";
    const selectCls = `${inputCls} appearance-none`;

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
        <TopBar title="설정 > 단말기 연동" />
        <div className="flex-1 overflow-y-auto p-6">
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
            {/* ── 단말기 모드 선택 ── */}
            <div className="mb-5 rounded-2xl border border-[#F8DCE2] bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-sm font-bold text-[#5C2A35]">카드 단말기 모드</div>
                        <div className="mt-1 text-xs text-gray-500">
                            결제·환불 시 차트가 단말기와 어떻게 연동될지 결정합니다. 단말기 종류가 다르거나 고장 시 "수기 결제"로 변경하여 승인번호를 직접 입력하세요.
                        </div>
                    </div>
                    {modeMessage && (
                        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
                            {modeMessage}
                        </div>
                    )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {([
                        { value: "kis" as const, label: "KIS 단말기 연동", desc: "ws://localhost:1516 KIS Agent 와 자동 연동" },
                        { value: "manual" as const, label: "수기 결제 (단말기 미사용)", desc: "단말기 호출 없이 승인번호 직접 입력" },
                        { value: "nice" as const, label: "NICE 페이먼츠 (개발 예정)", desc: "곧 지원 예정 — 현재는 선택 불가", disabled: true },
                    ]).map((opt) => {
                        const active = currentMode === opt.value;
                        const saving = savingMode === opt.value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                disabled={opt.disabled || !!savingMode}
                                onClick={() => void handleModeChange(opt.value)}
                                className={`rounded-2xl border p-4 text-left transition ${
                                    opt.disabled
                                        ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50"
                                        : active
                                            ? "border-[#D27A8C] bg-[#FCEBEF] shadow-sm"
                                            : "border-[#F8DCE2] bg-white hover:border-[#D27A8C] hover:bg-[#FCEBEF]"
                                } ${saving ? "opacity-60" : ""}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`inline-block h-3 w-3 rounded-full border ${active ? "border-[#D27A8C] bg-[#D27A8C]" : "border-slate-300 bg-white"}`} />
                                    <span className="text-sm font-bold text-[#242424]">{opt.label}</span>
                                    {saving && <span className="ml-auto text-[11px] text-gray-500">저장 중...</span>}
                                </div>
                                <div className="mt-2 text-[11px] text-gray-500">{opt.desc}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {currentMode !== "kis" && (
                <div style={{
                    marginBottom: 16, padding: "12px 16px", borderRadius: 10,
                    background: currentMode === "manual" ? "#fffbeb" : "#f8fafc",
                    border: `1px solid ${currentMode === "manual" ? "#fde68a" : "#e2e8f0"}`,
                    color: currentMode === "manual" ? "#92400e" : "#475569",
                    fontSize: 13,
                }}>
                    <strong>{currentMode === "manual" ? "현재 수기 결제 모드입니다." : "현재 NICE 모드(개발 예정)입니다."}</strong>
                    {" "}KIS 단말기는 호출되지 않습니다. 아래 통신 테스트는 KIS Agent 진단용으로만 사용 가능합니다.
                </div>
            )}

            {/* ── 연결 상태 바 ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>KIS Agent WebSocket 통신 테스트 (admin 전용)</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                        background: connected ? "#ecfdf5" : "#fef2f2",
                        color: connected ? "#059669" : "#dc2626",
                        border: `1px solid ${connected ? "#a7f3d0" : "#fecaca"}`,
                    }}>
                        <span style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: connected ? "#10b981" : "#ef4444",
                            boxShadow: connected ? "0 0 6px #10b981" : "none",
                        }} />
                        {connected ? "연결됨" : "미연결"}
                    </div>
                    {!connected ? (
                        <button onClick={handleConnect} disabled={loading} style={{
                            padding: "8px 20px", borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer",
                            background: "#5C2A35", color: "#fff", fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1,
                        }}>
                            {loading ? "연결 중…" : "연결"}
                        </button>
                    ) : (
                        <button onClick={handleDisconnect} style={{
                            padding: "8px 20px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer",
                            background: "#fff", color: "#6b7280", fontSize: 13, fontWeight: 500,
                        }}>
                            연결 해제
                        </button>
                    )}
                </div>
            </div>

            {/* ── 연동 상태 ── */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", borderRadius: 12, marginBottom: 20,
                background: verified ? "#f0fdf4" : "#fafafa",
                border: `1px solid ${verified ? "#bbf7d0" : "#e5e7eb"}`,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                        background: verified ? "#dcfce7" : "#f3f4f6",
                    }}>
                        {verified ? (
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : (
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        )}
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: verified ? "#15803d" : "#374151" }}>
                            {verified ? "단말기 연동 완료" : "단말기 미연동"}
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                            {lastVerifiedAt ? `마지막 확인: ${lastVerifiedAt}` : "연동 확인을 눌러 단말기 상태를 확인하세요"}
                        </div>
                    </div>
                </div>
                {verified ? (
                    <button onClick={handleUnverify} style={{
                        padding: "7px 16px", borderRadius: 8, border: "1px solid #fecaca", cursor: "pointer",
                        background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600,
                    }}>연동 해제</button>
                ) : (
                    <button onClick={handleVerify} disabled={loading} style={{
                        padding: "7px 16px", borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer",
                        background: "#D27A8C", color: "#fff", fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1,
                    }}>{loading ? "확인 중…" : "연동 확인"}</button>
                )}
            </div>

            {/* ── 결제 / 환불 2-col ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                {/* 결제 */}
                <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", overflow: "hidden" }}>
                    <div style={{
                        padding: "12px 18px", borderBottom: "1px solid #e5e7eb",
                        background: "linear-gradient(135deg, #5C2A35, #7a3d4d)",
                        display: "flex", alignItems: "center", gap: 8,
                    }}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>결제 테스트</span>
                    </div>
                    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>거래유형</label>
                            <select value={payTradeType} onChange={(e) => setPayTradeType(e.target.value as "D1" | "v1")} className={selectCls}>
                                <option value="D1">D1 - 신용카드 승인</option>
                                <option value="v1">v1 - 간편결제 승인</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>결제 금액</label>
                            <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputCls} />
                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                {QUICK_AMOUNTS.map((amt) => (
                                    <button key={amt} onClick={() => setPayAmount(String(amt))} style={{
                                        flex: 1, padding: "5px 0", borderRadius: 6, border: "none", cursor: "pointer",
                                        fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                                        background: payAmount === String(amt) ? "#5C2A35" : "#f5f5f5",
                                        color: payAmount === String(amt) ? "#fff" : "#666",
                                    }}>
                                        {amt >= 10000 ? `${amt / 10000}만` : amt.toLocaleString()}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>할부</label>
                            <select value={payInstallment} onChange={(e) => setPayInstallment(e.target.value)} className={selectCls}>
                                <option value="00">일시불</option>
                                <option value="02">2개월</option>
                                <option value="03">3개월</option>
                                <option value="06">6개월</option>
                                <option value="12">12개월</option>
                            </select>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <button onClick={handlePayment} disabled={loading || !connected} style={{
                                flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: (loading || !connected) ? "not-allowed" : "pointer",
                                background: "#D27A8C", color: "#fff", fontSize: 13, fontWeight: 700,
                                opacity: (loading || !connected) ? 0.4 : 1, transition: "all 0.15s",
                            }}>
                                {loading ? "단말기 대기 중…" : "결제 요청"}
                            </button>
                            {loading && (
                                <button onClick={handleCancel} style={{
                                    padding: "10px 16px", borderRadius: 8, border: "1px solid #fecaca", cursor: "pointer",
                                    background: "#fff", color: "#dc2626", fontSize: 13, fontWeight: 600,
                                }}>취소</button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 환불 */}
                <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", overflow: "hidden" }}>
                    <div style={{
                        padding: "12px 18px", borderBottom: "1px solid #e5e7eb",
                        background: "linear-gradient(135deg, #991b1b, #dc2626)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>환불 테스트</span>
                        </div>
                        {refundOrgAuthNo && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#bbf7d0", background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 10 }}>
                                자동 입력됨
                            </span>
                        )}
                    </div>
                    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>거래유형</label>
                            <select value={refundTradeType} onChange={(e) => setRefundTradeType(e.target.value as "D2" | "v2")} className={selectCls}>
                                <option value="D2">D2 - 신용카드 취소</option>
                                <option value="v2">v2 - 간편결제 취소</option>
                            </select>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>원승인번호</label>
                                <input value={refundOrgAuthNo} onChange={(e) => setRefundOrgAuthNo(e.target.value)} className={inputCls} placeholder="자동 입력" />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>원승인일자</label>
                                <input value={refundOrgAuthDate} onChange={(e) => setRefundOrgAuthDate(e.target.value)} className={inputCls} placeholder="YYMMDD" />
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>VANKEY</label>
                                <input value={refundVanKey} onChange={(e) => setRefundVanKey(e.target.value)} className={inputCls} placeholder="자동 입력" />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>환불 금액</label>
                                <input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className={inputCls} placeholder="자동 입력" />
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <button onClick={handleRefund} disabled={loading || !connected} style={{
                                flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: (loading || !connected) ? "not-allowed" : "pointer",
                                background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700,
                                opacity: (loading || !connected) ? 0.4 : 1, transition: "all 0.15s",
                            }}>
                                {loading ? "단말기 대기 중…" : "환불 요청"}
                            </button>
                            {loading && (
                                <button onClick={handleCancel} style={{
                                    padding: "10px 16px", borderRadius: 8, border: "1px solid #fecaca", cursor: "pointer",
                                    background: "#fff", color: "#dc2626", fontSize: 13, fontWeight: 600,
                                }}>취소</button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 통신 로그 ── */}
            <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                <div style={{
                    padding: "10px 18px", borderBottom: "1px solid #e5e7eb", background: "#fafafa",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#666" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>통신 로그</span>
                        {logs.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: "#6b7280", padding: "1px 7px", borderRadius: 10 }}>{logs.length}</span>
                        )}
                    </div>
                    {logs.length > 0 && (
                        <button onClick={() => setLogs([])} style={{
                            fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer",
                        }}>초기화</button>
                    )}
                </div>
                <div style={{
                    maxHeight: 380, overflowY: "auto", background: "#111827", padding: logs.length ? 12 : 0,
                }}>
                    {logs.length === 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", color: "#4b5563" }}>
                            <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#374151" strokeWidth={1.5} style={{ marginBottom: 10 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span style={{ fontSize: 12 }}>통신 로그가 여기에 표시됩니다</span>
                            <span style={{ fontSize: 11, color: "#374151", marginTop: 4 }}>단말기 연결 후 결제/환불을 테스트하세요</span>
                        </div>
                    ) : (
                        <>
                            {logs.map((log, i) => {
                                const isExpanded = expandedLog === i;
                                const hasDetail = !!log.detail;
                                return (
                                    <div key={i} style={{ marginBottom: 2 }}>
                                        <div
                                            onClick={() => hasDetail ? setExpandedLog(isExpanded ? null : i) : undefined}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 10,
                                                padding: "7px 12px", borderRadius: 6,
                                                cursor: hasDetail ? "pointer" : "default",
                                                background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                                                transition: "background 0.1s",
                                            }}
                                            onMouseEnter={(e) => { if (hasDetail) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"; }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"; }}
                                        >
                                            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", flexShrink: 0 }}>{log.time}</span>
                                            <span style={{
                                                fontSize: 10, fontFamily: "monospace", fontWeight: 700, flexShrink: 0,
                                                width: 40, textAlign: "center", padding: "2px 0", borderRadius: 3,
                                                color: logColor[log.type] || "#94a3b8",
                                                background: `${logColor[log.type] || "#94a3b8"}18`,
                                            }}>{log.type}</span>
                                            <span style={{ fontSize: 12, fontFamily: "monospace", color: "#e5e7eb", flex: 1 }}>
                                                {log.summary}
                                            </span>
                                            {hasDetail && (
                                                <span style={{ fontSize: 10, color: "#6b7280", flexShrink: 0 }}>
                                                    {isExpanded ? "▲ 접기" : "▼ 상세"}
                                                </span>
                                            )}
                                        </div>
                                        {hasDetail && isExpanded && (
                                            <div style={{
                                                margin: "2px 0 4px 62px", padding: "8px 12px",
                                                borderRadius: 6, background: "rgba(255,255,255,0.04)",
                                                border: "1px solid rgba(255,255,255,0.08)",
                                                position: "relative",
                                            }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); copyLog(i, log.detail!); }}
                                                    style={{
                                                        position: "absolute", top: 6, right: 8,
                                                        fontSize: 10, color: copiedIdx === i ? "#22c55e" : "#6b7280",
                                                        background: "none", border: "none", cursor: "pointer",
                                                    }}
                                                >{copiedIdx === i ? "복사됨" : "복사"}</button>
                                                <pre style={{
                                                    fontSize: 10, fontFamily: "monospace", color: "#9ca3af",
                                                    whiteSpace: "pre-wrap", wordBreak: "break-all",
                                                    margin: 0, maxHeight: 300, overflowY: "auto",
                                                }}>{log.detail}</pre>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <div ref={logEndRef} />
                        </>
                    )}
                </div>
            </div>
        </div>
        </div>
        </div>
    );
}

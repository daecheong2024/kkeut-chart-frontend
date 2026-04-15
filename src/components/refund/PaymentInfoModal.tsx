import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Pencil, Save, CreditCard, Wallet, Smartphone, Monitor } from "lucide-react";
import { paymentService, type PaymentDetailBreakdown } from "../../services/paymentService";
import { useAlert } from "../ui/AlertDialog";

export interface PaymentInfoModalProps {
    open: boolean;
    /** 수납건(=PaymentMaster)의 모든 결제수단 detail 리스트 */
    details: PaymentDetailBreakdown[];
    paymentTime?: string;
    receiptUserName?: string;
    /** 모달 헤더에 강조 표시할 detail id (특정 행에서 진입한 경우) */
    focusedDetailId?: number;
    onClose: () => void;
    onUpdated?: () => void;
}

function paymentTypeLabel(paymentType?: string): string {
    const upper = (paymentType || "").toUpperCase();
    switch (upper) {
        case "CARD": return "카드";
        case "PAY": return "간편결제";
        case "CASH": return "현금";
        case "BANKING": return "계좌이체";
        case "MEMBERSHIP_CASH": return "회원권 잔액";
        case "MEMBERSHIP_POINT": return "회원권 포인트";
        default: return upper || "기타";
    }
}

function paymentTypeIcon(paymentType?: string) {
    const u = (paymentType || "").toUpperCase();
    if (u === "CARD") return <CreditCard className="h-3.5 w-3.5" />;
    if (u === "PAY") return <Smartphone className="h-3.5 w-3.5" />;
    if (u === "CASH") return <Wallet className="h-3.5 w-3.5" />;
    if (u === "BANKING") return <Monitor className="h-3.5 w-3.5" />;
    return null;
}

function isCardOrPay(paymentType?: string): boolean {
    const u = (paymentType || "").toUpperCase();
    return u === "CARD" || u === "PAY";
}

function formatWon(value: number): string {
    return `${Math.max(0, Math.round(value)).toLocaleString()}원`;
}

function formatPaymentTime(value?: string): string {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface DetailEditState {
    authNo: string;
    authDate: string;
    vanKey: string;
    cardCompany: string;
    installment: string;
}

export function PaymentInfoModal({ open, details, paymentTime, receiptUserName, focusedDetailId, onClose, onUpdated }: PaymentInfoModalProps) {
    const { showAlert } = useAlert();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [edits, setEdits] = useState<Record<number, DetailEditState>>({});
    const [savingId, setSavingId] = useState<number | null>(null);

    useEffect(() => {
        if (!open) return;
        setEditingId(null);
        const next: Record<number, DetailEditState> = {};
        for (const d of details) {
            next[d.id] = {
                authNo: d.terminalAuthNo || "",
                authDate: d.terminalAuthDate || "",
                vanKey: d.terminalVanKey || "",
                cardCompany: d.cardCompany || "",
                installment: d.installment || "",
            };
        }
        setEdits(next);
    }, [open, details]);

    const totalAmount = useMemo(() => details.reduce((s, d) => s + d.amount, 0), [details]);

    if (!open || details.length === 0) return null;

    const updateEdit = (id: number, patch: Partial<DetailEditState>) => {
        setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    };

    const handleSave = async (d: PaymentDetailBreakdown) => {
        const e = edits[d.id];
        if (!e) return;
        if (e.authDate && !/^\d{8}$/.test(e.authDate.trim())) {
            showAlert({ message: "거래일시는 YYYYMMDD 8자리 숫자로 입력해 주세요. (예: 20260414)", type: "warning" });
            return;
        }
        setSavingId(d.id);
        try {
            await paymentService.updatePaymentDetailTerminalInfo(d.id, {
                authNo: e.authNo.trim(),
                terminalAuthDate: e.authDate.trim(),
                terminalVanKey: e.vanKey.trim(),
                cardCompany: e.cardCompany.trim(),
                installment: e.installment.trim(),
            });
            showAlert({ message: "수납 정보가 저장되었습니다.", type: "success" });
            setEditingId(null);
            onUpdated?.();
        } catch (err: any) {
            showAlert({ message: `저장 실패: ${err?.response?.data?.message || err?.message || "오류"}`, type: "error" });
        } finally {
            setSavingId(null);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] px-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-[640px] max-h-[88vh] overflow-hidden rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150 flex flex-col">
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-[#F8DCE2] px-6 py-3 bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white shrink-0">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#D27A8C] to-[#8B3F50]" />
                    <div className="pl-2">
                        <div className="text-[15px] font-extrabold text-[#5C2A35]">수납 정보</div>
                        <div className="text-[11px] text-[#8B5A66]">결제수단 {details.length}건</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#F8DCE2] bg-white text-[#8B3F50] hover:text-[#5C2A35] hover:bg-[#FCEBEF] transition-all"
                        title="닫기"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {/* Master summary */}
                    <div className="rounded-xl border border-[#F8DCE2] bg-gradient-to-b from-[#FCF7F8] to-white px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[11px] font-extrabold text-[#8B3F50]">총 결제 금액</div>
                            <div className="text-[10px] text-[#8B5A66]">{formatPaymentTime(paymentTime)}{receiptUserName ? ` · ${receiptUserName}` : ""}</div>
                        </div>
                        <div className="text-[22px] font-black text-[#D27A8C] tabular-nums leading-none">{formatWon(totalAmount)}</div>
                    </div>

                    {/* Per-detail cards */}
                    {details.map(d => {
                        const editing = editingId === d.id;
                        const editable = isCardOrPay(d.paymentType);
                        const e = edits[d.id] || { authNo: "", authDate: "", vanKey: "", cardCompany: "", installment: "" };
                        const focused = focusedDetailId === d.id;
                        const isMissingTerminal = editable && (!d.terminalAuthNo || !d.terminalAuthDate || !d.terminalVanKey);

                        return (
                            <div
                                key={d.id}
                                className={`rounded-xl border bg-white transition-all ${focused ? "border-[#D27A8C] shadow-[0_0_0_2px_rgba(210,122,140,0.2)]" : "border-[#F8DCE2]"}`}
                            >
                                {/* Row header */}
                                <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#F8DCE2]/60 bg-[#FCF7F8]/50">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="inline-flex items-center gap-1 rounded-full border border-[#F8DCE2] bg-white px-2 py-0.5 text-[11px] font-bold text-[#5C2A35] shrink-0">
                                            {paymentTypeIcon(d.paymentType)}
                                            <span>{paymentTypeLabel(d.paymentType)}</span>
                                            {d.paymentSubMethodLabel && <span className="text-[#8B5A66] font-normal">· {d.paymentSubMethodLabel}</span>}
                                        </span>
                                        {isMissingTerminal && (
                                            <span className="text-rose-500 text-[10px] font-bold" title="단말기 정보 미등록">⚠ 단말기 정보 없음</span>
                                        )}
                                    </div>
                                    <div className="text-[14px] font-extrabold text-[#5C2A35] tabular-nums shrink-0">{formatWon(d.amount)}</div>
                                </div>

                                {/* Body — fields */}
                                <div className="px-4 py-3 space-y-1.5">
                                    {editable ? (
                                        editing ? (
                                            <>
                                                <Field label="카드사">
                                                    <input
                                                        type="text"
                                                        value={e.cardCompany}
                                                        onChange={(ev) => updateEdit(d.id, { cardCompany: ev.target.value })}
                                                        placeholder="예: 현대"
                                                        className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                                    />
                                                </Field>
                                                <Field label="할부정보">
                                                    <input
                                                        type="text"
                                                        value={e.installment}
                                                        onChange={(ev) => updateEdit(d.id, { installment: ev.target.value })}
                                                        placeholder="예: 일시불 / 03"
                                                        className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                                    />
                                                </Field>
                                                <Field label="승인번호">
                                                    <input
                                                        type="text"
                                                        value={e.authNo}
                                                        onChange={(ev) => updateEdit(d.id, { authNo: ev.target.value })}
                                                        placeholder="단말기 또는 영수증 승인번호"
                                                        className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                                    />
                                                </Field>
                                                <Field label="거래일시">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        maxLength={8}
                                                        value={e.authDate}
                                                        onChange={(ev) => updateEdit(d.id, { authDate: ev.target.value.replace(/\D/g, "") })}
                                                        placeholder="YYYYMMDD (예: 20260414)"
                                                        className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                                    />
                                                </Field>
                                                <Field label="VANKEY">
                                                    <input
                                                        type="text"
                                                        value={e.vanKey}
                                                        onChange={(ev) => updateEdit(d.id, { vanKey: ev.target.value })}
                                                        placeholder="영수증 하단 'VAN거래키' / '거래키' (16자리)"
                                                        className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                                    />
                                                </Field>
                                                <div className="flex justify-end gap-1.5 pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingId(null)}
                                                        disabled={savingId === d.id}
                                                        className="h-8 rounded-md border border-[#F8DCE2] bg-white px-3 text-[11px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF] disabled:opacity-50"
                                                    >
                                                        취소
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSave(d)}
                                                        disabled={savingId === d.id}
                                                        className="inline-flex items-center gap-1 h-8 rounded-md bg-[#D27A8C] px-3 text-[11px] font-extrabold text-white hover:bg-[#8B3F50] disabled:opacity-50"
                                                    >
                                                        <Save className="h-3 w-3" /> {savingId === d.id ? "저장 중..." : "저장"}
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <Field label="카드사">{d.cardCompany || <span className="text-[#C9A0A8]">미등록</span>}</Field>
                                                <Field label="할부정보">{d.installment || "일시불"}</Field>
                                                <Field label="승인번호">{d.terminalAuthNo || <span className="text-[#C9A0A8]">미등록</span>}</Field>
                                                <Field label="거래일시">{d.terminalAuthDate || <span className="text-[#C9A0A8]">미등록</span>}</Field>
                                                <Field label="VANKEY">{d.terminalVanKey || <span className="text-[#C9A0A8]">미등록</span>}</Field>
                                                <div className="flex justify-end pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingId(d.id)}
                                                        className="inline-flex items-center gap-1 h-7 rounded-md border border-[#F8DCE2] bg-white px-2.5 text-[11px] font-bold text-[#8B3F50] hover:bg-[#FCEBEF]"
                                                    >
                                                        <Pencil className="h-3 w-3" /> 단말기 정보 수정
                                                    </button>
                                                </div>
                                            </>
                                        )
                                    ) : (
                                        <>
                                            {d.memo && <Field label="메모">{d.memo}</Field>}
                                            <div className="text-[10.5px] text-[#8B5A66]">현금/계좌/회원권 차감 등 단말기 무관 수단입니다.</div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-[#F8DCE2] px-6 py-3 bg-gradient-to-b from-[#FCF7F8] to-white shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 rounded-xl border border-[#F8DCE2] bg-white px-4 text-[12px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF]"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[80px_1fr] items-center gap-3 py-1">
            <div className="text-[11px] font-bold text-[#8B5A66]">{label}</div>
            <div className="text-[12.5px] text-[#2A1F22]">{children}</div>
        </div>
    );
}

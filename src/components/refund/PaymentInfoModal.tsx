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

    // 같은 결제수단 묶음 (DB는 티켓별 분개되지만 직원 화면은 "한 번의 결제 = 한 행")
    // 카드/페이: paymentType + AuthNo + AuthDate + VanKey 동일 = 같은 카드 거래
    // 현금/계좌/회원권/플랫폼/기타: paymentType 동일하면 한 묶음
    const groupedDetails = useMemo(() => {
        const map = new Map<string, PaymentDetailBreakdown[]>();
        for (const d of details) {
            const u = (d.paymentType || "").toUpperCase();
            const isCardLike = u === "CARD" || u === "PAY";
            const key = isCardLike
                ? `${u}::${d.terminalAuthNo || d.id}::${d.terminalAuthDate || ""}::${d.terminalVanKey || ""}`
                : u;
            const arr = map.get(key) ?? [];
            arr.push(d);
            map.set(key, arr);
        }
        return Array.from(map.values());
    }, [details]);

    if (!open || details.length === 0) return null;

    const updateEdit = (id: number, patch: Partial<DetailEditState>) => {
        setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    };

    // 묶음 저장: 같은 결제수단으로 묶인 모든 detail 에 동일 metadata 일괄 업데이트
    const handleSaveGroup = async (group: PaymentDetailBreakdown[]) => {
        const anchor = group[0];
        const e = edits[anchor.id];
        if (!e) return;
        if (e.authDate && !/^\d{8}$/.test(e.authDate.trim())) {
            showAlert({ message: "거래일시는 YYYYMMDD 8자리 숫자로 입력해 주세요. (예: 20260414)", type: "warning" });
            return;
        }
        setSavingId(anchor.id);
        try {
            for (const d of group) {
                await paymentService.updatePaymentDetailTerminalInfo(d.id, {
                    authNo: e.authNo.trim(),
                    terminalAuthDate: e.authDate.trim(),
                    terminalVanKey: e.vanKey.trim(),
                    cardCompany: e.cardCompany.trim(),
                    installment: e.installment.trim(),
                });
            }
            showAlert({ message: `수납 정보가 저장되었습니다 (${group.length}건 동시 적용).`, type: "success" });
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
                        <div className="flex items-center justify-between gap-3 mb-1">
                            <div className="text-[11px] font-extrabold text-[#8B3F50] shrink-0">총 결제 금액</div>
                            <div className="text-[12.5px] font-semibold text-[#5C2A35] text-right whitespace-nowrap">
                                {formatPaymentTime(paymentTime)}
                                {receiptUserName && (
                                    <span className="ml-1.5 text-[#8B3F50]">· {receiptUserName}</span>
                                )}
                            </div>
                        </div>
                        <div className="text-[22px] font-black text-[#D27A8C] tabular-nums leading-none">{formatWon(totalAmount)}</div>
                    </div>

                    {/* Grouped payment method cards (DB 는 티켓별 분개되지만 화면은 결제 묶음 단위) */}
                    {groupedDetails.map(group => {
                        const d = group[0]; // anchor
                        const groupTotal = group.reduce((s, x) => s + x.amount, 0);
                        const groupRefundedTotal = group.reduce((s, x) => s + (x.refundedAmount || 0), 0);
                        const groupRePayTotal = group.reduce((s, x) => s + (x.rePaymentAmount || 0), 0);
                        const groupCustomerNet = Math.max(0, groupRefundedTotal - groupRePayTotal);
                        const isAnyRefunded = group.some(x => x.isRefunded);
                        const refundedAt = group.map(x => x.refundedAt).filter(Boolean).sort().slice(-1)[0];
                        const editing = editingId === d.id;
                        const editable = isCardOrPay(d.paymentType);
                        const e = edits[d.id] || { authNo: "", authDate: "", vanKey: "", cardCompany: "", installment: "" };
                        const focused = group.some(x => x.id === focusedDetailId);
                        const isMissingTerminal = editable && (!d.terminalAuthNo || !d.terminalAuthDate || !d.terminalVanKey);

                        return (
                            <div
                                key={`group-${d.id}`}
                                className={`rounded-xl border bg-white transition-all ${isAnyRefunded ? "border-rose-200 bg-rose-50/30" : focused ? "border-[#D27A8C] shadow-[0_0_0_2px_rgba(210,122,140,0.2)]" : "border-[#F8DCE2]"}`}
                            >
                                {/* Row header */}
                                <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#F8DCE2]/60 ${isAnyRefunded ? "bg-rose-50/50" : "bg-[#FCF7F8]/50"}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="inline-flex items-center gap-1 rounded-full border border-[#F8DCE2] bg-white px-2 py-0.5 text-[11px] font-bold text-[#5C2A35] shrink-0">
                                            {paymentTypeIcon(d.paymentType)}
                                            <span>{paymentTypeLabel(d.paymentType)}</span>
                                            {d.paymentSubMethodLabel && <span className="text-[#8B5A66] font-normal">· {d.paymentSubMethodLabel}</span>}
                                        </span>
                                        {isAnyRefunded && (
                                            <span className="inline-flex items-center rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[11px] font-bold text-rose-600">환불 처리됨</span>
                                        )}
                                        {isMissingTerminal && !isAnyRefunded && (
                                            <span className="text-rose-500 text-[10px] font-bold" title="단말기 정보 미등록">⚠ 단말기 정보 없음</span>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[14px] font-extrabold text-[#5C2A35] tabular-nums">{formatWon(groupTotal)}</div>
                                        {group.length > 1 && (
                                            <div className="text-[10px] text-[#8B5A66]">티켓 {group.length}건 분개 포함</div>
                                        )}
                                    </div>
                                </div>

                                {/* Refund summary (when refunded) */}
                                {isAnyRefunded && (
                                    <div className="px-4 py-2.5 bg-rose-50/40 border-b border-rose-100 text-[12px] space-y-1">
                                        <div className="grid grid-cols-[80px_1fr] items-center gap-3">
                                            <div className="text-[11px] font-bold text-rose-700">환불 처리</div>
                                            <div className="font-bold text-[#5C2A35]">
                                                {refundedAt ? new Date(refundedAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[80px_1fr] items-center gap-3">
                                            <div className="text-[11px] font-bold text-rose-700">카드사 취소액</div>
                                            <div className="tabular-nums text-[#5C2A35]">{formatWon(groupRefundedTotal)}</div>
                                        </div>
                                        {groupRePayTotal > 0 && (
                                            <>
                                                <div className="grid grid-cols-[80px_1fr] items-center gap-3">
                                                    <div className="text-[11px] font-bold text-rose-700">공제액</div>
                                                    <div className="tabular-nums text-amber-700 font-bold">
                                                        {formatWon(groupRePayTotal)}
                                                        {group[0].rePaymentMethod && <span className="ml-1 text-[10px] font-normal text-[#8B5A66]">({paymentTypeLabel(group[0].rePaymentMethod)})</span>}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-[80px_1fr] items-center gap-3 pt-1 border-t border-rose-100">
                                                    <div className="text-[12px] font-extrabold text-rose-700">고객 실수령</div>
                                                    <div className="text-[14px] tabular-nums font-extrabold text-rose-600">{formatWon(groupCustomerNet)}</div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

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
                                                        onClick={() => handleSaveGroup(group)}
                                                        disabled={savingId === d.id}
                                                        className="inline-flex items-center gap-1 h-8 rounded-md bg-[#D27A8C] px-3 text-[11px] font-extrabold text-white hover:bg-[#8B3F50] disabled:opacity-50"
                                                    >
                                                        <Save className="h-3 w-3" /> {savingId === d.id ? "저장 중..." : (group.length > 1 ? `저장 (${group.length}건 일괄)` : "저장")}
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
                                                {(d.terminalCatId || d.terminalMerchantRegNo) && (
                                                    <Field label="단말기">
                                                        <span className="font-mono text-[11.5px]">
                                                            {d.terminalCatId && `CAT #${d.terminalCatId}`}
                                                            {d.terminalCatId && d.terminalMerchantRegNo && " · "}
                                                            {d.terminalMerchantRegNo && `가맹점 ${d.terminalMerchantRegNo}`}
                                                        </span>
                                                    </Field>
                                                )}
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

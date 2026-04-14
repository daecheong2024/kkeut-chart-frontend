import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Pencil, Save } from "lucide-react";
import { paymentService, type PaymentDetailBreakdown } from "../../services/paymentService";
import { useAlert } from "../ui/AlertDialog";

export interface PaymentInfoModalProps {
    open: boolean;
    detail: PaymentDetailBreakdown | null;
    paymentTime?: string;
    receiptUserName?: string;
    onClose: () => void;
    onUpdated?: (detailId: number) => void;
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

export function PaymentInfoModal({ open, detail, paymentTime, receiptUserName, onClose, onUpdated }: PaymentInfoModalProps) {
    const { showAlert } = useAlert();
    const [editing, setEditing] = useState(false);
    const [authNo, setAuthNo] = useState("");
    const [authDate, setAuthDate] = useState("");
    const [vanKey, setVanKey] = useState("");
    const [cardCompany, setCardCompany] = useState("");
    const [installment, setInstallment] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !detail) return;
        setEditing(false);
        setAuthNo(detail.terminalAuthNo || "");
        setAuthDate(detail.terminalAuthDate || "");
        setVanKey(detail.terminalVanKey || "");
        setCardCompany(detail.cardCompany || "");
        setInstallment(detail.installment || "");
    }, [open, detail]);

    if (!open || !detail) return null;

    const editable = isCardOrPay(detail.paymentType);

    const handleSave = async () => {
        if (authDate && !/^\d{8}$/.test(authDate.trim())) {
            showAlert({ message: "거래일시는 YYYYMMDD 8자리 숫자로 입력해 주세요. (예: 20260414)", type: "warning" });
            return;
        }
        setSaving(true);
        try {
            await paymentService.updatePaymentDetailTerminalInfo(detail.id, {
                authNo: authNo.trim(),
                terminalAuthDate: authDate.trim(),
                terminalVanKey: vanKey.trim(),
                cardCompany: cardCompany.trim(),
                installment: installment.trim(),
            });
            showAlert({ message: "수납 정보가 저장되었습니다.", type: "success" });
            setEditing(false);
            onUpdated?.(detail.id);
        } catch (e: any) {
            showAlert({ message: `저장 실패: ${e?.response?.data?.message || e?.message || "오류"}`, type: "error" });
        } finally {
            setSaving(false);
        }
    };

    const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
        <div className="grid grid-cols-[110px_1fr] items-center gap-3 py-1.5">
            <div className="text-[11px] font-bold text-[#8B5A66]">{label}</div>
            <div className="text-[13px] text-[#2A1F22]">{children}</div>
        </div>
    );

    return createPortal(
        <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#2A1F22]/55 backdrop-blur-[3px] px-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-[520px] rounded-2xl border border-[#F8DCE2] bg-white shadow-[0_30px_80px_rgba(92,42,53,0.4)] animate-in zoom-in-95 duration-150 overflow-hidden">
                <div className="relative flex items-center justify-between border-b border-[#F8DCE2] px-6 py-3 bg-gradient-to-r from-[#FCEBEF] via-[#FCF7F8] to-white">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#D27A8C] to-[#8B3F50]" />
                    <div className="pl-2">
                        <div className="text-[15px] font-extrabold text-[#5C2A35]">수납 정보</div>
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

                <div className="px-6 py-4">
                    <div className="rounded-xl border border-[#F8DCE2] bg-gradient-to-b from-[#FCF7F8] to-white px-4 py-3">
                        <div className="text-[11px] font-extrabold text-[#8B3F50] mb-1">총 결제 금액</div>
                        <div className="text-[22px] font-black text-[#D27A8C] tabular-nums leading-none">{formatWon(detail.amount)}</div>
                    </div>

                    <div className="mt-3 divide-y divide-[#F8DCE2]/60">
                        <Row label="결제일시">{formatPaymentTime(paymentTime)}</Row>
                        <Row label="결제수단">{paymentTypeLabel(detail.paymentType)}{detail.paymentSubMethodLabel ? ` · ${detail.paymentSubMethodLabel}` : ""}</Row>
                        {editable ? (
                            <>
                                <Row label="카드사">
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={cardCompany}
                                            onChange={(e) => setCardCompany(e.target.value)}
                                            placeholder="예: 현대"
                                            className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                        />
                                    ) : (cardCompany || "-")}
                                </Row>
                                <Row label="할부정보">
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={installment}
                                            onChange={(e) => setInstallment(e.target.value)}
                                            placeholder="예: 일시불 / 03"
                                            className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                        />
                                    ) : (installment || "일시불")}
                                </Row>
                                <Row label="승인번호">
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={authNo}
                                            onChange={(e) => setAuthNo(e.target.value)}
                                            placeholder="단말기 또는 영수증 승인번호"
                                            className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                        />
                                    ) : (authNo || <span className="text-[#C9A0A8]">미등록</span>)}
                                </Row>
                                <Row label="거래일시">
                                    {editing ? (
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={8}
                                            value={authDate}
                                            onChange={(e) => setAuthDate(e.target.value.replace(/\D/g, ""))}
                                            placeholder="YYYYMMDD (예: 20260414)"
                                            className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                        />
                                    ) : (authDate || <span className="text-[#C9A0A8]">미등록</span>)}
                                </Row>
                                <Row label="VANKEY">
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={vanKey}
                                            onChange={(e) => setVanKey(e.target.value)}
                                            placeholder="단말기 또는 영수증 VANKEY"
                                            className="h-8 w-full rounded-md border border-[#F4C7CE] bg-white px-2 text-[12px] outline-none focus:border-[#D27A8C]"
                                        />
                                    ) : (vanKey || <span className="text-[#C9A0A8]">미등록</span>)}
                                </Row>
                            </>
                        ) : null}
                        <Row label="수납담당자">{receiptUserName || "-"}</Row>
                        {detail.memo && <Row label="메모">{detail.memo}</Row>}
                    </div>

                    {editable && !editing && (!authNo || !authDate || !vanKey) && (
                        <div className="mt-3 rounded-lg border border-[#F4C7CE] bg-[#FCEBEF]/60 px-3 py-2 text-[11px] text-[#8B3F50] leading-snug">
                            ⚠ 카드/페이 결제이지만 단말기 정보가 비어 있습니다. 환불 시 단말기 자동 환불을 사용하려면 영수증을 보고 "수납정보 수정" 으로 입력해 주세요.
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-[#F8DCE2] px-6 py-3 bg-gradient-to-b from-[#FCF7F8] to-white">
                    {editable && !editing && (
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            className="inline-flex items-center gap-1 h-9 rounded-xl border border-[#F8DCE2] bg-white px-4 text-[12px] font-bold text-[#8B3F50] hover:bg-[#FCEBEF]"
                        >
                            <Pencil className="h-3.5 w-3.5" /> 수납정보 수정
                        </button>
                    )}
                    {editable && editing && (
                        <>
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                disabled={saving}
                                className="h-9 rounded-xl border border-[#F8DCE2] bg-white px-4 text-[12px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF] disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="inline-flex items-center gap-1 h-9 rounded-xl bg-[#D27A8C] px-4 text-[12px] font-extrabold text-white hover:bg-[#8B3F50] disabled:opacity-50"
                            >
                                <Save className="h-3.5 w-3.5" /> {saving ? "저장 중..." : "저장"}
                            </button>
                        </>
                    )}
                    {!editing && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 rounded-xl border border-[#F8DCE2] bg-white px-4 text-[12px] font-bold text-[#5C2A35] hover:bg-[#FCEBEF]"
                        >
                            닫기
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Smartphone, List, Barcode, CheckCircle2, AlertCircle } from "lucide-react";
import { StepBullet } from "../ui/StepBullet";

interface Props {
    open: boolean;
    onClose: () => void;
    /** 모달이 열릴 때 기본으로 선택할 탭 id. 미지정 시 첫 탭. */
    initialTabId?: string;
}

interface Step {
    title: string;
    description: string;
    icon: React.ReactNode;
    imageSrc?: string;
    imageAlt?: string;
}

interface PayGuide {
    id: string;
    label: string;
    subtitle: string;
    /** "auto" = 별도 절차 없이 차트에서 자동 환불. "barcode" = 고객 폰 바코드 필요. "info" = 정보만 제공 */
    mode: "auto" | "barcode" | "info";
    steps: Step[];
    caveats?: string[];
}

const GUIDES: PayGuide[] = [
    {
        id: "kakao",
        label: "카카오페이",
        subtitle: "카카오머니/카카오페이 결제는 고객 폰 바코드를 단말기에 스캔해서 취소합니다.",
        mode: "barcode",
        steps: [
            {
                title: "고객 폰에서 카카오페이 앱 열기",
                description:
                    "고객님께 카카오페이 앱을 열고 [결제내역] 탭을 누른 뒤, 환불하려는 결제 건을 탭해달라고 요청합니다.",
                icon: <List className="h-4 w-4" />,
                imageSrc: "/guide/pay-refund/step-1-payment-list.png",
                imageAlt: "카카오페이 결제내역 화면",
            },
            {
                title: "상세내역에서 [결제취소 바코드] 버튼 탭",
                description:
                    "결제 상세내역 하단의 [결제취소 바코드] 버튼을 누릅니다. 화면에 취소용 바코드가 생성됩니다.",
                icon: <Smartphone className="h-4 w-4" />,
                imageSrc: "/guide/pay-refund/step-2-cancel-barcode-button.png",
                imageAlt: "카카오페이 상세내역 - 결제취소 바코드 버튼",
            },
            {
                title: "KIS 단말기 바코드 리더로 바코드 스캔",
                description:
                    "단말기 상단의 BARCODE 리더(우측 QR/바코드 영역)에 고객 폰 바코드를 맞춰 스캔합니다. 단말기가 자동으로 원거래를 조회하여 취소 처리합니다.",
                icon: <Barcode className="h-4 w-4" />,
                imageSrc: "/guide/pay-refund/step-3-terminal-barcode.jpg",
                imageAlt: "KIS 단말기 바코드 스캔 영역",
            },
        ],
        caveats: [
            "바코드는 고객이 [결제취소 바코드] 버튼을 누른 직후에만 유효합니다 (보통 2~3분). 시간 초과 시 다시 누르게 하세요.",
            "단말기 환불이 성공하면 차트 환불 모달에서 [환불 처리] 버튼을 눌러 시스템에도 반영해주세요.",
        ],
    },
    {
        id: "naver",
        label: "네이버페이",
        subtitle: "네이버페이는 카드와 동일하게 차트에서 자동 환불됩니다.",
        mode: "auto",
        steps: [
            {
                title: "환불 모달에서 [환불 처리] 버튼 누르기",
                description:
                    "네이버페이 결제는 단말기가 원거래 정보(승인번호/거래일시/VANKEY)만으로 자동 취소할 수 있어 별도 절차가 필요 없습니다. 차트에서 환불 버튼만 누르면 바로 처리됩니다.",
                icon: <CheckCircle2 className="h-4 w-4" />,
            },
        ],
        caveats: [
            "원결제가 진행된 단말기와 같은 단말기에서 환불해야 자동 처리됩니다.",
            "다른 단말기에서 환불하는 경우 [수동 마감] 으로 진행하세요.",
        ],
    },
    {
        id: "zero",
        label: "제로페이",
        subtitle: "준비 중 — 테스트 후 문서 업데이트 예정.",
        mode: "info",
        steps: [
            {
                title: "정보 수집 중",
                description:
                    "제로페이 환불 절차는 실제 테스트 후 업데이트될 예정입니다. 현재는 네이버페이와 동일하게 자동 환불을 시도하거나, 실패 시 [수동 마감] 으로 진행해주세요.",
                icon: <AlertCircle className="h-4 w-4" />,
            },
        ],
    },
    {
        id: "toss",
        label: "토스페이",
        subtitle: "준비 중 — 테스트 후 문서 업데이트 예정.",
        mode: "info",
        steps: [
            {
                title: "정보 수집 중",
                description:
                    "토스페이 환불 절차(MONEY / CARD / ACCOT 결제수단별 차이) 는 실제 테스트 후 업데이트될 예정입니다.",
                icon: <AlertCircle className="h-4 w-4" />,
            },
        ],
    },
    {
        id: "etc",
        label: "기타 페이",
        subtitle: "SSG페이/페이코/알리페이/위챗페이/서울페이 등은 실제 사용 후 업데이트됩니다.",
        mode: "info",
        steps: [
            {
                title: "정보 수집 중",
                description:
                    "실제 환불 시도 결과를 기반으로 절차가 추가될 예정입니다.\n현재 확인된 사실:\n- 삼성페이: 카드로 취급되어 자동 환불 가능성 높음\n- SSG페이: 머니 vs 카드 구분 필요 (카카오페이와 유사)\n- 알리/위챗: 원거래 승인번호 대신 주문번호로 취소",
                icon: <AlertCircle className="h-4 w-4" />,
            },
        ],
    },
];

function modeBadge(mode: PayGuide["mode"]) {
    if (mode === "auto") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> 자동 환불 가능
            </span>
        );
    }
    if (mode === "barcode") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                <Barcode className="h-3 w-3" /> 바코드 스캔 필요
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            <AlertCircle className="h-3 w-3" /> 정보 준비 중
        </span>
    );
}

export function PayRefundGuideModal({ open, onClose, initialTabId }: Props) {
    const [activeTabId, setActiveTabId] = useState<string>(initialTabId || GUIDES[0]!.id);

    if (!open) return null;

    const active = GUIDES.find((g) => g.id === activeTabId) || GUIDES[0]!;

    return createPortal(
        <div
            className="fixed inset-0 z-[10040] flex items-center justify-center bg-[#2A1F22]/60 backdrop-blur-[3px] p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-[920px] max-h-[92vh] rounded-2xl border border-[#F8DCE2] bg-white shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="border-b border-[#F8DCE2] bg-gradient-to-b from-[#FCF7F8] to-white px-6 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div>
                            <div className="text-[15px] font-extrabold text-[#5C2A35]">페이류 환불 방법</div>
                            <div className="mt-0.5 text-[11px] text-[#8B5A66]">
                                페이 서비스마다 환불 절차가 다릅니다. 탭을 선택해 확인하세요.
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#F8DCE2] bg-white text-[#8B3F50] hover:text-[#5C2A35] hover:bg-[#FCEBEF] hover:border-[#D27A8C]/40 transition-all shadow-sm"
                        title="닫기"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="border-b border-[#F8DCE2] bg-white px-3 shrink-0">
                    <div className="flex gap-1 overflow-x-auto no-scrollbar">
                        {GUIDES.map((g) => {
                            const isActive = g.id === activeTabId;
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => setActiveTabId(g.id)}
                                    className={`shrink-0 px-4 py-2.5 text-[12.5px] font-bold border-b-2 transition-colors ${
                                        isActive
                                            ? "border-[#D27A8C] text-[#5C2A35]"
                                            : "border-transparent text-[#8B5A66] hover:text-[#5C2A35] hover:bg-[#FCF7F8]"
                                    }`}
                                >
                                    {g.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Active tab content */}
                <div className="flex-1 overflow-y-auto px-6 py-5 bg-[#FDFAFB]">
                    <div className="mb-4 flex items-center gap-2">
                        <div className="text-[14px] font-extrabold text-[#5C2A35]">{active.label}</div>
                        {modeBadge(active.mode)}
                    </div>
                    <div className="mb-4 text-[12px] text-[#8B5A66] leading-relaxed">{active.subtitle}</div>

                    <div className="space-y-4">
                        {active.steps.map((step, idx) => (
                            <div
                                key={`${active.id}-step-${idx}`}
                                className="rounded-xl border border-[#F8DCE2] bg-white p-4 shadow-sm"
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <StepBullet n={idx + 1} size="lg" />
                                    <div className="inline-flex items-center gap-1.5 text-[#5C2A35] font-bold text-[13px]">
                                        {step.icon}
                                        {step.title}
                                    </div>
                                </div>
                                <div className={step.imageSrc ? "grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4 items-start" : ""}>
                                    <p className="text-[12.5px] text-[#3F2A30] leading-relaxed whitespace-pre-line">
                                        {step.description}
                                    </p>
                                    {step.imageSrc && (
                                        <div className="rounded-lg overflow-hidden border border-[#F4C7CE] bg-[#FCF7F8]">
                                            <img
                                                src={step.imageSrc}
                                                alt={step.imageAlt || step.title}
                                                className="w-full h-auto object-contain"
                                                onError={(e) => {
                                                    const target = e.currentTarget;
                                                    target.style.display = "none";
                                                    const fallback = target.nextElementSibling as HTMLElement | null;
                                                    if (fallback) fallback.style.display = "flex";
                                                }}
                                            />
                                            <div
                                                className="flex-col items-center justify-center p-6 text-[11px] text-[#8B5A66] text-center gap-1"
                                                style={{ display: "none" }}
                                            >
                                                <div className="font-bold">가이드 이미지 없음</div>
                                                <div className="font-mono text-[10px] break-all">{step.imageSrc}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {active.caveats && active.caveats.length > 0 && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[11.5px] text-amber-800 leading-relaxed">
                                <div className="font-bold mb-1">⚠ 주의사항</div>
                                <ul className="list-disc pl-5 space-y-0.5">
                                    {active.caveats.map((c, i) => (
                                        <li key={`${active.id}-caveat-${i}`}>{c}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-[#F8DCE2] px-6 py-3 bg-white flex justify-end shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 rounded-xl bg-[#D27A8C] px-5 text-[13px] font-extrabold text-white hover:bg-[#8B3F50] transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

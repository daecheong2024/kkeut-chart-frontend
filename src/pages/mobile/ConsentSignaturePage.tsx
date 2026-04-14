import React, { useRef, useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { consentService, type ConsentPublicData } from "../../services/consentService";

/**
 * 모바일 동의서 서명 페이지
 * 환자가 카카오톡 링크를 통해 접속하는 공개 페이지 (인증 불필요)
 * 경로: /m/consent/:token
 */
export default function ConsentSignaturePage() {
    const { token } = useParams<{ token: string }>();
    const sigRef = useRef<SignatureCanvas>(null);

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ConsentPublicData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [signatureEmpty, setSignatureEmpty] = useState(true);
    const [agreed, setAgreed] = useState(false);

    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                const res = await consentService.getByToken(token);
                setData(res);
                setAgreed(false);
                if (res.status === "Signed") {
                    setSubmitted(true);
                }
            } catch (err: any) {
                const msg = err?.response?.data?.error || "동의서를 불러올 수 없습니다.";
                setError(msg);
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const handleClear = () => {
        sigRef.current?.clear();
        setSignatureEmpty(true);
    };

    const handleEnd = () => {
        setSignatureEmpty(sigRef.current?.isEmpty() ?? true);
    };

    const handleSubmit = async () => {
        if (!token || !sigRef.current || sigRef.current.isEmpty()) return;

        setSubmitting(true);
        try {
            const dataUrl = sigRef.current.toDataURL("image/png");
            const result = await consentService.submitSignature(token, dataUrl);
            if (result.success) {
                setSubmitted(true);
            } else {
                setError(result.message);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || "서명 제출에 실패했습니다.");
        } finally {
            setSubmitting(false);
        }
    };

    const isStructured = useMemo(() => {
        const raw = String(data?.formBody || "").trim();
        if (!raw) return false;
        try { const p = JSON.parse(raw); return p && Array.isArray(p.sections); } catch { return false; }
    }, [data?.formBody]);

    const structuredBlocks = useMemo(() => {
        if (!isStructured) return [];
        try {
            const parsed = JSON.parse(data?.formBody || "{}");
            const sections: Array<{ key: string; blocks: any[] }> = parsed.sections || [];
            return sections.flatMap((s) => s.blocks || []);
        } catch { return []; }
    }, [isStructured, data?.formBody]);

    const resolvedFormBody = useMemo(() => {
        const raw = String(data?.formBody || "");
        if (!raw || isStructured) return "";
        return raw
            .replaceAll("{{patient_name}}", String(data?.patientName || ""))
            .replaceAll("{{today}}", new Date().toISOString().slice(0, 10));
    }, [data?.formBody, data?.patientName, isStructured]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="mt-4 text-sm text-gray-500">동의서를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
                    <div className="text-4xl mb-4">❌</div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2">오류</h2>
                    <p className="text-sm text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2">서명 완료</h2>
                    <p className="text-sm text-gray-600">동의서 서명이 완료되었습니다.<br />감사합니다.</p>
                    {data?.signedAt && (
                        <p className="text-xs text-gray-400 mt-3">
                            서명일: {new Date(data.signedAt).toLocaleString("ko-KR")}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
                <h1 className="text-lg font-extrabold text-slate-900 text-center">동의서 서명</h1>
                <p className="text-xs text-slate-500 text-center mt-0.5">{data?.patientName || "환자"} 님 본인 확인 후 서명</p>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-[720px] rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
                    <div className="border-b border-slate-300 bg-slate-50 px-5 py-5 text-center">
                        <div className="text-[10px] font-bold tracking-[0.2em] text-slate-500">INFORMED CONSENT</div>
                        <h2 className="mt-1 text-lg font-extrabold text-slate-900">{data?.formTitle || "동의서"}</h2>
                        <div className="mt-1 text-xs text-slate-500">아래 내용을 모두 읽고 동의 체크 후 서명해주세요.</div>
                    </div>

                    <div className="p-4">
                        <div className="grid grid-cols-2 border border-slate-200 text-[11px] text-slate-700">
                            <div className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1 font-bold">환자명</div>
                            <div className="border-b border-slate-200 px-2 py-1">{data?.patientName || "-"}</div>
                            <div className="border-r border-slate-200 bg-slate-50 px-2 py-1 font-bold">작성일</div>
                            <div className="px-2 py-1">{new Date().toLocaleDateString("ko-KR")}</div>
                        </div>

                        {isStructured ? (
                            <div className="mt-3 space-y-3">
                                {structuredBlocks.map((block: any) => (
                                    <div key={block.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                        {block.title && (
                                            <div className="text-[13px] font-bold text-slate-900 mb-2">
                                                {block.title}
                                                {block.required && <span className="text-rose-500 ml-1">*</span>}
                                            </div>
                                        )}
                                        {block.type === "text_content" && block.content && (
                                            <div className={`leading-relaxed whitespace-pre-wrap ${
                                                block.fontSize === "sm" ? "text-[12px]" : block.fontSize === "lg" ? "text-[16px]" : "text-[13px]"
                                            } ${block.fontWeight === "bold" ? "font-bold" : ""} ${
                                                block.color === "muted" ? "text-slate-500" : block.color === "danger" ? "text-red-600" : block.color === "primary" ? "text-rose-700" : "text-slate-800"
                                            }`}>
                                                {block.content}
                                            </div>
                                        )}
                                        {block.type === "date" && (
                                            <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-full" />
                                        )}
                                        {block.type === "text_chart" && (
                                            <div className="rounded-lg bg-slate-50 border border-dashed border-slate-300 px-3 py-2 text-[12px] text-slate-400 italic">
                                                {block.placeholder || "차트에서 입력된 내용이 표시됩니다."}
                                            </div>
                                        )}
                                        {block.type === "choice" && (
                                            <div className="space-y-1.5">
                                                {(block.options || []).map((opt: any) => (
                                                    <label key={opt.id} className="flex items-center gap-2 text-[13px] text-slate-800">
                                                        <input type={block.selectionType === "single" ? "radio" : "checkbox"} name={block.id} className="accent-rose-500" />
                                                        <span>{opt.label}</span>
                                                        {opt.hasNote && (
                                                            <input type="text" placeholder="비고" className="ml-2 flex-1 border-b border-slate-300 px-1 text-[12px] outline-none" />
                                                        )}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : resolvedFormBody ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                                <div
                                    className="prose prose-sm max-w-none text-slate-800 leading-relaxed"
                                    dangerouslySetInnerHTML={{
                                        __html: resolvedFormBody.includes("<")
                                            ? resolvedFormBody
                                            : `<p>${resolvedFormBody.replace(/\n/g, "<br/>")}</p>`,
                                    }}
                                />
                            </div>
                        ) : null}

                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold text-slate-800">확인 항목</div>
                            <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
                                <li>□ 시술의 목적, 과정, 예상반응, 주의사항에 대해 충분히 설명을 들었습니다.</li>
                                <li>□ 본인의 자발적인 의사로 동의하며, 추가 질의 기회를 보장받았습니다.</li>
                                <li>□ 서명 완료 후 동의서 사본 제공 요청이 가능함을 안내받았습니다.</li>
                            </ul>
                            <label className="mt-3 flex items-start gap-2 text-[11px] text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={(e) => setAgreed(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-300"
                                />
                                위 내용을 모두 확인하였고 동의합니다.
                            </label>
                        </div>

                        <div className="mt-3 rounded-xl border border-slate-300 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-slate-900">환자 서명</h3>
                                <button
                                    onClick={handleClear}
                                    className="text-xs text-violet-600 font-semibold hover:underline"
                                >
                                    지우기
                                </button>
                            </div>
                            <div className="border-2 border-dashed border-slate-200 rounded-xl overflow-hidden bg-white">
                                <SignatureCanvas
                                    ref={sigRef}
                                    onEnd={handleEnd}
                                    penColor="#0f172a"
                                    canvasProps={{
                                        className: "w-full",
                                        style: { width: "100%", height: 220, touchAction: "none" },
                                    }}
                                />
                            </div>
                            {signatureEmpty && (
                                <p className="text-xs text-slate-400 text-center mt-2">위 영역에 직접 서명해주세요.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white border-t border-slate-200 p-4 sticky bottom-0">
                <div className="mx-auto max-w-[720px]">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || signatureEmpty || !agreed}
                        className={`w-full py-3.5 rounded-xl text-white font-bold text-base transition-all ${submitting || signatureEmpty || !agreed
                            ? "bg-slate-300 cursor-not-allowed"
                            : "bg-violet-600 hover:bg-violet-700 active:scale-[0.98] shadow-lg shadow-violet-200"
                            }`}
                    >
                        {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                제출 중...
                            </span>
                        ) : (
                            "동의 및 서명 제출"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

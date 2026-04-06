import React, { useEffect, useState } from 'react';
import { X, Smartphone, QrCode, FileText, Check, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { consentService } from '../services/consentService';
import { documentationService, DocumentationResponse } from '../services/documentationService';

interface ConsentSendModalProps {
    isOpen: boolean;
    onClose: () => void;
    patient: { id: number; name: string; phone?: string };
    branchId: string;
    templates?: any[];
}

export default function ConsentSendModal({
    isOpen,
    onClose,
    patient,
    branchId,
}: ConsentSendModalProps) {
    const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ type: 'kakao' | 'qr'; success: boolean; message?: string; url?: string } | null>(null);
    const [availableTemplates, setAvailableTemplates] = useState<DocumentationResponse[]>([]);

    useEffect(() => {
        if (!isOpen) {
            setLoading(false);
            return;
        }
        setSelectedTemplateId(null);
        setLoading(false);
        setResult(null);

        documentationService.getAll({ isActive: true }).then((res) => {
            setAvailableTemplates(res.items);
        }).catch(() => {
            setAvailableTemplates([]);
        });
    }, [isOpen, patient?.id]);

    if (!isOpen) return null;

    const selectedTemplate = availableTemplates.find((t) => t.id === selectedTemplateId);

    const normalizeSignatureUrl = (rawUrl?: string) => {
        const value = String(rawUrl || "").trim();
        if (!value) return "";
        if (/^https?:\/\//i.test(value)) return value;
        if (value.startsWith("/")) return `${window.location.origin}${value}`;
        return `${window.location.origin}/${value}`;
    };

    const handleSendKakao = async () => {
        if (selectedTemplateId == null) return;
        setLoading(true);
        try {
            const res = await consentService.send(branchId, patient.id, String(selectedTemplateId));
            const signatureUrl = normalizeSignatureUrl(res.signatureUrl);
            setResult({
                type: 'kakao',
                success: true,
                message: res.notificationSent ? '알림톡이 발송되었습니다.' : '발송되었으나 알림톡 실패 (' + res.notificationResult + ')',
                url: signatureUrl
            });
        } catch (e: any) {
            setResult({
                type: 'kakao',
                success: false,
                message: e?.response?.data?.error || e.message
            });
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateQR = async () => {
        if (selectedTemplateId == null) return;
        setLoading(true);
        try {
            const res = await consentService.send(branchId, patient.id, String(selectedTemplateId));
            const signatureUrl = normalizeSignatureUrl(res.signatureUrl);
            setResult({
                type: 'qr',
                success: true,
                url: signatureUrl
            });
        } catch (e: any) {
            setResult({
                type: 'qr',
                success: false,
                message: e?.response?.data?.error || e.message
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-[500px] overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">동의서 받기</h2>
                        <p className="text-sm text-gray-500">{patient.name}님에게 동의서를 요청합니다.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto">
                    {!result ? (
                        <div className="space-y-6">
                            {/* Template Select */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">서식 선택</label>
                                <div className="grid gap-2">
                                    {availableTemplates.map((t) => (
                                        <div
                                            key={t.id}
                                            onClick={() => setSelectedTemplateId(t.id)}
                                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedTemplateId === t.id
                                                ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                                                : 'border-gray-200 hover:border-violet-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedTemplateId === t.id ? 'bg-violet-200 text-violet-700' : 'bg-gray-100 text-gray-500'}`}>
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1">
                                                <div className={`text-sm font-bold ${selectedTemplateId === t.id ? 'text-violet-900' : 'text-gray-900'}`}>{t.title}</div>
                                                <div className="text-xs text-gray-500">{t.remarks || t.contentType}</div>
                                            </div>
                                            {selectedTemplateId === t.id && <Check className="w-4 h-4 text-violet-600" />}
                                        </div>
                                    ))}
                                    {availableTemplates.length === 0 && (
                                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
                                            사용 가능한 동의서 서식이 없습니다.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                                <button
                                    onClick={handleSendKakao}
                                    disabled={selectedTemplateId == null || loading || !patient.phone}
                                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 group-hover:bg-yellow-200 transition-colors">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
                                    </div>
                                    <div className="text-center">
                                        <div className="text-sm font-bold text-gray-900">카카오톡 발송</div>
                                        <div className="text-xs text-gray-500">환자 폰으로 링크 전송</div>
                                    </div>
                                </button>

                                <button
                                    onClick={handleGenerateQR}
                                    disabled={selectedTemplateId == null || loading}
                                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-200 transition-colors">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                                    </div>
                                    <div className="text-center">
                                        <div className="text-sm font-bold text-gray-900">태블릿 서명</div>
                                        <div className="text-xs text-gray-500">QR 코드로 바로 열기</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-6 animate-in zoom-in-50 duration-200">
                            {result.success ? (
                                <div className="space-y-6">
                                    {result.type === 'qr' && result.url ? (
                                        <>
                                            <div className="mx-auto bg-white p-4 rounded-xl border-2 border-dashed border-gray-200 w-fit">
                                                <QRCodeSVG value={result.url} size={180} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">QR 코드를 스캔하세요</h3>
                                                <p className="text-sm text-gray-500">태블릿 카메라로 스캔하면 동의서가 열립니다.</p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                                                <Check className="w-8 h-8" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">발송 완료</h3>
                                                <p className="text-sm text-gray-500">{result.message}</p>
                                            </div>
                                        </>
                                    )}

                                    <button
                                        onClick={onClose}
                                        className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-bold transition-colors"
                                    >
                                        닫기
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                                        <X className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">오류 발생</h3>
                                        <p className="text-sm text-gray-500">{result.message}</p>
                                    </div>
                                    <button
                                        onClick={() => setResult(null)}
                                        className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-bold transition-colors"
                                    >
                                        다시 시도
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

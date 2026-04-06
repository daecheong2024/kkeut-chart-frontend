import React, { useState, useRef, useCallback } from 'react';
import { X, FileText, Stethoscope, Receipt, Download, Printer, ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { HospitalSettings } from '../types/settings';
import { PaymentRecord, paymentService } from '../services/paymentService';
import { generatePdf } from '../utils/generateDocumentPdf';
import MedicalCertificate from './documents/templates/MedicalCertificate';
import DiagnosisCertificate from './documents/templates/DiagnosisCertificate';
import DetailedBillStatement from './documents/templates/DetailedBillStatement';

type DocumentType = 'medical' | 'diagnosis' | 'bill';
type Step = 'select' | 'options' | 'preview';

interface DocumentIssuanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    patient: {
        id: number;
        name: string;
        sex: string;
        birthDate?: string;
        residentNumber?: string;
        address?: string;
        detailAddress?: string;
        phone?: string;
        chartNumber?: string;
    };
    visits: Array<{
        id: number;
        scheduledAt: string;
        memo?: string;
        category?: string;
    }>;
    paymentRecords: PaymentRecord[];
    hospital: HospitalSettings;
}

const DOCUMENT_TYPES = [
    {
        id: 'medical' as DocumentType,
        title: '진료확인서',
        desc: '본원에서 진료를 받았음을 확인하는 서류',
        icon: FileText,
        color: 'blue',
    },
    {
        id: 'diagnosis' as DocumentType,
        title: '진단서',
        desc: '의사의 진단 내용을 공식적으로 기재한 서류',
        icon: Stethoscope,
        color: 'emerald',
    },
    {
        id: 'bill' as DocumentType,
        title: '진료비 세부내역서',
        desc: '수납 항목의 상세 금액을 기재한 서류',
        icon: Receipt,
        color: 'violet',
    },
];

const PURPOSE_OPTIONS = ['보험청구용', '학교제출용', '직장제출용', '관공서제출용', '기타'];

const toDateOnly = (value?: string) => value?.split('T')[0] || '';

export default function DocumentIssuanceModal({
    isOpen,
    onClose,
    patient,
    visits,
    paymentRecords,
    hospital,
}: DocumentIssuanceModalProps) {
    const [step, setStep] = useState<Step>('select');
    const [docType, setDocType] = useState<DocumentType | null>(null);
    const [generating, setGenerating] = useState(false);

    // Options for 진료확인서
    const [purpose, setPurpose] = useState('보험청구용');
    const [selectedVisitIds, setSelectedVisitIds] = useState<Set<number>>(new Set());

    // Options for 진단서
    const [diagnosisName, setDiagnosisName] = useState('');
    const [opinion, setOpinion] = useState('');
    const [treatmentPlan, setTreatmentPlan] = useState('');

    // Options for 진료비 내역서
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return toDateOnly(d.toISOString());
    });
    const [dateTo, setDateTo] = useState(() => toDateOnly(new Date().toISOString()));
    const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<number>>(new Set());
    const [billRecords, setBillRecords] = useState<PaymentRecord[]>([]);
    const [billLoading, setBillLoading] = useState(false);

    const previewRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!isOpen) {
            setGenerating(false);
            return;
        }

        const now = new Date();
        const from = new Date(now);
        from.setMonth(from.getMonth() - 1);

        setStep('select');
        setDocType(null);
        setGenerating(false);
        setPurpose('보험청구용');
        setSelectedVisitIds(new Set());
        setDiagnosisName('');
        setOpinion('');
        setTreatmentPlan('');
        setDateFrom(toDateOnly(from.toISOString()));
        setDateTo(toDateOnly(now.toISOString()));
        setSelectedPaymentIds(new Set());
    }, [isOpen, patient?.id]);

    // Initialize selections when steps change or data loads
    React.useEffect(() => {
        if (step === 'options' && docType === 'medical') {
            // Default select all (or maybe none? User asked to select. Let's default to all for convenience but allow toggle)
            // User feedback "선택없이 무조건 전체 다 나오게되어있는데" implies they want control.
            // Let's default to ALL selected initially for convenience.
            setSelectedVisitIds(new Set(visits.slice(0, 20).map(v => v.id)));
        }
    }, [step, docType, visits]);

    // Fetch payment records from API when bill options step opens
    React.useEffect(() => {
        if (step === 'options' && docType === 'bill') {
            setBillLoading(true);
            paymentService.getPaymentRecords(patient.id)
                .then((records) => {
                    setBillRecords(records);
                    const filtered = records.filter(r => {
                        const d = toDateOnly(r.paidAt);
                        return d >= dateFrom && d <= dateTo;
                    });
                    setSelectedPaymentIds(new Set(filtered.map(r => r.id)));
                })
                .finally(() => setBillLoading(false));
        }
    }, [step, docType, patient.id]);

    // Update payment selection when date range changes
    React.useEffect(() => {
        if (step === 'options' && docType === 'bill' && billRecords.length > 0) {
            const filtered = billRecords.filter(r => {
                const d = toDateOnly(r.paidAt);
                return d >= dateFrom && d <= dateTo;
            });
            setSelectedPaymentIds(new Set(filtered.map(r => r.id)));
        }
    }, [dateFrom, dateTo, step, docType, billRecords]);

    if (!isOpen) return null;

    const fullAddress = [patient.address, patient.detailAddress].filter(Boolean).join(' ');

    const patientData = {
        name: patient.name,
        sex: patient.sex,
        birthDate: patient.birthDate,
        residentNumber: patient.residentNumber,
        address: fullAddress,
        phone: patient.phone,
        chartNumber: patient.chartNumber,
    };

    const issueDate = new Date();

    const handleSelectDoc = (type: DocumentType) => {
        setDocType(type);
        setStep('options');
    };

    const handlePreview = () => {
        setStep('preview');
    };

    const handleBack = () => {
        if (step === 'preview') setStep('options');
        else if (step === 'options') { setStep('select'); setDocType(null); }
    };

    const handleReset = () => {
        setStep('select');
        setDocType(null);
        setDiagnosisName('');
        setOpinion('');
        setTreatmentPlan('');
        setPurpose('보험청구용');
    };

    const handleGenerate = async (mode: 'download' | 'print') => {
        if (!previewRef.current) return;
        setGenerating(true);
        try {
            const docTitle = DOCUMENT_TYPES.find(d => d.id === docType)?.title || '서류';
            const filename = `${docTitle}_${patient.name}_${toDateOnly(issueDate.toISOString())}.pdf`;
            await generatePdf(previewRef.current, filename, mode);
        } catch (e) {
            console.error('PDF generation failed:', e);
            alert('PDF 생성에 실패했습니다.');
        } finally {
            setGenerating(false);
        }
    };

    // Filter relevant records for bill by date range, exclude refunded/cancelled
    const filteredRecords = billRecords.filter(r => {
        const d = toDateOnly(r.paidAt);
        const status = String(r.status || '').trim().toLowerCase();
        return d >= dateFrom && d <= dateTo && status !== 'refunded' && status !== 'cancelled';
    });

    const renderDocumentPreview = () => {
        if (!docType) return null;

        switch (docType) {
            case 'medical':
                return (
                    <MedicalCertificate
                        hospital={hospital}
                        patient={patientData}
                        visits={visits.filter(v => selectedVisitIds.has(v.id))}
                        purpose={purpose}
                        issueDate={issueDate}
                    />
                );
            case 'diagnosis':
                return (
                    <DiagnosisCertificate
                        hospital={hospital}
                        patient={patientData}
                        diagnosisName={diagnosisName}
                        opinion={opinion}
                        treatmentPlan={treatmentPlan}
                        issueDate={issueDate}
                    />
                );
            case 'bill':
                return (
                    <DetailedBillStatement
                        hospital={hospital}
                        patient={patientData}
                        records={filteredRecords.filter(r => selectedPaymentIds.has(r.id))}
                        dateRange={{ from: dateFrom, to: dateTo }}
                        issueDate={issueDate}
                    />
                );
        }
    };

    const colorMap: Record<string, { bg: string; border: string; text: string; hoverBg: string; iconBg: string }> = {
        blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', hoverBg: 'hover:bg-blue-100', iconBg: 'bg-blue-100' },
        emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', hoverBg: 'hover:bg-emerald-100', iconBg: 'bg-emerald-100' },
        violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', hoverBg: 'hover:bg-violet-100', iconBg: 'bg-violet-100' },
    };
    const defaultColor = colorMap.blue!;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-[1120px] max-w-[96vw] max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-3">
                        {step !== 'select' && (
                            <button
                                onClick={handleBack}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        )}
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">
                                {step === 'select' && '서류 발급'}
                                {step === 'options' && DOCUMENT_TYPES.find(d => d.id === docType)?.title}
                                {step === 'preview' && '미리보기'}
                            </h2>
                            <p className="text-xs text-gray-500">
                                {patient.name} ({patient.birthDate || '-'})
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Step 1: Select Document Type */}
                    {step === 'select' && (
                        <div className="p-6 grid gap-4">
                            {DOCUMENT_TYPES.map(doc => {
                                const c = colorMap[doc.color] || defaultColor;
                                const Icon = doc.icon;
                                return (
                                    <button
                                        key={doc.id}
                                        onClick={() => handleSelectDoc(doc.id)}
                                        className={`flex items-center gap-4 p-5 rounded-xl border-2 ${c.border} ${c.bg} ${c.hoverBg} transition-all text-left group`}
                                    >
                                        <div className={`w-12 h-12 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
                                            <Icon className={`w-6 h-6 ${c.text}`} />
                                        </div>
                                        <div className="flex-1">
                                            <div className={`text-base font-bold ${c.text}`}>{doc.title}</div>
                                            <div className="text-sm text-gray-500 mt-0.5">{doc.desc}</div>
                                        </div>
                                        <div className="text-gray-300 group-hover:text-gray-500 transition-colors">→</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Step 2: Options */}
                    {step === 'options' && docType === 'medical' && (
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">용도 선택</label>
                                <div className="flex flex-wrap gap-2">
                                    {PURPOSE_OPTIONS.map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setPurpose(p)}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${purpose === p
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="text-xs font-bold text-gray-500">진료 이력 ({visits.length}건)</div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setSelectedVisitIds(new Set(visits.slice(0, 20).map(v => v.id)))}
                                            className="text-[10px] text-gray-500 hover:text-blue-600 bg-white border rounded px-1.5 py-0.5"
                                        >
                                            전체선택
                                        </button>
                                        <button
                                            onClick={() => setSelectedVisitIds(new Set())}
                                            className="text-[10px] text-gray-500 hover:text-red-600 bg-white border rounded px-1.5 py-0.5"
                                        >
                                            선택해제
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-[200px] overflow-y-auto space-y-1">
                                    {visits.length === 0 ? (
                                        <div className="text-sm text-gray-400">내원 이력이 없습니다.</div>
                                    ) : (
                                        visits.slice(0, 20).map((v, i) => (
                                            <div
                                                key={v.id || i}
                                                className={`flex items-center gap-2 p-2 rounded cursor-pointer border ${selectedVisitIds.has(v.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent hover:bg-gray-50'}`}
                                                onClick={() => {
                                                    const newSet = new Set(selectedVisitIds);
                                                    if (newSet.has(v.id)) newSet.delete(v.id);
                                                    else newSet.add(v.id);
                                                    setSelectedVisitIds(newSet);
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedVisitIds.has(v.id)}
                                                    readOnly
                                                    className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <div className="flex-1 flex gap-2 text-xs text-gray-600">
                                                    <span className="text-gray-400 w-16 shrink-0 font-mono">{new Date(v.scheduledAt).toLocaleDateString('ko-KR')}</span>
                                                    <span className="font-bold">{v.category || '-'}</span>
                                                    {v.memo && <span className="text-gray-400 truncate">({v.memo})</span>}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'options' && docType === 'diagnosis' && (
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">진단명 (병명) <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={diagnosisName}
                                    onChange={e => setDiagnosisName(e.target.value)}
                                    placeholder="예: 경추 추간판 장애"
                                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">소견</label>
                                <textarea
                                    value={opinion}
                                    onChange={e => setOpinion(e.target.value)}
                                    rows={5}
                                    placeholder="환자의 상태 및 진단 소견을 입력하세요..."
                                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">향후 치료 의견</label>
                                <textarea
                                    value={treatmentPlan}
                                    onChange={e => setTreatmentPlan(e.target.value)}
                                    rows={3}
                                    placeholder="향후 치료 계획 및 의견을 입력하세요..."
                                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                />
                            </div>
                        </div>
                    )}

                    {step === 'options' && docType === 'bill' && (
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">조회 기간</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={e => setDateFrom(e.target.value)}
                                        className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
                                    />
                                    <span className="text-gray-400">~</span>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={e => setDateTo(e.target.value)}
                                        className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
                                    />
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="text-xs font-bold text-gray-500">
                                        {billLoading ? '수납 내역 조회 중...' : `기간 내 수납 내역 (${filteredRecords.length}건)`}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setSelectedPaymentIds(new Set(filteredRecords.map(r => r.id)))}
                                            className="text-[10px] text-gray-500 hover:text-blue-600 bg-white border rounded px-1.5 py-0.5"
                                        >
                                            전체선택
                                        </button>
                                        <button
                                            onClick={() => setSelectedPaymentIds(new Set())}
                                            className="text-[10px] text-gray-500 hover:text-red-600 bg-white border rounded px-1.5 py-0.5"
                                        >
                                            선택해제
                                        </button>
                                    </div>
                                </div>
                                {filteredRecords.length === 0 ? (
                                    <div className="text-sm text-gray-400 py-2">해당 기간의 수납 내역이 없습니다.</div>
                                ) : (
                                    <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                                        {filteredRecords.map((r, i) => (
                                            <div
                                                key={r.id || i}
                                                className={`flex justify-between items-center text-xs p-2 rounded cursor-pointer border ${selectedPaymentIds.has(r.id) ? 'bg-violet-50 border-violet-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}
                                                onClick={() => {
                                                    const newSet = new Set(selectedPaymentIds);
                                                    if (newSet.has(r.id)) newSet.delete(r.id);
                                                    else newSet.add(r.id);
                                                    setSelectedPaymentIds(newSet);
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPaymentIds.has(r.id)}
                                                        readOnly
                                                        className="w-3 h-3 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                                    />
                                                    <span className="text-gray-500 font-mono">{new Date(r.paidAt).toLocaleDateString('ko-KR')}</span>
                                                </div>
                                                <span className={`font-bold ${selectedPaymentIds.has(r.id) ? 'text-violet-700' : 'text-gray-700'}`}>{r.totalAmount.toLocaleString()}원</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Preview */}
                    {step === 'preview' && (
                        <div className="p-6">
                            <div className="bg-gray-100 rounded-xl p-6 overflow-auto max-h-[65vh]">
                                <div className="mx-auto shadow-lg" ref={previewRef} style={{ width: 'fit-content' }}>
                                    {renderDocumentPreview()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center shrink-0">
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        처음으로
                    </button>
                    <div className="flex gap-2">
                        {step === 'options' && (
                            <button
                                onClick={handlePreview}
                                disabled={docType === 'diagnosis' && !diagnosisName.trim()}
                                className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Eye className="w-4 h-4" />
                                미리보기
                            </button>
                        )}
                        {step === 'preview' && (
                            <>
                                <button
                                    onClick={() => handleGenerate('download')}
                                    disabled={generating}
                                    className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    PDF 다운로드
                                </button>
                                <button
                                    onClick={() => handleGenerate('print')}
                                    disabled={generating}
                                    className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                >
                                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                                    인쇄하기
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

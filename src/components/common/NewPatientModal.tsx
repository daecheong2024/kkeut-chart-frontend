import React, { useState, useEffect } from "react";
import { X, ChevronRight, Info, Check } from "lucide-react";
import DaumPostcode from 'react-daum-postcode';
import { FamilyAddModal } from "./FamilyAddModal";
import { IntroducerAddModal } from "./IntroducerAddModal";
import { chartConfigService } from "../../services/chartConfigService";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { resolveActiveBranchId } from "../../utils/branch";

interface NewPatientModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: {
        name?: string;
        phone?: string;
        dob?: string;
        sex?: string;
        tags?: string[];
        zipcode?: string;
        address?: string;
        detailAddress?: string;
        email?: string;
        emergencyPhone?: string;
        isTaxDataAgree?: boolean;
    };
    mode?: 'create' | 'edit';
    onConfirm?: (data: any) => Promise<void>;
}

export function NewPatientModal({ isOpen, onClose, initialData, onConfirm, mode = 'create' }: NewPatientModalProps) {
    const [form, setForm] = useState({
        name: "",
        id1: "",
        id2: "",
        noId: false,
        phone: "",
        emergencyPhone: "",
        zipcode: "",
        address: "",
        detailAddress: "",
        email: "",
        sex: "M", // Default
        tags: [] as string[],
        agreedRequired: true,
        agreedOptional: true,
        refusedTax: false,
        checkInAfterRegister: true,
    });

    const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [isFamilyAddOpen, setIsFamilyAddOpen] = useState(false);
    const [familyMembers, setFamilyMembers] = useState<any[]>([]);
    const [isIntroducerOpen, setIsIntroducerOpen] = useState(false);
    const [introducer, setIntroducer] = useState<any>(null);

    const { settings } = useSettingsStore();

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const branchId = resolveActiveBranchId("");
                if (!branchId) return;
                const config = await chartConfigService.get(branchId);
                if (config && config.patientTags) {
                    setAvailableTags(config.patientTags.map((t: any) => typeof t === 'string' ? t : t.name));
                }
            } catch (error) {
                console.error("Failed to load chart config:", error);
            }
        };

        if (isOpen) {
            fetchConfig();
        }
    }, [isOpen, settings.activeBranchId]);

    useEffect(() => {
        if (!isOpen) return;
        // Clear nested modal/dropdown/search residues when reopening.
        setIsPostcodeOpen(false);
        setIsTagOpen(false);
        setTagSearch("");
        setViewingTerm(null);
        setIsFamilyAddOpen(false);
        setIsIntroducerOpen(false);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && initialData) {
            let id1 = "";
            let id2 = "";
            let sex = initialData.sex || "M";

            try {
                if (initialData.dob && typeof initialData.dob === 'string') {
                    const parts = initialData.dob.split('-');
                    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                        id1 = parts[0].slice(2) + parts[1] + parts[2];
                        const year = parseInt(parts[0]);

                        if (initialData.sex) {
                            const isMale = initialData.sex === 'M';
                            if (year < 2000) id2 = isMale ? '1******' : '2******';
                            else id2 = isMale ? '3******' : '4******';
                        }
                    }
                }
            } catch (err) {
                console.error("Error parsing initialData:", err);
            }

            setForm(prev => ({
                ...prev,
                name: initialData.name || "",
                phone: initialData.phone || "",
                id1: id1 || "",
                id2: id2 || "",
                sex: sex,
                tags: Array.isArray(initialData.tags) ? initialData.tags : [],
                emergencyPhone: initialData.emergencyPhone || "",
                zipcode: initialData.zipcode || "",
                address: initialData.address || "",
                detailAddress: initialData.detailAddress || "",
                email: initialData.email || "",
                refusedTax: initialData.isTaxDataAgree === false,
            }));
        } else if (isOpen) {
            setForm({
                name: "",
                id1: "",
                id2: "",
                noId: false,
                phone: "",
                emergencyPhone: "",
                zipcode: "",
                address: "",
                detailAddress: "",
                email: "",
                sex: "M",
                tags: [],
                agreedRequired: true,
                agreedOptional: true,
                refusedTax: false,
                checkInAfterRegister: true,
            });
            setFamilyMembers([]);
            setIntroducer(null);
        }
    }, [isOpen, initialData]);

    const [isTagOpen, setIsTagOpen] = useState(false);
    const [tagSearch, setTagSearch] = useState("");
    const [viewingTerm, setViewingTerm] = useState<{ title: string; content: string } | null>(null);

    // ... (useEffect omitted, logic preserved in previous block) ...

    const handleCompletePostcode = (data: any) => {
        let fullAddress = data.address;
        let extraAddress = '';

        if (data.addressType === 'R') {
            if (data.bname !== '') {
                extraAddress += data.bname;
            }
            if (data.buildingName !== '') {
                extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
            }
            fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
        }

        setForm(prev => ({
            ...prev,
            zipcode: data.zonecode,
            address: fullAddress
        }));
        setIsPostcodeOpen(false);
    };

    const toggleTag = (tag: string) => {
        setForm(prev => {
            const newTags = prev.tags.includes(tag)
                ? prev.tags.filter(t => t !== tag)
                : [...prev.tags, tag];
            return { ...prev, tags: newTags };
        });
    };

    const filteredTags = availableTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()));

    const formatPhoneInput = (value: string) => {
        let digits = value.replace(/[^0-9]/g, "");
        if (digits.length > 11) digits = digits.slice(0, 11);
        if (digits.length >= 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
        if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
        return digits;
    };

    const openTermDetail = (e: React.MouseEvent, type: 'required' | 'optional') => {
        e.stopPropagation();
        if (type === 'required') {
            setViewingTerm({
                title: "개인정보 수집 · 이용 동의",
                content: "개인정보 수집 및 이용에 대한 상세 내용입니다..." // Simplified for brevity or restore full text if needed
            });
        } else {
            setViewingTerm({
                title: "마케팅 정보 수신 동의",
                content: "마케팅 정보 수신에 대한 상세 내용입니다..."
            });
        }
    };

    const handleSubmit = async () => {
        if (!form.name || !form.phone) {
            alert("이름과 연락처는 필수항목입니다.");
            return;
        }
        if (!form.agreedRequired) {
            alert("필수 약관에 동의해야 합니다.");
            return;
        }

        let calculatedBirthDate = "";

        if (form.id1 && form.id1.length === 6 && form.id2 && form.id2.length >= 1) {
            const yy = form.id1.substring(0, 2);
            const mm = form.id1.substring(2, 4);
            const dd = form.id1.substring(4, 6);
            const genderDigit = form.id2.charAt(0);

            let prefix = "19";
            if (genderDigit === '3' || genderDigit === '4') {
                prefix = "20";
            } else if (genderDigit === '9' || genderDigit === '0') {
                prefix = "18";
            }

            calculatedBirthDate = `${prefix}${yy}-${mm}-${dd}`;
        }

        if (onConfirm) {
            await onConfirm({
                ...form,
                birthDate: calculatedBirthDate,
                sex: form.sex,
                isTaxDataAgree: !form.refusedTax,
                familyMembers: [],
                introducer: null
            });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[900px] h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded-full">
                            <span className="sr-only">Icon</span>
                            <Info className="w-5 h-5 text-gray-500" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">{mode === 'edit' ? '환자 정보 수정' : '신규환자등록'}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-8">
                    {/* Basic Info */}
                    <div className="mb-8">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <span className="w-1 h-4 bg-gray-900 rounded-full"></span>
                                기본정보
                            </h3>
                            <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                                필수: 환자명, 연락처, 주민등록번호/성별
                            </span>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                            <div className="grid grid-cols-12 gap-4">
                                <div className="col-span-4 space-y-1">
                                    <label className="text-xs font-semibold text-gray-500">환자명 <span className="text-rose-500">*</span></label>
                                    <input
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                        placeholder="환자명을 입력하세요"
                                    />
                                </div>

                                <div className="col-span-4 space-y-1">
                                    <label className="text-xs font-semibold text-gray-500">연락처 <span className="text-rose-500">*</span></label>
                                    <input
                                        value={form.phone}
                                        onChange={e => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                        placeholder="010-0000-0000"
                                    />
                                </div>

                                <div className="col-span-4 space-y-1">
                                    <label className="text-xs font-semibold text-gray-500">비상연락처</label>
                                    <input
                                        value={form.emergencyPhone}
                                        onChange={e => setForm({ ...form, emergencyPhone: formatPhoneInput(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-500 transition-all"
                                        placeholder="선택 사항"
                                    />
                                </div>

                                <div className="col-span-6 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-gray-500">주민등록번호 / 성별 <span className="text-rose-500">*</span></label>
                                        <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                                            <input
                                                type="checkbox"
                                                checked={form.noId}
                                                onChange={() => setForm(prev => ({ ...prev, noId: !prev.noId, id1: "", id2: "" }))}
                                                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                            />
                                            주민번호 미입력
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={form.id1}
                                            onChange={e => {
                                                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                                setForm(prev => ({ ...prev, id1: val }));
                                                if (val.length === 6) {
                                                    const nextInput = document.getElementById('id2');
                                                    nextInput?.focus();
                                                }
                                            }}
                                            disabled={form.noId}
                                            className="w-[112px] px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-500 transition-all text-center tracking-widest disabled:bg-gray-50 disabled:opacity-60"
                                            placeholder="앞 6자리"
                                        />
                                        <span className="text-gray-300">-</span>
                                        <input
                                            id="id2"
                                            type="text"
                                            value={form.id2}
                                            onChange={e => {
                                                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 7);
                                                let newSex = form.sex;
                                                if (val.length >= 1) {
                                                    const digit = val.charAt(0);
                                                    if (['1', '3', '5', '7'].includes(digit)) newSex = "M";
                                                    else if (['2', '4', '6', '8'].includes(digit)) newSex = "F";
                                                }
                                                setForm(prev => ({ ...prev, id2: val, sex: newSex }));
                                            }}
                                            disabled={form.noId}
                                            className="w-[112px] px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-500 transition-all text-center tracking-widest disabled:bg-gray-50 disabled:opacity-60"
                                            placeholder="뒤 7자리"
                                        />
                                        <div className="flex bg-slate-100 rounded-xl p-1 ml-1">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, sex: 'M' })}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.sex === 'M' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                남
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, sex: 'F' })}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.sex === 'F' ? 'bg-white text-rose-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                여
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-3 space-y-1">
                                    <label className="text-xs font-semibold text-gray-500">이메일</label>
                                    <input
                                        value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-500 transition-all"
                                        placeholder="user@example.com"
                                    />
                                </div>

                                <div className="col-span-3 space-y-1 relative">
                                    <label className="text-xs font-semibold text-gray-500 flex items-center justify-between">
                                        환자 태그
                                        <button onClick={() => setIsTagOpen(true)} className="text-violet-600 hover:text-violet-700 text-[11px] font-medium">+ 태그 관리</button>
                                    </label>
                                    <div
                                        className="w-full min-h-[42px] px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-sm flex flex-wrap gap-1.5 cursor-pointer"
                                        onClick={() => setIsTagOpen(true)}
                                    >
                                        {form.tags.length === 0 ? (
                                            <span className="text-gray-400 text-sm px-2 py-1">태그 선택</span>
                                        ) : (
                                            form.tags.map(tag => (
                                                <span key={tag} className="px-2 py-1 bg-[#E8EAF6] text-[#3F51B5] rounded-lg text-xs font-semibold flex items-center gap-1">
                                                    {tag}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleTag(tag);
                                                        }}
                                                        className="hover:text-violet-900"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
                                <label className="mb-2 block text-xs font-semibold text-gray-500">주소</label>
                                <div className="flex gap-2">
                                    <input
                                        value={form.zipcode}
                                        readOnly
                                        className="w-28 px-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-sm outline-none text-center text-gray-500"
                                        placeholder="우편번호"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setIsPostcodeOpen(true)}
                                        className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
                                    >
                                        주소 검색
                                    </button>
                                    <input
                                        value={form.address}
                                        readOnly
                                        className="flex-1 px-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-sm outline-none text-gray-500"
                                        placeholder="기본 주소"
                                    />
                                </div>
                                <input
                                    value={form.detailAddress}
                                    onChange={e => setForm({ ...form, detailAddress: e.target.value })}
                                    className="w-full mt-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-500 transition-all"
                                    placeholder="상세 주소를 입력하세요"
                                />
                            </div>
                        </div>
                    </div>

                        <div className="border-t border-gray-100 my-6"></div>

                        {/* Agreements */}
                        <div className="mb-8">
                            <h3 className="text-sm font-bold text-gray-900 mb-4 items-center gap-2 flex">
                                <span className="w-1 h-4 bg-gray-900 rounded-full"></span>
                                약관동의
                            </h3>
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${form.agreedRequired ? 'bg-[#3F51B5] border-[#3F51B5]' : 'bg-white border-gray-300'}`}>
                                        {form.agreedRequired && <Check size={14} className="text-white" />}
                                    </div>
                                    <input type="checkbox" className="hidden" checked={form.agreedRequired} onChange={() => setForm({ ...form, agreedRequired: !form.agreedRequired })} />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-gray-900">[필수]</span>
                                            <span className="text-sm text-gray-700">개인정보 수집 및 이용 동의</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">진료 및 예약 서비스를 위한 필수 동의항목입니다. (5년 보관)</p>
                                    </div>
                                    <button
                                        className="text-xs text-gray-400 underline hover:text-gray-600"
                                        onClick={(e) => openTermDetail(e, 'required')}
                                    >
                                        보기
                                    </button>
                                </label>

                                {/* Optional Agreements */}
                                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${form.agreedOptional ? 'bg-[#3F51B5] border-[#3F51B5]' : 'bg-white border-gray-300'}`}>
                                        {form.agreedOptional && <Check size={14} className="text-white" />}
                                    </div>
                                    <input type="checkbox" className="hidden" checked={form.agreedOptional} onChange={() => setForm({ ...form, agreedOptional: !form.agreedOptional })} />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-gray-500">[선택]</span>
                                            <span className="text-sm text-gray-700">마케팅 정보 수신 동의</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">이벤트 및 혜택 정보를 받아보실 수 있습니다.</p>
                                    </div>
                                    <button
                                        className="text-xs text-gray-400 underline hover:text-gray-600"
                                        onClick={(e) => openTermDetail(e, 'optional')}
                                    >
                                        보기
                                    </button>
                                </label>

                                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${form.refusedTax ? 'bg-[#3F51B5] border-[#3F51B5]' : 'bg-white border-gray-300'}`}>
                                        {form.refusedTax && <Check size={14} className="text-white" />}
                                    </div>
                                    <input type="checkbox" className="hidden" checked={form.refusedTax} onChange={() => setForm({ ...form, refusedTax: !form.refusedTax })} />
                                    <div className="flex-1">
                                        <span className="text-sm text-gray-700">세금계산서 발행 거부</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                    </div>

                    {/* Footer actions */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white" >
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">
                            취소
                        </button>
                        <div className="flex gap-2">
                            {mode !== 'edit' && (
                                <label className="flex items-center gap-2 px-3 text-sm text-gray-600 cursor-pointer select-none">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${form.checkInAfterRegister ? 'bg-[#3F51B5] border-[#3F51B5]' : 'bg-white border-gray-300'}`}>
                                        {form.checkInAfterRegister && <Check size={14} className="text-white" />}
                                    </div>
                                    <input type="checkbox" className="hidden" checked={form.checkInAfterRegister} onChange={() => setForm({ ...form, checkInAfterRegister: !form.checkInAfterRegister })} />
                                    등록 후 바로 접수대기
                                </label>
                            )}

                            <button
                                onClick={handleSubmit}
                                className="px-8 py-2.5 bg-[#3F51B5] hover:bg-[#303F9F] text-white font-bold text-sm rounded-xl shadow-[0_4px_12px_rgba(63,81,181,0.18)] transition-all flex items-center gap-2"
                            >
                                {mode === 'edit' ? '수정 저장' : '등록하기'}
                                <div className="w-0.5 h-3 bg-white/20"></div>
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>

                </div>

                {/* Modals & Postcode */}
                {
                    isPostcodeOpen && (
                        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50" onClick={() => setIsPostcodeOpen(false)}>
                            <div className="bg-white p-4 rounded-xl w-[500px]" onClick={e => e.stopPropagation()}>
                                <DaumPostcode onComplete={handleCompletePostcode} />
                            </div>
                        </div>
                    )
                }

                {/* Tag Selection Modal */}
                {
                    isTagOpen && (
                        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50" onClick={() => setIsTagOpen(false)}>
                            <div className="bg-white rounded-xl shadow-2xl w-[400px] overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="px-4 py-3 border-b flex justify-between items-center bg-gray-50">
                                    <span className="font-bold">태그 선택</span>
                                    <button onClick={() => setIsTagOpen(false)}><X size={18} /></button>
                                </div>
                                <div className="p-3 border-b">
                                    <input
                                        value={tagSearch}
                                        onChange={e => setTagSearch(e.target.value)}
                                        className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm outline-none"
                                        placeholder="태그 검색..."
                                        autoFocus
                                    />
                                </div>
                                <div className="max-h-[300px] overflow-y-auto p-2">
                                    {filteredTags.map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => toggleTag(tag)}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg text-sm flex items-center justify-between"
                                        >
                                            {tag}
                                            {form.tags.includes(tag) && <Check size={14} className="text-violet-600" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Family Add Modal */}
                {
                    isFamilyAddOpen && (
                        <FamilyAddModal
                            isOpen={isFamilyAddOpen}
                            onClose={() => setIsFamilyAddOpen(false)}
                            onConfirm={(member, relationship) => {
                                setFamilyMembers([...familyMembers, { ...member, relationship }]);
                                setIsFamilyAddOpen(false);
                            }}
                        />
                    )
                }

                {/* Introducer Modal */}
                {
                    isIntroducerOpen && (
                        <IntroducerAddModal
                            isOpen={isIntroducerOpen}
                            onClose={() => setIsIntroducerOpen(false)}
                            onConfirm={(person) => {
                                setIntroducer(person);
                                setIsIntroducerOpen(false);
                            }}
                        />
                    )
                }

                {/* Terms Detail Overlay */}
                {
                    viewingTerm && (
                        <div className="absolute inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
                            <div className="bg-white rounded-2xl shadow-xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                    <h3 className="font-bold text-gray-900">약관 전문</h3>
                                    <button onClick={() => setViewingTerm(null)} className="text-gray-400 hover:text-gray-600">
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5">
                                    <h4 className="font-bold text-gray-900 mb-3">{viewingTerm.title}</h4>
                                    <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                                        {viewingTerm.content}
                                    </div>
                                </div>
                                <div className="p-4 border-t border-gray-100 flex justify-end">
                                    <button
                                        onClick={() => setViewingTerm(null)}
                                        className="px-6 py-2 bg-[#3F51B5] text-white font-bold rounded-xl text-sm hover:bg-[#303F9F]"
                                    >
                                        확인
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

            </div>
    );
}

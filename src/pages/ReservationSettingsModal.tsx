
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Calendar as CalendarIcon, ChevronDown, Check, ChevronUp, Clock, Plus, Trash2, Users } from 'lucide-react';
import { useChartStore } from '../stores/useChartStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { CustomDatePicker } from '../components/common/CustomDatePicker';
import { format } from 'date-fns';
import type { ProcedureCategory } from '../types/settings';
import { useAlert } from '../components/ui/AlertDialog';

interface ReservationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: ProcedureCategory;
}

// Generate time slots (00:00 - 23:30)
const PROCESS_TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
    PROCESS_TIME_SLOTS.push(`${h.toString().padStart(2, '0')}:00`);
    PROCESS_TIME_SLOTS.push(`${h.toString().padStart(2, '0')}:30`);
}

const WEEKDAYS_KO = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'] as const;
const WEEKDAY_DAYS_R = ['\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08'] as const;
const WEEKEND_DAYS_R = ['\uD1A0', '\uC77C'] as const;

export const ReservationSettingsModal: React.FC<ReservationSettingsModalProps> = ({
    isOpen,
    onClose,
    initialData
}) => {
    const {
        procedureCategories,
        addCategory: addProcedureCategory,
        updateCategory: updateProcedureCategory,
        reorderCategories: reorderProcedureCategories,
        deleteCategory: deleteProcedureCategory
    } = useChartStore();

    const { showAlert, showConfirm } = useAlert();
    const { settings } = useSettingsStore();
    // Get visit purposes from chart config for dropdown
    const visitPurposeOptions = (settings.chartConfig?.visitPurposes || [])
        .filter(vp => vp.enabled)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(vp => vp.label);

    const [selectedCategory, setSelectedCategory] = useState<string | null>(initialData?.id || null);
    const [isPurposeOpen, setIsPurposeOpen] = useState(false);
    const [openTimeSelectDay, setOpenTimeSelectDay] = useState<string | null>(null);
    const [openBreakTimeSelectDay, setOpenBreakTimeSelectDay] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const timeSelectRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsPurposeOpen(false);
            }
            if (timeSelectRef.current && !timeSelectRef.current.contains(event.target as Node)) {
                setOpenTimeSelectDay(null);
                setOpenBreakTimeSelectDay(null);
            }
        };

        if (isPurposeOpen || openTimeSelectDay || openBreakTimeSelectDay) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isPurposeOpen, openTimeSelectDay, openBreakTimeSelectDay]);

    // Form State
    const [editForm, setEditForm] = useState<Omit<ProcedureCategory, 'id'> & { id?: string }>({
        name: '',
        type: '재진', // Default type
        reservationCount: 1,
        interval: 30,
        days: [...WEEKDAYS_KO],
        startDate: new Date().toISOString().split('T')[0],
        useEndDate: false,
        openTimePoint: '1주 전',
        isPartner: false, // Default value for new partner toggle
        dailyReservationCounts: undefined, // Initially not using daily counts
        breakHours: undefined
    });

    const orderedProcedureCategories = useMemo(() => {
        return [...(procedureCategories || [])]
            .map((category, index) => ({ category, index }))
            .sort((a, b) => {
                const ao = typeof a.category.order === 'number' ? a.category.order : Number.MAX_SAFE_INTEGER;
                const bo = typeof b.category.order === 'number' ? b.category.order : Number.MAX_SAFE_INTEGER;
                if (ao !== bo) return ao - bo;
                return a.index - b.index;
            })
            .map((entry) => entry.category);
    }, [procedureCategories]);

    // Handle selecting a category to edit
    const handleSelectCategory = (category: ProcedureCategory) => {
        setSelectedCategory(category.id);
        setEditForm({ ...category, days: category.days || [] });
    };

    const handleCreateNew = () => {
        setSelectedCategory('new');
        setEditForm({
            name: '',
            type: '재진',
            reservationCount: 1,
            interval: 30,
            days: [...WEEKDAYS_KO],
            startDate: new Date().toISOString().split('T')[0],
            useEndDate: false,
            openTimePoint: '1주 전',
            isPartner: false,
            dailyReservationCounts: undefined,
            breakHours: undefined
        });
    };

    const handleSave = () => {
        if (!editForm.name) {
            showAlert({ message: '스케줄명을 입력해주세요.', type: 'warning' });
            return;
        }

        const categoryData: ProcedureCategory = {
            id: editForm.id || crypto.randomUUID(),
            ...editForm,
            order: typeof editForm.order === 'number'
                ? editForm.order
                : (editForm.id
                    ? orderedProcedureCategories.find((c) => c.id === editForm.id)?.order
                    : orderedProcedureCategories.length + 1),
            // Ensure type is preserved or defaulted
            type: editForm.type || '재진'
        };

        if (editForm.id) {
            updateProcedureCategory(editForm.id, categoryData);
        } else {
            addProcedureCategory(categoryData);
        }

        // Reset and close specific edit view but keep modal open or go back to list?
        // For now, let's go back to list
        setSelectedCategory(null);
    };

    const handleDelete = () => {
        if (editForm.id) {
            deleteProcedureCategory(editForm.id);
            setSelectedCategory(null);
        }
    };

    const handleMoveCategory = (categoryId: string, direction: 'up' | 'down') => {
        const current = [...orderedProcedureCategories];
        const index = current.findIndex((category) => category.id === categoryId);
        if (index < 0) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= current.length) return;

        const next = [...current];
        const temp = next[index];
        next[index] = next[targetIndex]!;
        next[targetIndex] = temp!;
        reorderProcedureCategories(next);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-lg border border-[#C5CAE9] shadow-[0_4px_24px_rgba(0,0,0,0.12)] w-[1050px] h-[850px] flex flex-col overflow-hidden">
                {selectedCategory ? (
                    // --- DETAIL / EDIT / CREATE VIEW ---
                    <div className="flex flex-col h-full bg-white">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[#C5CAE9] bg-[#F8F9FD]">
                            <h2 className="text-lg font-bold text-[#242424]">
                                {selectedCategory === 'new' ? '시술 카테고리 등록' : '시술 카테고리 수정'}
                            </h2>
                            <button onClick={() => setSelectedCategory(null)} className="p-2 hover:bg-[#F0F0F0] rounded-lg transition-colors">
                                <X className="w-5 h-5 text-[#616161]" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto px-8 py-8">
                            <div className="flex gap-12 h-full">
                                {/* Left Column: Basic Info */}
                                <div className="w-[45%] space-y-8">
                                    <h3 className="text-base font-semibold text-[#242424] mb-6">기본정보</h3>

                                    <div className="space-y-4">
                                        <label className="block text-xs font-bold text-[#616161]">카테고리명*</label>
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="예: 백신접종, 일반진료"
                                            className="w-full px-4 py-3 text-sm border border-[#C5CAE9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3F51B5]/20 focus:border-[#3F51B5] transition-all text-[#242424] placeholder:text-[#9E9E9E]"
                                        />
                                    </div>

                                    {/* Category Field Removed */}

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-[#616161] mb-2">시작일*</label>
                                            <div className="flex items-center gap-3">
                                                <div className="relative flex-1">
                                                    <CustomDatePicker
                                                        value={editForm.startDate ? new Date(editForm.startDate) : new Date()}
                                                        onChange={(date) => setEditForm(prev => ({ ...prev, startDate: format(date, 'yyyy-MM-dd') }))}
                                                    />
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                                    <div
                                                        className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${!editForm.useEndDate ? 'bg-[#3F51B5] border border-[#3F51B5]' : 'bg-white border border-[#C5CAE9]'}`}
                                                        onClick={() => setEditForm(prev => ({ ...prev, useEndDate: !prev.useEndDate }))}
                                                    >
                                                        {!editForm.useEndDate && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                                                    </div>
                                                    <span className="text-sm text-[#242424] font-medium">종료일 없음</span>
                                                </label>
                                            </div>
                                        </div>

                                        {editForm.useEndDate && (
                                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                <label className="block text-xs font-bold text-[#616161] mb-2">종료일*</label>
                                                <div className="relative">
                                                    <CustomDatePicker
                                                        value={editForm.endDate ? new Date(editForm.endDate) : new Date()}
                                                        onChange={(date) => setEditForm(prev => ({ ...prev, endDate: format(date, 'yyyy-MM-dd') }))}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 설정 영역 (왼쪽 하단) */}
                                    <div className="pt-4 border-t border-[#C5CAE9] space-y-6">

                                    <div className="space-y-4" ref={dropdownRef}>
                                        <label className="block text-xs font-bold text-[#616161]">방문목적*</label>
                                        <div className="relative">
                                            <div
                                                onClick={() => setIsPurposeOpen(!isPurposeOpen)}
                                                className={`w-full px-4 py-3 text-sm border bg-white flex items-center justify-between cursor-pointer transition-all ${isPurposeOpen ? 'border-[#3F51B5] ring-2 ring-[#3F51B5]/20 rounded-t-xl rounded-b-none' : 'border-[#C5CAE9] rounded-lg'}`}
                                            >
                                                <div className="flex flex-wrap gap-2">
                                                    {(!editForm.visitPurpose || editForm.visitPurpose.length === 0) && (
                                                        <span className="text-[#9E9E9E]">선택해주세요</span>
                                                    )}
                                                    {(editForm.visitPurpose || []).map((purpose) => (
                                                        <span key={purpose} className="flex items-center gap-1 px-2 py-0.5 bg-[#3F51B5]/10 text-[#3F51B5] rounded text-xs font-bold ring-1 ring-[#3F51B5]/20/50">
                                                            {purpose}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditForm(prev => ({
                                                                        ...prev,
                                                                        visitPurpose: (prev.visitPurpose || []).filter((p: string) => p !== purpose)
                                                                    }));
                                                                }}
                                                                className="hover:text-[#303F9F]"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <ChevronDown className={`w-4 h-4 text-[#9E9E9E] transition-transform ${isPurposeOpen ? 'rotate-180' : ''}`} />
                                            </div>

                                            {/* Dropdown Menu */}
                                            {isPurposeOpen && (
                                                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-t-0 border-[#3F51B5] rounded-b-xl shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                                                    {visitPurposeOptions.map((item) => (
                                                        <div
                                                            key={item}
                                                            onClick={() => {
                                                                setEditForm(prev => {
                                                                    const current = prev.visitPurpose || [];
                                                                    if (current.includes(item)) {
                                                                        return { ...prev, visitPurpose: current.filter((p: string) => p !== item) };
                                                                    } else {
                                                                        return { ...prev, visitPurpose: [...current, item] };
                                                                    }
                                                                });
                                                            }}
                                                            className="flex items-center justify-between px-4 py-3 hover:bg-[#3F51B5]/10 cursor-pointer transition-colors"
                                                        >
                                                            <span className={`text-sm ${editForm.visitPurpose?.includes(item) ? 'font-bold text-[#3F51B5]' : 'text-[#242424]'}`}>
                                                                {item}
                                                            </span>
                                                            {editForm.visitPurpose?.includes(item) && (
                                                                <Check className="w-4 h-4 text-[#3F51B5]" />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-[#616161]">예약간격(분)</label>
                                            <div className="relative">
                                                <select
                                                    value={editForm.interval}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, interval: Number(e.target.value) }))}
                                                    className="w-full px-4 py-2.5 text-sm border border-[#C5CAE9] rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-[#3F51B5]/20 text-[#242424] bg-white"
                                                >
                                                    <option value={10}>10분</option>
                                                    <option value={15}>15분</option>
                                                    <option value={20}>20분</option>
                                                    <option value={30}>30분</option>
                                                    <option value={60}>60분</option>
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9E9E] pointer-events-none" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="block text-xs font-bold text-[#616161]">예약건 (수)</label>
                                                <label className="flex items-center gap-1 cursor-pointer">
                                                    <div
                                                        className={`w-6 h-3.5 rounded-full p-0.5 transition-colors ${editForm.dailyReservationCounts ? 'bg-[#3F51B5]' : 'bg-[#C5CAE9]'}`}
                                                        onClick={() => setEditForm(prev => ({
                                                            ...prev,
                                                            dailyReservationCounts: prev.dailyReservationCounts ? undefined : Object.fromEntries(
                                                                WEEKDAYS_KO.map((day) => [day, prev.reservationCount || 1])
                                                            ) as Record<string, number>
                                                        }))}
                                                    >
                                                        <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-sm transition-transform ${editForm.dailyReservationCounts ? 'translate-x-2.5' : 'translate-x-0'}`} />
                                                    </div>
                                                    <span className="text-[10px] text-[#616161]">요일별 설정</span>
                                                </label>
                                            </div>

                                            {!editForm.dailyReservationCounts ? (
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={editForm.reservationCount ?? ''}
                                                        onChange={(e) => {
                                                            const raw = e.target.value;
                                                            if (raw === '') {
                                                                setEditForm(prev => ({ ...prev, reservationCount: undefined as any }));
                                                            } else {
                                                                const num = Number(raw);
                                                                if (!Number.isNaN(num)) setEditForm(prev => ({ ...prev, reservationCount: num }));
                                                            }
                                                        }}
                                                        onBlur={() => {
                                                            if (editForm.reservationCount == null || editForm.reservationCount === ('' as any)) {
                                                                setEditForm(prev => ({ ...prev, reservationCount: 1 }));
                                                            }
                                                        }}
                                                        className="w-full px-4 pr-8 py-2.5 text-sm border border-[#C5CAE9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3F51B5]/20 focus:border-[#3F51B5] text-[#242424]"
                                                    />
                                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                                                        <button type="button" onClick={() => setEditForm(prev => ({ ...prev, reservationCount: (prev.reservationCount || 0) + 1 }))} className="text-[#9E9E9E] hover:text-[#616161]"><ChevronDown className="w-3 h-3 rotate-180" /></button>
                                                        <button type="button" onClick={() => setEditForm(prev => ({ ...prev, reservationCount: Math.max(0, (prev.reservationCount || 0) - 1) }))} className="text-[#9E9E9E] hover:text-[#616161]"><ChevronDown className="w-3 h-3" /></button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-full px-4 py-2.5 text-sm border border-[#C5CAE9] rounded-lg bg-[#F8F9FD] text-[#9E9E9E] cursor-not-allowed">
                                                    하단 참조
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="w-[1px] bg-[#F0F0F0] my-2" />

                                {/* Right Column: 파트너사 + 오픈요일 + 시간 설정 */}
                                <div className="flex-1 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-base font-semibold text-[#242424]">운영 설정</h3>
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <div
                                                className={`w-11 h-6 rounded-full p-1 cursor-pointer transition-colors ${editForm.isPartner ? 'bg-[#3F51B5]' : 'bg-[#C5CAE9]'}`}
                                                onClick={() => setEditForm(prev => ({ ...prev, isPartner: !prev.isPartner }))}
                                            >
                                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${editForm.isPartner ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </div>
                                            <span className="text-sm text-[#242424] font-medium">홈페이지 연동</span>
                                        </label>
                                    </div>

                                    {editForm.isPartner && (
                                        <>
                                            <div className="space-y-3">
                                                <label className="block text-xs font-bold text-[#616161]">오픈요일</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {WEEKDAYS_KO.map((day) => (
                                                        <button
                                                            key={day}
                                                            onClick={() => {
                                                                setEditForm(prev => {
                                                                    const currentDays = prev.days || [];
                                                                    const newDays = currentDays.includes(day)
                                                                        ? currentDays.filter((d: string) => d !== day)
                                                                        : [...currentDays, day];
                                                                    return { ...prev, days: newDays };
                                                                });
                                                            }}
                                                            className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${(editForm.days || []).includes(day)
                                                                ? 'bg-white border-[#3F51B5]/20 text-[#3F51B5] shadow-sm'
                                                                : 'bg-[#F8F9FD] border-transparent text-[#9E9E9E] hover:bg-white hover:border-[#C5CAE9]'
                                                                }`}
                                                        >
                                                            {day}
                                                            {(editForm.days || []).includes(day) && <span className="ml-1.5 text-[#3F51B5]/60">×</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* 평일/주말 일괄 + 시간 설정 */}
                                            <div className="pt-6 border-t border-[#C5CAE9]">
                                                <div className="flex gap-2 mb-4">
                                                    {[
                                                        { label: "평일 일괄", days: WEEKDAY_DAYS_R },
                                                        { label: "주말 일괄", days: WEEKEND_DAYS_R },
                                                    ].map(({ label, days }) => {
                                                        const refDay = days[0];
                                                        const refHours = editForm.operatingHours?.[refDay] || '09:00~18:00';
                                                        const [rs, re] = refHours.split('~');
                                                        return (
                                                            <div key={label} className="flex items-center gap-1.5 rounded-lg border border-[#C5CAE9] bg-white px-3 py-1.5">
                                                                <span className="text-xs font-bold text-[#3F51B5]">{label}</span>
                                                                <select
                                                                    className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                                                                    value={rs || '09:00'}
                                                                    onChange={(e) => {
                                                                        const newStart = e.target.value;
                                                                        setEditForm(prev => {
                                                                            const hours = { ...(prev.operatingHours || {}) };
                                                                            days.forEach(d => {
                                                                                const [, oldEnd] = (hours[d] || '09:00~18:00').split('~');
                                                                                hours[d] = `${newStart}~${newStart > (oldEnd || '18:00') ? newStart : oldEnd || '18:00'}`;
                                                                            });
                                                                            return { ...prev, operatingHours: hours };
                                                                        });
                                                                    }}
                                                                >
                                                                    {PROCESS_TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                                                                </select>
                                                                <span className="text-xs text-gray-400">~</span>
                                                                <select
                                                                    className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                                                                    value={re || '18:00'}
                                                                    onChange={(e) => {
                                                                        const newEnd = e.target.value;
                                                                        setEditForm(prev => {
                                                                            const hours = { ...(prev.operatingHours || {}) };
                                                                            days.forEach(d => {
                                                                                const [oldStart] = (hours[d] || '09:00~18:00').split('~');
                                                                                hours[d] = `${newEnd < (oldStart || '09:00') ? newEnd : oldStart || '09:00'}~${newEnd}`;
                                                                            });
                                                                            return { ...prev, operatingHours: hours };
                                                                        });
                                                                    }}
                                                                >
                                                                    {PROCESS_TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                                                                </select>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar" ref={timeSelectRef}>
                                                    {WEEKDAYS_KO.map((day) => {
                                                        const currentHours = editForm.operatingHours?.[day] || '09:00~18:00';
                                                        const [rawStart, rawEnd] = currentHours.split('~');
                                                        const startTime = rawStart || '09:00';
                                                        const endTime = rawEnd || '18:00';

                                                        return (
                                                            <div key={day} className="flex items-center gap-2 group p-2 hover:bg-[#F8F9FD] rounded-lg transition-colors relative">
                                                                <span className={`text-sm font-medium w-6 ${(editForm.days || []).includes(day) ? 'text-[#242424]' : 'text-[#9E9E9E]'}`}>{day}</span>

                                                                {/* Time Display & Popover Trigger */}
                                                                <div className="relative flex-1">
                                                                    <div
                                                                        onClick={() => {
                                                                            if ((editForm.days || []).includes(day)) {
                                                                                setOpenTimeSelectDay(openTimeSelectDay === day ? null : day);
                                                                            }
                                                                        }}
                                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none transition-all ${(editForm.days || []).includes(day)
                                                                            ? 'bg-white border-[#C5CAE9] hover:border-[#3F51B5]/40 hover:text-[#303F9F]'
                                                                            : 'bg-[#F8F9FD] border-[#C5CAE9] cursor-not-allowed'
                                                                            }`}
                                                                    >
                                                                        <span className={`text-xs ${(editForm.days || []).includes(day) ? 'text-[#616161]' : 'text-[#9E9E9E]'}`}>
                                                                            {currentHours}
                                                                        </span>
                                                                    </div>

                                                                    {/* Time Selection Popover */}
                                                                    {openTimeSelectDay === day && (
                                                                        <div className="absolute top-full left-0 z-50 mt-2 bg-white rounded-lg shadow-xl border border-[#C5CAE9] p-4 w-72 animate-in fade-in zoom-in-95 duration-200">
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <div className="flex-1 text-center text-xs font-bold text-[#616161]">시작시간</div>
                                                                                <div className="w-4"></div>
                                                                                <div className="flex-1 text-center text-xs font-bold text-[#616161]">종료시간</div>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="relative flex-1">
                                                                                    <select
                                                                                        value={startTime}
                                                                                        onChange={(e) => {
                                                                                            const newStart = e.target.value;

                                                                                            // Validation
                                                                                            let finalEnd = endTime;
                                                                                            if (newStart > endTime) {
                                                                                                finalEnd = newStart;
                                                                                            }

                                                                                            const newHours = `${newStart}~${finalEnd}`;
                                                                                            setEditForm(prev => ({
                                                                                                ...prev,
                                                                                                operatingHours: {
                                                                                                    ...prev.operatingHours,
                                                                                                    [day]: newHours
                                                                                                }
                                                                                            }));
                                                                                        }}
                                                                                        className="w-full pl-3 pr-8 py-2 text-sm border border-[#C5CAE9] rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-[#3F51B5]/20 text-[#242424] bg-white"
                                                                                    >
                                                                                        {PROCESS_TIME_SLOTS.map(t => (
                                                                                            <option key={`start-${t}`} value={t}>{t}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9E9E] pointer-events-none" />
                                                                                </div>
                                                                                <span className="text-[#9E9E9E] font-bold">~</span>
                                                                                <div className="relative flex-1">
                                                                                    <select
                                                                                        value={endTime}
                                                                                        onChange={(e) => {
                                                                                            const newEnd = e.target.value;

                                                                                            // Validation
                                                                                            let finalStart = startTime;
                                                                                            if (newEnd < startTime) {
                                                                                                finalStart = newEnd;
                                                                                            }

                                                                                            const newHours = `${finalStart}~${newEnd}`;
                                                                                            setEditForm(prev => ({
                                                                                                ...prev,
                                                                                                operatingHours: {
                                                                                                    ...prev.operatingHours,
                                                                                                    [day]: newHours
                                                                                                }
                                                                                            }));
                                                                                        }}
                                                                                        className="w-full pl-3 pr-8 py-2 text-sm border border-[#C5CAE9] rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-[#3F51B5]/20 text-[#242424] bg-white"
                                                                                    >
                                                                                        {PROCESS_TIME_SLOTS.map(t => (
                                                                                            <option key={`end-${t}`} value={t}>{t}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9E9E] pointer-events-none" />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Daily Count Input (Conditionally Rendered) */}
                                                                {editForm.dailyReservationCounts && (
                                                                    <div className={`w-20 px-2 py-2 rounded-lg border flex items-center justify-between ${(editForm.days || []).includes(day) ? 'bg-[#3F51B5]/10 border-[#3F51B5]/20' : 'bg-[#F8F9FD] border-[#C5CAE9] grayscale opacity-50'}`}>
                                                                        <span className="text-[10px] text-[#3F51B5] font-bold">건수</span>
                                                                        <input
                                                                            type="number"
                                                                            value={editForm.dailyReservationCounts[day as keyof typeof editForm.dailyReservationCounts]}
                                                                            onChange={(e) => {
                                                                                const val = Number(e.target.value);
                                                                                setEditForm(prev => ({
                                                                                    ...prev,
                                                                                    dailyReservationCounts: prev.dailyReservationCounts ? {
                                                                                        ...prev.dailyReservationCounts,
                                                                                        [day]: val
                                                                                    } : undefined
                                                                                }));
                                                                            }}
                                                                            className="w-10 text-right text-xs font-bold text-[#3F51B5] bg-transparent focus:outline-none"
                                                                            disabled={!(editForm.days || []).includes(day)}
                                                                        />
                                                                    </div>
                                                                )}

                                                                {/* Break Time */}
                                                                {(editForm.breakHours && editForm.breakHours[day]) ? (
                                                                    <div className="relative">
                                                                        <div
                                                                            onClick={() => {
                                                                                if ((editForm.days || []).includes(day)) {
                                                                                    setOpenBreakTimeSelectDay(openBreakTimeSelectDay === day ? null : day);
                                                                                    setOpenTimeSelectDay(null); // Close other popover if open
                                                                                }
                                                                            }}
                                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer ${(editForm.days || []).includes(day) ? 'bg-green-50 border-green-200' : 'bg-[#F8F9FD] border-[#C5CAE9] grayscale opacity-50'}`}
                                                                        >
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                                                            <span className="text-xs text-[#616161]">{editForm.breakHours[day]}</span>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setEditForm(prev => {
                                                                                        const newBreakHours = { ...prev.breakHours };
                                                                                        delete newBreakHours[day];
                                                                                        return { ...prev, breakHours: newBreakHours };
                                                                                    });
                                                                                }}
                                                                                className="ml-1 hover:bg-green-100 rounded p-0.5"
                                                                            >
                                                                                <X className="w-3 h-3 text-[#9E9E9E]" />
                                                                            </button>
                                                                        </div>

                                                                        {/* Break Time Selection Popover */}
                                                                        {openBreakTimeSelectDay === day && (
                                                                            <div className="absolute top-full right-0 z-50 mt-2 bg-white rounded-lg shadow-xl border border-[#C5CAE9] p-4 w-72 animate-in fade-in zoom-in-95 duration-200">
                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                    <div className="flex-1 text-center text-xs font-bold text-[#616161]">휴게 시작</div>
                                                                                    <div className="w-4"></div>
                                                                                    <div className="flex-1 text-center text-xs font-bold text-[#616161]">휴게 종료</div>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="relative flex-1">
                                                                                        <select
                                                                                            value={editForm.breakHours[day]?.split('~')[0]}
                                                                                            onChange={(e) => {
                                                                                                const newStart = e.target.value;
                                                                                                const currentEnd = editForm.breakHours?.[day]?.split('~')[1] || '14:00';

                                                                                                // Validation: Ensure Start <= End
                                                                                                let finalEnd = currentEnd;
                                                                                                if (newStart > currentEnd) {
                                                                                                    finalEnd = newStart;
                                                                                                }

                                                                                                setEditForm(prev => ({
                                                                                                    ...prev,
                                                                                                    breakHours: {
                                                                                                        ...prev.breakHours,
                                                                                                        [day]: `${newStart}~${finalEnd}`
                                                                                                    }
                                                                                                }));
                                                                                            }}
                                                                                            className="w-full pl-3 pr-8 py-2 text-sm border border-[#C5CAE9] rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-[#3F51B5]/20 text-[#242424] bg-white"
                                                                                        >
                                                                                            {PROCESS_TIME_SLOTS.map(t => (
                                                                                                <option key={`break-start-${t}`} value={t}>{t}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9E9E] pointer-events-none" />
                                                                                    </div>
                                                                                    <span className="text-[#9E9E9E] font-bold">~</span>
                                                                                    <div className="relative flex-1">
                                                                                        <select
                                                                                            value={editForm.breakHours[day]?.split('~')[1]}
                                                                                            onChange={(e) => {
                                                                                                const newEnd = e.target.value;
                                                                                                const currentStart = editForm.breakHours?.[day]?.split('~')[0] || '13:00';

                                                                                                // Validation: Ensure Start <= End
                                                                                                let finalStart = currentStart;
                                                                                                if (newEnd < currentStart) {
                                                                                                    finalStart = newEnd;
                                                                                                }

                                                                                                setEditForm(prev => ({
                                                                                                    ...prev,
                                                                                                    breakHours: {
                                                                                                        ...prev.breakHours,
                                                                                                        [day]: `${finalStart}~${newEnd}`
                                                                                                    }
                                                                                                }));
                                                                                            }}
                                                                                            className="w-full pl-3 pr-8 py-2 text-sm border border-[#C5CAE9] rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-[#3F51B5]/20 text-[#242424] bg-white"
                                                                                        >
                                                                                            {PROCESS_TIME_SLOTS.map(t => (
                                                                                                <option key={`break-end-${t}`} value={t}>{t}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9E9E] pointer-events-none" />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => {
                                                                            if ((editForm.days || []).includes(day)) {
                                                                                setEditForm(prev => ({
                                                                                    ...prev,
                                                                                    breakHours: {
                                                                                        ...prev.breakHours,
                                                                                        [day]: '13:00~14:00'
                                                                                    }
                                                                                }));
                                                                                setOpenBreakTimeSelectDay(day);
                                                                            }
                                                                        }}
                                                                        disabled={!(editForm.days || []).includes(day)}
                                                                        className={`flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed transition-all ${(editForm.days || []).includes(day)
                                                                            ? 'bg-[#F8F9FD] border-[#C5CAE9] text-[#9E9E9E] hover:bg-green-50 hover:text-green-600 hover:border-green-200'
                                                                            : 'bg-[#F8F9FD] border-[#C5CAE9] text-[#9E9E9E] cursor-not-allowed'
                                                                            }`}
                                                                    >
                                                                        <span className="text-xs">휴게시간 추가</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-5 border-t border-[#C5CAE9] bg-[#F8F9FD] flex justify-end gap-3 rounded-b-2xl">
                            <button
                                onClick={() => setSelectedCategory(null)}
                                className="px-6 py-2.5 text-sm font-medium text-[#616161] bg-white border border-[#C5CAE9] rounded-lg hover:bg-[#F8F9FD] transition-colors shadow-sm"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2.5 text-sm font-medium text-white bg-[#3F51B5] rounded-lg hover:bg-[#303F9F] transition-all shadow-md shadow-[#3F51B5]/15"
                            >
                                등록
                            </button>
                        </div>
                    </div>
                ) : (
                    // --- LIST VIEW ---
                    <div className="flex flex-col h-full">
                        {/* Header */}
                        <div className="flex items-center justify-between px-8 py-6 border-b border-[#C5CAE9]">
                            <h2 className="text-2xl font-bold text-[#242424]">예약/시술 카테고리 설정</h2>
                            <button onClick={onClose} className="p-2 hover:bg-[#F0F0F0] rounded-full transition-colors">
                                <X className="w-6 h-6 text-[#9E9E9E]" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto bg-[#F8F9FD]/50 p-8">
                            <div className="flex justify-between items-center mb-6">
                                <p className="text-sm text-[#616161]">총 {orderedProcedureCategories.length}개의 시술 카테고리가 등록되어 있습니다.</p>
                                <button
                                    onClick={handleCreateNew}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#3F51B5] text-white rounded-lg shadow-md shadow-[#3F51B5]/15 hover:bg-[#303F9F] transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="text-sm font-bold">새 시술 카테고리 만들기</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {orderedProcedureCategories.map((category, index) => (
                                    <div
                                        key={category.id}
                                        onClick={() => handleSelectCategory(category)}
                                        className="group bg-white p-6 rounded-lg border border-[#C5CAE9] hover:border-[#3F51B5]/30 shadow-sm hover:shadow-lg hover:shadow-[#3F51B5]/5 transition-all cursor-pointer relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-[#C5CAE9] group-hover:bg-[#3F51B5] transition-colors" />

                                        <div className="flex justify-between items-start mb-4 pl-2">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded bg-[#F0F0F0] text-[#616161] group-hover:bg-[#3F51B5]/10 group-hover:text-[#303F9F] transition-colors`}>
                                                        {category.type}
                                                    </span>
                                                    {category.isPartner && (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-600">
                                                            파트너
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="text-lg font-bold text-[#242424] group-hover:text-[#303F9F] transition-colors">{category.name}</h3>
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="flex flex-col gap-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleMoveCategory(category.id, 'up');
                                                        }}
                                                        disabled={index === 0}
                                                        className={`h-4 w-8 rounded-md border flex items-center justify-center transition-colors ${index === 0 ? 'cursor-not-allowed border-[#C5CAE9] bg-[#F8F9FD] text-[#9E9E9E]' : 'border-[#C5CAE9] bg-white text-[#616161] hover:border-[#3F51B5]/30 hover:text-[#303F9F]'}`}
                                                        title="위로 이동"
                                                    >
                                                        <ChevronUp className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleMoveCategory(category.id, 'down');
                                                        }}
                                                        disabled={index === orderedProcedureCategories.length - 1}
                                                        className={`h-4 w-8 rounded-md border flex items-center justify-center transition-colors ${index === orderedProcedureCategories.length - 1 ? 'cursor-not-allowed border-[#C5CAE9] bg-[#F8F9FD] text-[#9E9E9E]' : 'border-[#C5CAE9] bg-white text-[#616161] hover:border-[#3F51B5]/30 hover:text-[#303F9F]'}`}
                                                        title="아래로 이동"
                                                    >
                                                        <ChevronDown className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const confirmed = await showConfirm({ message: '정말로 삭제하시겠습니까?', type: 'warning' });
                                                        if (confirmed) {
                                                            deleteProcedureCategory(category.id);
                                                        }
                                                    }}
                                                    className="w-8 h-8 rounded-full bg-[#F8F9FD] flex items-center justify-center hover:bg-red-50 text-[#9E9E9E] hover:text-red-500 transition-colors z-10"
                                                    title="삭제"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                <div className="w-8 h-8 rounded-full bg-[#F8F9FD] flex items-center justify-center group-hover:bg-[#3F51B5]/10 transition-colors">
                                                    <CalendarIcon className="w-4 h-4 text-[#9E9E9E] group-hover:text-[#3F51B5]" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2 pl-2">
                                            <div className="flex items-center gap-2 text-xs text-[#616161] flex-wrap">
                                                <div className="flex items-center gap-1.5">
                                                    <Users className="w-3.5 h-3.5 shrink-0" />
                                                    <span>타임당</span>
                                                    {category.dailyReservationCounts && Object.keys(category.dailyReservationCounts).length > 0 ? (
                                                        <div className="flex items-center gap-1">
                                                            {Object.entries(category.dailyReservationCounts).map(([day, count]) => (
                                                                <span key={day} className="inline-flex items-center gap-0.5 rounded bg-[#E8EAF6] px-1.5 py-0.5 text-[10px] font-medium">
                                                                    <span className="text-[#3F51B5]">{day}</span>
                                                                    <span className="text-[#242424] font-bold">{count}명</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[#242424] font-bold">{category.reservationCount}명</span>
                                                    )}
                                                </div>
                                                <span className="text-[#C5CAE9]">|</span>
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                                    <span><span className="text-[#242424] font-bold">{category.interval}분</span> 간격</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-[#9E9E9E]">
                                                <span>{category.startDate} ~ {category.useEndDate && category.endDate ? category.endDate : '계속'}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-3">
                                                {(category.days || []).map(day => (
                                                    <span key={day} className="px-1.5 py-0.5 bg-[#F8F9FD] rounded text-[10px] text-[#616161] group-hover:bg-[#3F51B5]/10 group-hover:text-[#303F9F] transition-colors">
                                                        {day}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

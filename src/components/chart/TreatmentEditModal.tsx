import React, { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { Treatment } from "../../stores/useChartStore";

interface TreatmentEditModalProps {
    treatment: Treatment;
    onClose: () => void;
    onSave: (updates: Partial<Treatment>) => void;
    onDelete: () => void;
}

const MOCK_STAFF = ["김민지", "민경욱", "전희주", "김기현", "박은솔", "이희선", "조용지", "지수경"];

export function TreatmentEditModal({ treatment, onClose, onSave, onDelete }: TreatmentEditModalProps) {
    const [name, setName] = useState(treatment.name);
    const [memo, setMemo] = useState(treatment.memo || "");
    const [assignee, setAssignee] = useState(treatment.assignee || "");
    const [startTime, setStartTime] = useState(treatment.startTime || "");
    const [endTime, setEndTime] = useState(treatment.endTime || "");

    const handleSave = () => {
        onSave({
            name,
            memo,
            assignee,
            startTime,
            endTime
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/20 backdrop-blur-[1px]" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[400px] overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="font-bold text-lg text-gray-900">할 일 수정</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500">오더</label>
                        <select
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors appearance-none"
                        >
                            <option value={treatment.name}>{treatment.name}</option>
                            <option value="K_모델링">K_모델링</option>
                            <option value="K_듀얼토닝">K_듀얼토닝</option>
                            <option value="K_아쿠아필">K_아쿠아필</option>
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500">할 일 메모</label>
                        <textarea
                            value={memo}
                            onChange={e => setMemo(e.target.value)}
                            className="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 resize-none focus:outline-none focus:border-blue-500 focus:bg-white transition-colors placeholder:text-gray-400"
                            placeholder="메모를 입력하세요"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500">수행자</label>
                        <div className="relative">
                            <select
                                value={assignee}
                                onChange={e => setAssignee(e.target.value)}
                                className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors appearance-none"
                            >
                                <option value="" disabled>수행자를 선택해주세요</option>
                                {MOCK_STAFF.map(staff => (
                                    <option key={staff} value={staff}>{staff}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500">시간</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="time"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                className="flex-1 h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <span className="text-gray-400 text-sm">~</span>
                            <input
                                type="time"
                                value={endTime}
                                onChange={e => setEndTime(e.target.value)}
                                className="flex-1 h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <button
                        onClick={() => { onDelete(); onClose(); }}
                        className="px-4 py-2 text-red-500 hover:bg-red-50 border border-red-200 rounded-lg text-sm font-medium transition-colors"
                    >
                        삭제
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium transition-colors bg-white"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95"
                        >
                            확인
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

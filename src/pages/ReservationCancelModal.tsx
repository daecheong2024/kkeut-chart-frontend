import React, { useEffect, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';

interface ReservationCancelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string, isNoShow: boolean) => void;
}

export default function ReservationCancelModal({ isOpen, onClose, onConfirm }: ReservationCancelModalProps) {
    const [reason, setReason] = useState("");
    const [isNoShow, setIsNoShow] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setReason("");
        setIsNoShow(false);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
            <div className="bg-white rounded-xl shadow-2xl w-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-5 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">예약취소</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 pb-6">
                    {/* Info Message */}
                    <div className="flex gap-3 mb-6">
                        <MessageCircle className="w-6 h-6 text-gray-400 shrink-0" />
                        <div>
                            <div className="text-gray-500 text-sm font-medium">등록된 취소 사유가 없습니다.</div>
                            <div className="text-gray-400 text-xs mt-0.5">플래너 설정 {'>'} 취소(거절) 사유 관리에서 사유를 등록해보세요.</div>
                        </div>
                    </div>

                    {/* Textarea */}
                    <div className="mb-1">
                        <label className="block text-sm font-bold text-gray-600 mb-2">취소 사유</label>
                        <textarea
                            className="w-full h-32 p-3 border border-[#F8DCE2] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#FCEBEF] text-sm placeholder-gray-300"
                            placeholder="400자 이내로 입력해 주세요"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={400}
                        />
                    </div>
                    <div className="text-right text-xs text-gray-400 mb-4">
                        {reason.length} / 400
                    </div>

                    {/* No Show Checkbox */}
                    <div className="flex items-center gap-2 mb-8">
                        <input
                            type="checkbox"
                            id="noshow"
                            checked={isNoShow}
                            onChange={(e) => setIsNoShow(e.target.checked)}
                            className="w-5 h-5 rounded border-gray-300 text-[#E26B7C] focus:ring-[#FCEBEF]"
                        />
                        <label htmlFor="noshow" className="text-sm font-bold text-gray-800 cursor-pointer">노쇼</label>
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                        >
                            취소
                        </button>
                        <button
                            onClick={() => onConfirm(reason, isNoShow)}
                            className="px-6 py-2 bg-[#E26B7C] text-white font-bold rounded-lg hover:bg-[#99354E] text-sm"
                        >
                            확인
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

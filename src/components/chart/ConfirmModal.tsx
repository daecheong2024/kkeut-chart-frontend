import React from "react";
import { X } from "lucide-react";

interface ConfirmModalProps {
    title: string;
    description: string;
    onClose: () => void;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: "blue" | "red";
    variant?: "confirm" | "alert";
}

export function ConfirmModal({
    title,
    description,
    onClose,
    onConfirm,
    confirmText = "확인",
    cancelText = "취소",
    confirmColor = "blue",
    variant = "confirm"
}: ConfirmModalProps) {
    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/20 backdrop-blur-[1px]" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[320px] overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="font-bold text-lg text-gray-900">{title}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 text-sm text-gray-600 leading-relaxed">
                    {description}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/50">
                    {variant !== 'alert' && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium transition-colors bg-white"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-white rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95 ${confirmColor === 'red' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

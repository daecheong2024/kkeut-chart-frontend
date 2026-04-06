import React, { useState } from "react";
import { X, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import MiniCalendar from "./MiniCalendar";

interface TicketExtendModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticketName: string;
    ticketPrice: string;
    currentExpirationDate?: string;
    onConfirm: (newDate: Date) => void;
}

export default function TicketExtendModal({
    isOpen,
    onClose,
    ticketName,
    ticketPrice,
    currentExpirationDate,
    onConfirm,
}: TicketExtendModalProps) {
    const [selectedDate, setSelectedDate] = useState<Date | null>(
        currentExpirationDate ? new Date(currentExpirationDate) : new Date()
    );
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    if (!isOpen) return null;

    const formattedDate = selectedDate
        ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
        : "";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-[400px]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">티켓 기간 연장</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Ticket Info */}
                    <div className="bg-blue-50/50 rounded-lg p-4 mb-6">
                        <div className="text-sm font-bold text-gray-900 mb-1 leading-relaxed">
                            <span className="text-blue-600 mr-1">{ticketName.split(" ")[0]}</span>
                            {ticketName.split(" ").slice(1).join(" ")}
                        </div>
                        <div className="text-sm font-bold text-gray-900">{ticketPrice}</div>
                    </div>

                    {/* Date Input */}
                    <div className="mb-2">
                        <label className="block text-sm font-bold text-gray-500 mb-2">만료일*</label>
                        <div className="relative">
                            <div
                                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                                className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm flex items-center justify-between cursor-pointer bg-white hover:border-blue-400 transition-colors focus-within:ring-2 focus-within:ring-blue-100"
                            >
                                <span className={formattedDate ? "text-gray-900" : "text-gray-400"}>
                                    {formattedDate || "YYYY-MM-DD"}
                                </span>
                                {formattedDate && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedDate(null);
                                        }}
                                        className="text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="w-4 h-4 fill-gray-400 text-white rounded-full bg-gray-300 p-0.5" />
                                    </button>
                                )}
                            </div>

                            {/* Calendar Popover */}
                            {isCalendarOpen && (
                                <MiniCalendar
                                    selectedDate={selectedDate || new Date()}
                                    onDateSelect={(date) => {
                                        setSelectedDate(date);
                                        setIsCalendarOpen(false);
                                    }}
                                    onClose={() => setIsCalendarOpen(false)}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={() => selectedDate && onConfirm(selectedDate)}
                        className="px-4 py-2 bg-blue-500 rounded-lg text-sm font-bold text-white hover:bg-blue-600 transition-colors"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
}

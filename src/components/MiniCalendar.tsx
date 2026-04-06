import React, { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface MiniCalendarProps {
    onClose: () => void;
    onDateSelect?: (date: Date) => void;
    selectedDate?: Date;
}

export default function MiniCalendar({ onClose, onDateSelect, selectedDate }: MiniCalendarProps) {
    const [currentDate, setCurrentDate] = useState(selectedDate || new Date());

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month, 1).getDay();
    };

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const prevYear = () => {
        setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1));
    };

    const nextYear = () => {
        setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1));
    };

    const handleToday = () => {
        const today = new Date();
        setCurrentDate(today);
        if (onDateSelect) onDateSelect(today);
        onClose();
    };

    const handleDelete = () => {
        // Just close for now, or maybe clear date? User image says "Delete" (삭제).
        // Usually means clear the field. But for now let's just close or pass null.
        // The type onDateSelect expects Date. I won't change it to Date | null yet unless requested.
        // I'll just keep it as closing for now or reset to 'today'? 
        // Image implies clearing selection. 
        // Let's just make it Close.
        onClose();
    };

    const renderCalendarDays = () => {
        const daysInMonth = getDaysInMonth(currentDate);
        const firstDay = getFirstDayOfMonth(currentDate);
        const days = [];

        // Previous month filler
        const prevMonthLastDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();
        for (let i = firstDay - 1; i >= 0; i--) {
            days.push(
                <div key={`prev-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-300 text-xs cursor-default">
                    {prevMonthLastDay - i}
                </div>
            );
        }

        // Current month days
        const today = new Date();
        const checkDate = selectedDate || today;

        for (let i = 1; i <= daysInMonth; i++) {
            const isSelected =
                selectedDate &&
                selectedDate.getDate() === i &&
                selectedDate.getMonth() === currentDate.getMonth() &&
                selectedDate.getFullYear() === currentDate.getFullYear();

            const isToday =
                today.getDate() === i &&
                today.getMonth() === currentDate.getMonth() &&
                today.getFullYear() === currentDate.getFullYear();

            days.push(
                <div
                    key={i}
                    className={`
                        w-8 h-8 flex items-center justify-center text-sm rounded cursor-pointer transition-colors
                        ${isSelected
                            ? 'bg-blue-600 text-white font-bold shadow-sm'
                            : isToday
                                ? 'text-blue-600 font-bold'
                                : 'text-gray-700 hover:bg-gray-100'}
                    `}
                    onClick={() => {
                        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
                        if (onDateSelect) onDateSelect(newDate);
                        onClose();
                    }}
                >
                    {i}
                </div>
            );
        }

        // Next month filler
        const totalSlots = Math.ceil((days.length) / 7) * 7;
        const remainingSlots = totalSlots - days.length;
        for (let i = 1; i <= remainingSlots; i++) {
            days.push(
                <div key={`next-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-300 text-xs cursor-default">
                    {i}
                </div>
            );
        }

        return days;
    };

    return (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-[280px] z-50 animate-in fade-in zoom-in-95 duration-100 select-none">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="font-bold text-gray-900 text-base">
                    {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                </div>
                <div className="flex gap-2 text-gray-400">
                    <button onClick={prevMonth} className="hover:text-gray-900 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                    <button onClick={nextMonth} className="hover:text-gray-900 transition-colors"><ChevronRight className="w-5 h-5" /></button>
                </div>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 mb-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                    <div key={day} className={`text-center text-xs font-medium ${idx === 0 ? 'text-red-500' : 'text-gray-800'}`}>
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-y-1 justify-items-center mb-4">
                {renderCalendarDays()}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-3">
                <button onClick={handleDelete} className="text-gray-500 hover:text-gray-700">삭제</button>
                <button onClick={handleToday} className="text-blue-600 font-bold hover:text-blue-700">오늘</button>
            </div>
        </div>
    );
}

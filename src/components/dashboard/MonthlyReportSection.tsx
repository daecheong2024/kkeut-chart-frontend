import React from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

export function MonthlyReportSection() {
    const currentYear = 2025;
    const currentMonth = 11; // November (0-indexed? No, let's use 1-indexed for display)

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl border border-[rgb(var(--kkeut-border))] shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[rgb(var(--kkeut-border))]">
                <h2 className="text-lg font-bold text-gray-900">월간 경영 리포트</h2>
            </div>

            <div className="flex-1 flex flex-col p-6">
                {/* Year Nav */}
                <div className="flex items-center justify-center gap-4 mb-8">
                    <button className="text-gray-400 hover:text-gray-600"><ChevronLeft size={16} /></button>
                    <span className="text-sm font-semibold text-gray-600">{currentYear}</span>
                    <button className="text-gray-400 hover:text-gray-600"><ChevronRight size={16} /></button>
                </div>

                {/* Months Grid */}
                <div className="grid grid-cols-3 gap-4 flex-1">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <button
                            key={m}
                            className={`aspect-square rounded-2xl flex items-center justify-center text-sm font-medium transition-all ${m === currentMonth
                                    ? "bg-[rgb(var(--kkeut-primary))] text-white shadow-md shadow-blue-200"
                                    : "hover:bg-gray-50 text-gray-600"
                                }`}
                        >
                            {m}월
                        </button>
                    ))}
                </div>

                {/* Footer Action */}
                <div className="mt-6">
                    <button className="w-full py-3 flex items-center justify-center gap-2 rounded-xl border border-[rgb(var(--kkeut-border))] text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                        <FileText size={16} />
                        리포트 보기
                    </button>
                </div>
            </div>
        </div>
    );
}

import React, { useEffect, useState } from "react";
import { X, Search, ChevronRight, FileText, ChevronDown, ChevronUp } from "lucide-react";

interface ConsentFormSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (formId: string, formName: string) => void;
}

export default function ConsentFormSelectModal({
    isOpen,
    onClose,
    onSelect,
}: ConsentFormSelectModalProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        setIsExpanded(true);
        setSearchQuery("");
    }, [isOpen]);

    if (!isOpen) return null;

    const consentForms = [
        { id: "c1", name: "미성년자 시술 동의서" },
        { id: "c2", name: "실리프팅(매선) 시술동의서" },
        { id: "c3", name: "모델 사진 사용 동의서" },
        { id: "c4", name: "제모/토닝 시술 주기 동의서" },
    ];

    const filteredForms = consentForms.filter((form) =>
        form.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-[400px] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">동의서를 선택합니다.</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 bg-gray-50 min-h-[400px]">
                    <p className="text-sm text-gray-500 mb-4">환자에게 전송할 동의서를 검색하여 생성할 수 있습니다.</p>

                    {/* Search */}
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="동의서 검색"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white"
                        />
                    </div>

                    {/* List */}
                    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                        <div
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span>동의서 {filteredForms.length}</span>
                            </div>
                            {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                        </div>

                        {isExpanded && (
                            <div className="border-t border-gray-100">
                                {filteredForms.map((form) => (
                                    <div
                                        key={form.id}
                                        onClick={() => onSelect(form.id, form.name)}
                                        className="p-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 cursor-pointer transition-colors"
                                    >
                                        {form.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex justify-end">
                    <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 bg-white">
                        동의서 관리
                    </button>
                </div>
            </div>
        </div>
    );
}

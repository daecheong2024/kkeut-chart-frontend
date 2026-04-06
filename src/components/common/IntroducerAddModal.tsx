import React, { useState, useEffect } from "react";
import { X, Search, ChevronRight, User } from "lucide-react";

interface Introducer {
    id: string; // Patient No
    name: string;
    phone?: string;
    dob?: string;
}

interface IntroducerAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (introducer: Introducer) => void;
}

const MOCK_PATIENTS: Introducer[] = [
    { id: "5726822", name: "(마유카)NISHI...", phone: "010-1234-5678", dob: "990101" },
    { id: "5726545", name: "강유경", phone: "010-9876-5432", dob: "990223" },
    { id: "5723878", name: "강유리", phone: "010-1111-2222", dob: "991213" },
    { id: "5722900", name: "강유민", phone: "010-3333-4444", dob: "990428" },
    { id: "5718863", name: "강유빈", phone: "010-5555-6666", dob: "930914" },
    { id: "5722074", name: "강유정", phone: "010-7777-8888", dob: "991225" },
    { id: "5723147", name: "강유진", phone: "010-9999-0000", dob: "980512" },
    { id: "5723568", name: "고유나", phone: "-", dob: "-" },
    { id: "5721107", name: "고유리", phone: "010-1212-3434", dob: "980214" },
];

export function IntroducerAddModal({ isOpen, onClose, onConfirm }: IntroducerAddModalProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filteredPatients, setFilteredPatients] = useState<Introducer[]>([]);

    useEffect(() => {
        if (isOpen) {
            setSearchTerm("");
            setFilteredPatients([]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (searchTerm) {
            setFilteredPatients(
                MOCK_PATIENTS.filter(p => p.name.includes(searchTerm) || p.id.includes(searchTerm))
            );
        } else {
            setFilteredPatients([]);
        }
    }, [searchTerm]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-[600px] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">

                {/* Search Bar Area */}
                <div className="p-6 pb-2">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
                        <input
                            className="w-full pl-12 pr-12 py-3 bg-gray-50 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all placeholder:text-gray-400"
                            placeholder="환자 검색"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                        <button
                            onClick={onClose}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto min-h-[400px] p-6 pt-2">
                    <h3 className="text-sm font-bold text-gray-500 mb-4">검색 결과</h3>

                    {searchTerm ? (
                        <div className="space-y-2">
                            {filteredPatients.map(patient => (
                                <div
                                    key={patient.id}
                                    className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:bg-violet-50 hover:border-violet-100 cursor-pointer transition-all group"
                                    onClick={() => {
                                        onConfirm(patient);
                                        onClose();
                                    }}
                                >
                                    <div>
                                        <div className="font-bold text-gray-800 group-hover:text-violet-700">{patient.name}</div>
                                        <div className="text-sm text-gray-500">{patient.id} | {patient.dob} | {patient.phone}</div>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-300 group-hover:text-violet-400" />
                                </div>
                            ))}
                            {filteredPatients.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                    <p>검색 결과가 없습니다.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Empty State */
                        <div className="flex flex-col items-center justify-center h-[300px] text-gray-400 gap-4">
                            <User size={48} className="text-gray-300 stroke-[1.5]" />
                            <p className="text-sm">이름, 전화번호, 생년월일(6자리), 환자번호로 검색해보세요.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

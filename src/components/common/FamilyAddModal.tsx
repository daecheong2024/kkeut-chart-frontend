import React, { useState, useEffect } from "react";
import { X, Search, ChevronDown, Check } from "lucide-react";

interface FamilyMember {
    id: string; // Patient No
    name: string;
    age: number;
    sex: string;
    residentId: string;
    lastVisit: string;
    relationship?: string;
}

interface FamilyAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (member: FamilyMember, relationship: string) => void;
}


const RELATIONSHIPS = ["모", "조모", "배우자", "자녀", "손자", "형제"];

export function FamilyAddModal({ isOpen, onClose, onConfirm }: FamilyAddModalProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedPatient, setSelectedPatient] = useState<FamilyMember | null>(null);
    const [selectedRelationship, setSelectedRelationship] = useState("");
    const [isRelationDropdownOpen, setIsRelationDropdownOpen] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [patients, setPatients] = useState<FamilyMember[]>([]); // Load from backend

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setSearchTerm("");
            setSelectedPatient(null);
            setSelectedRelationship("");
            setIsRelationDropdownOpen(false);
            setShowResults(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredPatients = searchTerm
        ? patients.filter(p => p.name.includes(searchTerm) || p.id.includes(searchTerm))
        : patients;

    const handleConfirm = () => {
        if (!selectedPatient || !selectedRelationship) {
            alert("환자와 관계를 선택해주세요.");
            return;
        }
        onConfirm(selectedPatient, selectedRelationship);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-[800px] flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-8 pb-4">
                    <h2 className="text-2xl font-bold text-gray-900">가족추가</h2>
                </div>

                {/* Body */}
                <div className="px-8 pb-8 space-y-6">

                    {/* Search & Relation Row */}
                    <div className="flex gap-3 relative">
                        {/* Search Input */}
                        <div className="flex-1 relative">
                            <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
                            <input
                                className="w-full pl-8 pr-8 py-2 text-lg border-b border-gray-200 focus:outline-none focus:border-violet-500 placeholder:text-gray-300 transition-colors"
                                placeholder="환자 검색"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setShowResults(true);
                                    setSelectedPatient(null);
                                }}
                                onFocus={() => setShowResults(true)}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => { setSearchTerm(""); setShowResults(false); }}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                                >
                                    <X size={16} className="bg-gray-200 rounded-full p-0.5 text-white" />
                                </button>
                            )}
                        </div>

                        {/* Relationship Dropdown */}
                        <div className="w-[140px] relative">
                            <button
                                className={`w-full h-full flex items-center justify-between px-3 py-2 border rounded-xl text-sm font-medium transition-colors ${selectedRelationship ? 'border-violet-500 text-violet-600' : 'border-gray-200 text-gray-400 hover:border-violet-300'}`}
                                onClick={() => setIsRelationDropdownOpen(!isRelationDropdownOpen)}
                            >
                                <span>{selectedRelationship || "관계 선택"}</span>
                                <ChevronDown size={16} />
                            </button>

                            {isRelationDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20 py-1 animate-in fade-in zoom-in-95 duration-100">
                                    {RELATIONSHIPS.map(rel => (
                                        <button
                                            key={rel}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-600 font-medium transition-colors"
                                            onClick={() => {
                                                setSelectedRelationship(rel);
                                                setIsRelationDropdownOpen(false);
                                            }}
                                        >
                                            {rel}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Search Results Dropdown (Moved here to span full width) */}
                        {showResults && searchTerm && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-[400px] overflow-y-auto z-20 custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-white sticky top-0 z-10">
                                        <tr>
                                            <th className="py-3 px-4 text-xs font-bold text-gray-400 whitespace-nowrap">환자번호</th>
                                            <th className="py-3 px-4 text-xs font-bold text-gray-400 whitespace-nowrap">환자정보</th>
                                            <th className="py-3 px-4 text-xs font-bold text-gray-400 whitespace-nowrap">주민등록번호</th>
                                            <th className="py-3 px-4 text-xs font-bold text-gray-400 whitespace-nowrap">피보험자</th>
                                            <th className="py-3 px-4 text-xs font-bold text-gray-400 whitespace-nowrap">최종방문일</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPatients.map((patient) => (
                                            <tr
                                                key={patient.id}
                                                className="hover:bg-violet-50 cursor-pointer transition-colors border-t border-gray-50"
                                                onClick={() => {
                                                    setSelectedPatient(patient);
                                                    setSearchTerm(patient.name);
                                                    setShowResults(false);
                                                }}
                                            >
                                                <td className="py-3 px-4 text-sm font-medium text-gray-700">{patient.id}</td>
                                                <td className="py-3 px-4 text-sm text-gray-600">
                                                    <span className="font-bold text-gray-800">{patient.name}</span> <span className="text-gray-400 text-xs ml-1 whitespace-nowrap">{patient.sex}, {patient.age}세</span>
                                                </td>
                                                <td className="py-3 px-4 text-sm text-gray-600">{patient.residentId}</td>
                                                <td className="py-3 px-4 text-sm text-gray-600">-</td>
                                                <td className="py-3 px-4 text-sm text-gray-600">{patient.lastVisit}</td>
                                            </tr>
                                        ))}
                                        {filteredPatients.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-8 text-center text-gray-400">검색 결과가 없습니다.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`px-6 py-3 rounded-xl font-bold text-sm transition-colors ${selectedPatient && selectedRelationship ? 'bg-violet-100 text-violet-600 hover:bg-violet-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                            disabled={!selectedPatient || !selectedRelationship}
                        >
                            확인
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

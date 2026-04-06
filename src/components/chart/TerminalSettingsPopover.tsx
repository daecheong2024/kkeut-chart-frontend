import React, { useState } from 'react';
import { Check } from 'lucide-react';

interface TerminalSettingsPopoverProps {
    onClose: () => void;
    onSave: (settings: any) => void;
}

export default function TerminalSettingsPopover({ onClose, onSave }: TerminalSettingsPopoverProps) {
    const [selectedTerminal, setSelectedTerminal] = useState("더베스트페이");
    const [agentUrl, setAgentUrl] = useState("ws://localhost:16500");

    const terminals = [
        "단말기 없음",
        "더베스트페이",
        "KOCES",
        "한국결제네트웍스"
    ];

    const handleSave = () => {
        onSave({ terminal: selectedTerminal, agentUrl });
        onClose();
    };

    const handleReset = () => {
        setSelectedTerminal("단말기 없음");
        setAgentUrl("");
    };

    return (
        <div className="absolute top-8 right-0 z-50 bg-white rounded-lg shadow-xl border border-gray-200 w-[320px] p-6 text-left">
            <h3 className="font-bold text-gray-900 mb-4">단말기 설정</h3>

            <div className="space-y-3 mb-6">
                {terminals.map((terminal) => (
                    <div
                        key={terminal}
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => setSelectedTerminal(terminal)}
                    >
                        {selectedTerminal === terminal ? (
                            <div className="w-4 h-4 text-blue-500">
                                <Check className="w-4 h-4" />
                            </div>
                        ) : (
                            <div className="w-4 h-4"></div>
                        )}
                        <span className={`text-sm ${selectedTerminal === terminal ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                            {terminal}
                        </span>
                    </div>
                ))}
            </div>

            <div className="mb-6">
                <label className="block text-sm text-gray-500 mb-2">단말기 에이전트 url</label>
                <input
                    className="w-full border border-blue-400 rounded-lg px-3 py-2 text-sm outline-none bg-white text-gray-900 font-medium shadow-sm focus:ring-2 focus:ring-blue-100"
                    value={agentUrl}
                    onChange={(e) => setAgentUrl(e.target.value)}
                />
            </div>

            <div className="flex gap-2">
                <button
                    onClick={handleReset}
                    className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 text-sm font-bold transition-colors"
                >
                    초기화
                </button>
                <button
                    onClick={handleSave}
                    className="flex-1 py-2.5 rounded-lg bg-white border border-blue-200 text-blue-500 hover:bg-blue-50 text-sm font-bold transition-colors"
                >
                    확인
                </button>
            </div>
        </div>
    );
}

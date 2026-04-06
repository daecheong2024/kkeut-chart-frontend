import React from "react";
import { X } from "lucide-react";

interface ConsentFormDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    formName: string;
}

export default function ConsentFormDetailModal({
    isOpen,
    onClose,
    formName,
}: ConsentFormDetailModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-[800px] h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
                    <h2 className="text-lg font-bold text-gray-900">동의서 전송</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {/* Title */}
                    <div className="mb-6">
                        <div className="text-2xl font-bold text-gray-900 mb-2">{formName}</div>
                        <div className="w-full h-px bg-gray-900"></div>
                        <div className="mt-2 text-lg font-bold text-gray-900">구로 끗 한의원</div>
                    </div>

                    {/* Patient Info Grid */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-8 border-b border-gray-100 pb-8">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-gray-900 w-20">환자명</span>
                            <span className="text-sm text-gray-900">유지홍</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-gray-900 w-20">환자번호</span>
                            <span className="text-sm text-gray-900">5718422</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-gray-900 w-20">생년월일</span>
                            <span className="text-sm text-gray-900">1991-12-14</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-gray-900 w-20">성별</span>
                            <span className="text-sm text-gray-900">남</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-gray-900 w-20">주민등록번호</span>
                            <input
                                type="text"
                                placeholder="주민등록번호를 연동합니다."
                                className="text-sm text-gray-500 placeholder-gray-300 focus:outline-none w-full"
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-gray-900 w-20">연락처</span>
                            <span className="text-sm text-gray-900">010-5284-9196</span>
                        </div>
                        <div className="col-span-2 flex items-center gap-4">
                            <span className="text-sm font-bold text-gray-900 w-20">주소</span>
                            <input
                                type="text"
                                placeholder="주소를 연동합니다."
                                className="text-sm text-gray-500 placeholder-gray-300 focus:outline-none w-full"
                            />
                        </div>
                    </div>

                    {/* Consent Text */}
                    <div className="space-y-6 text-sm text-gray-900 leading-relaxed">
                        <div>
                            <h3 className="font-bold flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 bg-black rounded-sm"></span>
                                시술의 목적 및 방법
                            </h3>
                            <p className="pl-4 mb-4">
                                - 실리프팅은 의료용 녹는 콜라겐 실을 이용하여 처진 피부를 당겨 올리는 시술입니다.
                            </p>
                            <p className="pl-4 mb-4">
                                - 사용 실의 종류에는 Y자, 민트, 슈퍼민트, 블루다이아, 울트라V, 회오리, 미주코 등 다양한 제품이 있을 수 있습니다.
                            </p>
                            <p className="pl-4">
                                - 수술(안면거상술)과 같은 수준의 강력한 리프팅 효과를 기대하기는 어렵습니다.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 bg-black rounded-sm"></span>
                                시술 효과 및 한계
                            </h3>
                            <p className="pl-4 mb-4">
                                - 개인의 피부 처짐 정도, 피부 두께, 지방량, 실 개수 및 피부 상태에 따라 시술 효과는 개인차가 발생할 수 있습니다.
                            </p>
                            <p className="pl-4 mb-4">
                                - 시술 결과에 대한 주관적인 불만족만을 이유로 한 환불이나 무료 추가 시술은 불가능함을 이해합니다.
                            </p>
                            <p className="pl-4 mb-4">
                                - 실이 조직에 자리 잡는 데 대략 4주 정도가 소요되며, 이 기간 동안 일시적인 딤플(패임) 또는 울퉁불퉁함이 나타날 수 있습니다.
                            </p>
                            <p className="pl-4">
                                - 피부 아래 부위를 당겨 올리는 시술 특성상, 광대 부위가 다소 도드라져 보이나 커 보일 수 있습니다.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 bg-black rounded-sm"></span>
                                예상 가능한 부작용 및 합병증
                            </h3>
                            <p className="pl-4 mb-4">
                                - 시술 후 표정을 과도하게 짓거나 입을 크게 벌리는 경우, 실이 끊어지거나 튀어나올 수 있습니다.<br />
                                → 시술 후 약 1개월 동안은 과도한 표정, 강한 마사지, 스크럽 등은 피해 주십시오.
                            </p>
                            <p className="pl-4 mb-4">
                                - 멍, 붓기, 통증, 이물감 등이 발생할 수 있으며, 대부분 1~2주 내로 호전됩니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <button className="px-4 py-2 border border-red-100 text-red-500 rounded-lg text-sm font-bold hover:bg-red-50 bg-white">
                        삭제
                    </button>
                    <div className="flex gap-2">
                        <button className="px-4 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-50 bg-white">
                            임시저장
                        </button>
                        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold hover:bg-blue-600 shadow-sm">
                            서명요청
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

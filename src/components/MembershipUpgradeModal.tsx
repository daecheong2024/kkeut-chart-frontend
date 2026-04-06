import { X } from "lucide-react";
import { PatientMembership } from "../services/membershipService";

interface MembershipUpgradeModalProps {
    currentMembership: PatientMembership;
    newMembershipName: string;
    newMembershipAmount: number;
    newBonusPoints: number;
    newDiscountPercent: number;
    upgradePrice: number;
    remainingValue: number;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function MembershipUpgradeModal({
    currentMembership,
    newMembershipName,
    newMembershipAmount,
    newBonusPoints,
    newDiscountPercent,
    upgradePrice,
    remainingValue,
    onConfirm,
    onCancel
}: MembershipUpgradeModalProps) {
    const calculateRemainingDays = () => {
        const expiry = new Date(currentMembership.expiryDate);
        const now = new Date();
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

    const remainingDays = calculateRemainingDays();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-white text-lg font-bold">⬆️ 회원권 업그레이드</h2>
                    <button
                        onClick={onCancel}
                        className="text-white hover:bg-white/20 rounded-full p-1 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* Warning */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-amber-800 text-sm">
                            ⚠️ 이미 활성 회원권이 있습니다
                        </p>
                    </div>

                    {/* Current Membership */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-xs text-gray-500 mb-2">현재 회원권</div>
                        <div className="font-bold text-gray-800 text-base mb-1">
                            {currentMembership.membershipName}
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                            <div>할인율: {currentMembership.discountPercent}%</div>
                            <div>만료일: {new Date(currentMembership.expiryDate).toLocaleDateString()}</div>
                            <div>남은 기간: {remainingDays}일</div>
                            <div className="text-purple-600 font-semibold">
                                잔여 포인트: {currentMembership.bonusPoints.toLocaleString()}P
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-200" />

                    {/* New Membership */}
                    <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
                        <div className="text-xs text-purple-600 mb-2">새 회원권</div>
                        <div className="font-bold text-purple-800 text-base mb-1">
                            {newMembershipName}
                        </div>
                        <div className="text-sm text-gray-700 space-y-1">
                            <div>정가: {(newMembershipAmount / 10000).toLocaleString()}만원</div>
                            <div className="text-red-500">업그레이드 할인: -{(remainingValue / 10000).toLocaleString()}만원</div>
                            <div className="text-xl font-bold text-purple-600 mt-2">
                                ⭐ 결제 금액: {(upgradePrice / 10000).toLocaleString()}만원
                            </div>
                        </div>
                    </div>

                    {/* Benefits */}
                    <div className="bg-green-50 rounded-lg p-4">
                        <div className="text-sm font-semibold text-green-800 mb-2">
                            📈 업그레이드 혜택
                        </div>
                        <ul className="text-sm text-green-700 space-y-1">
                            <li>• 할인율 {currentMembership.discountPercent}% → {newDiscountPercent}% 업그레이드</li>
                            <li>• 보너스 +{newBonusPoints.toLocaleString()}P 추가 지급</li>
                            <li>• 유효기간 1년 새로 시작</li>
                            <li>• 기존 포인트 {currentMembership.bonusPoints.toLocaleString()}P 유지</li>
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 bg-white border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-100 transition"
                    >
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-bold hover:from-purple-600 hover:to-purple-700 transition shadow-lg"
                    >
                        업그레이드 하기
                    </button>
                </div>
            </div>
        </div>
    );
}

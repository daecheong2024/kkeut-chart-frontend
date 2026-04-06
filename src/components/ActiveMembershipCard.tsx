import { useEffect, useState } from 'react';
import { membershipService, PatientMembership } from '../services/membershipService';
import { CreditCard, Clock, Percent, Gift } from 'lucide-react';

interface ActiveMembershipCardProps {
    patientId: number;
}

export default function ActiveMembershipCard({ patientId }: ActiveMembershipCardProps) {
    const [membership, setMembership] = useState<PatientMembership | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadActiveMembership();
    }, [patientId]);

    const loadActiveMembership = async () => {
        setLoading(true);
        const active = await membershipService.getActiveMembership(patientId);
        setMembership(active);
        setLoading(false);
    };

    const calculateRemainingDays = () => {
        if (!membership) return 0;
        const expiry = new Date(membership.expiryDate);
        const now = new Date();
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

    if (loading) {
        return <div className="text-center py-8 text-gray-500 text-sm">로딩 중...</div>;
    }

    if (!membership) {
        return (
            <div className="bg-gray-50 rounded-lg p-6 text-center">
                <div className="text-gray-400 mb-2">
                    <CreditCard className="w-12 h-12 mx-auto mb-2" />
                </div>
                <p className="text-gray-600 text-sm">활성 회원권이 없습니다</p>
            </div>
        );
    }

    const remainingDays = calculateRemainingDays();

    return (
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-5 text-white shadow-lg">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="text-xs opacity-80 mb-1">현재 활성 회원권</div>
                    <h4 className="text-xl font-bold">{membership.membershipName}</h4>
                </div>
                <div className="bg-white/20 rounded-full p-2">
                    <CreditCard className="w-5 h-5" />
                </div>
            </div>

            <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    <span>{membership.discountPercent}% 할인 혜택</span>
                </div>

                <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4" />
                    <span>보너스 {membership.bonusPoints.toLocaleString()}P</span>
                </div>

                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>
                        {remainingDays}일 남음
                        <span className="text-xs opacity-80 ml-2">
                            ({new Date(membership.expiryDate).toLocaleDateString()})
                        </span>
                    </span>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/20">
                <div className="text-xs opacity-80">사용 횟수</div>
                <div className="text-2xl font-bold">{membership.usedCount}회</div>
            </div>
        </div>
    );
}

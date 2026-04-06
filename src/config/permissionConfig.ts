export interface PermissionItem {
    key: string;
    label: string;
    desc?: string;
    children?: PermissionItem[];
}

function extractKeys(items: PermissionItem[]): string[] {
    return items.flatMap((item) =>
        item.children ? extractKeys(item.children) : [item.key]
    );
}

export const PERMISSION_CONFIG: PermissionItem[] = [
    {
        key: "dashboard",
        label: "홈 (대시보드)",
        children: [
            { key: "dashboard.view", label: "대시보드 조회" },
            { key: "dashboard.edit_notice", label: "병원공지 수정 및 삭제" },
            { key: "dashboard.edit_hq_notice", label: "본사공지 수정 및 삭제" },
        ],
    },
    {
        key: "chart",
        label: "진료 차트",
        children: [
            { key: "chart.view", label: "차트 페이지 접근" },
            { key: "chart.medical_record.view", label: "진료기록 조회" },
            { key: "chart.medical_record.edit", label: "진료기록 수정" },
            { key: "chart.payment.view", label: "수납 조회" },
            { key: "chart.payment.edit", label: "수납 수정/결제" },
            { key: "patients.view", label: "환자목록 조회" },
            { key: "patients.memo.view", label: "환자메모 조회" },
            { key: "chart.lock.force_unlock", label: "차트잠금 강제해제" },
            { key: "patients.memo.edit", label: "환자메모 수정" },
        ],
    },
    {
        key: "reservation",
        label: "예약/접수",
        children: [
            { key: "reservation.view", label: "예약판 조회" },
            { key: "reservation.create", label: "신규 예약 등록" },
            { key: "reservation.edit", label: "예약 수정" },
            { key: "reservation.cancel", label: "예약 취소/삭제" },
        ],
    },
    {
        key: "stats",
        label: "통계",
        children: [
            { key: "stats.revenue.view", label: "매출 통계 조회" },
            { key: "stats.statistics.view", label: "상담/시술 통계 조회" },
        ],
    },
    {
        key: "crm",
        label: "CRM",
        children: [
            { key: "crm.view", label: "CRM 메뉴 접근" },
            { key: "crm.message.send", label: "메시지" },
        ],
    },
    {
        key: "settings",
        label: "설정",
        children: [
            { key: "settings.hospital", label: "병원 정보 설정" },
            { key: "settings.chart", label: "차트 설정 (항목/대기실 등)" },
            { key: "settings.members", label: "멤버/권한 설정" },
            { key: "settings.tickets", label: "티켓/시술권 설정" },
            { key: "settings.phrases", label: "상용구/문구 설정" },
            { key: "settings.forms", label: "서식 설정" },
            { key: "settings.integrations", label: "외부 연동 설정" },
            { key: "settings.branches", label: "지점 설정" },
        ],
    },
];

export const ALL_PERMISSION_KEYS: string[] = extractKeys(PERMISSION_CONFIG);

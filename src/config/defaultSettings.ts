import type { ChartSettings, PermissionProfile } from "../types/settings";

const USE_SEED = import.meta.env.VITE_USE_SEED_DEFAULTS === "true";

const SEED_CHART_CONFIG = {
  waitLists: [
    { id: "w1", label: "후수납", enabled: true, order: 1 },
    { id: "w2", label: "메인대기실", enabled: true, order: 2 },
    { id: "w3", label: "세안/탈의실", enabled: true, order: 3 },
    { id: "w4", label: "검진실", enabled: true, order: 4 },
    { id: "w5", label: "상담실", enabled: true, order: 5 },
    { id: "w6", label: "중간대기실", enabled: true, order: 6 },
  ],
  visitPurposes: [
    { id: "p1", label: "상담", enabled: true, order: 1, dpSchedule: "연동스케줄1" },
    { id: "p2", label: "다이어트", enabled: true, order: 2, dpSchedule: "연동스케줄1" },
    { id: "p3", label: "리프팅", enabled: true, order: 3, dpSchedule: "연동스케줄1" },
    { id: "p4", label: "색소", enabled: true, order: 4, dpSchedule: "연동스케줄1" },
    { id: "p5", label: "스킨부스터/약침", enabled: true, order: 5, dpSchedule: "연동스케줄2" },
  ],
  statuses: [
    { id: "s1", label: "접수신청", enabled: true, order: 1, colorHex: "#7C3AED" },
    { id: "s2", label: "대기", enabled: true, order: 2, colorHex: "#F97316" },
    { id: "s3", label: "원상대기", enabled: true, order: 3, colorHex: "#FB923C" },
    { id: "s4", label: "상담대기", enabled: true, order: 4, colorHex: "#FDBA74" },
    { id: "s5", label: "상담완료", enabled: true, order: 5, colorHex: "#F59E0B" },
    { id: "s6", label: "차팅중", enabled: true, order: 6, colorHex: "#EC4899" },
    { id: "s7", label: "원상중", enabled: true, order: 7, colorHex: "#10B981" },
    { id: "s8", label: "상담중", enabled: true, order: 8, colorHex: "#22C55E" },
  ],
  memoSections: [
    { id: "m1", label: "관리", enabled: true, order: 1 },
    { id: "m2", label: "원장님상담", enabled: true, order: 2 },
    { id: "m3", label: "실장님 상담", enabled: true, order: 3 },
  ],
  coupons: [
    { id: "c1", label: "수험생할인", enabled: true, order: 1, discountPercent: 10, createdAt: "2025-12-19" },
    { id: "c2", label: "직원할인", enabled: true, order: 2, discountPercent: 50, createdAt: "2025-12-19" },
    { id: "c3", label: "첫방문", enabled: true, order: 3, discountPercent: 5, createdAt: "2025-11-27" },
  ],
};

const SEED_MEMBERS = {
  departments: [
    { id: "dept_none", name: "무소속", order: 1 },
    { id: "dept_clinic", name: "진료", order: 2 },
    { id: "dept_coord", name: "코디네이터", order: 3 },
    { id: "dept_care", name: "케어", order: 4 },
  ],
  jobTitles: [
    { id: "jt_owner", name: "소유자", order: 1 },
    { id: "jt_admin", name: "멤버관리자", order: 2 },
    { id: "jt_director", name: "부원장님", order: 3 },
    { id: "jt_manager", name: "총괄원장님", order: 4 },
    { id: "jt_coord", name: "코디", order: 5 },
    { id: "jt_care", name: "케어", order: 6 },
  ],
  permissionProfiles: [
    {
      id: "perm_owner",
      name: "소유자*",
      branchScope: "all",
      permissions: {
        "dashboard.view": true,
        "dashboard.edit_notice": true,
        "dashboard.edit_hq_notice": true,
        "chart.view": true,
        "chart.medical_record.view": true,
        "chart.medical_record.edit": true,
        "chart.medical_record.delete": true,
        "chart.payment.view": true,
        "chart.payment.edit": true,
        "chart.image.view": true,
        "chart.image.edit": true,
        "chart.edit_others": true,
        "patients.view": true,
        "patients.search": true,
        "patients.export": true,
        "patients.memo.view": true,
        "patients.memo.edit": true,
        "reservation.view": true,
        "reservation.create": true,
        "reservation.edit": true,
        "reservation.cancel": true,
        "stats.revenue.view": true,
        "stats.statistics.view": true,
        "stats.download": true,
        "crm.view": true,
        "crm.message.send": true,
        "crm.template.manage": true,
        "settings.hospital": true,
        "settings.chart": true,
        "settings.members": true,
        "settings.tickets": true,
        "settings.phrases": true,
        "settings.forms": true,
        "settings.integrations": true,
        "settings.branches": true,
      },
    },
    {
      id: "perm_basic",
      name: "기본 권한*",
      branchScope: "own",
      permissions: {
        "dashboard.view": true,
        "chart.view": true,
        "chart.medical_record.view": true,
        "reservation.view": true,
        "reservation.create": true,
        "patients.view": true,
        "patients.search": true,
      },
    },
  ] as PermissionProfile[],
};

const SEED_MEMBERSHIPS = [
  {
    id: 'membership_100',
    name: '실버 회원권',
    amount: 1000000,
    bonusPoints: 10000,
    discountPercent: 3,
    enabled: true,
    order: 1,
    createdAt: '2025-01-01'
  },
  {
    id: 'membership_200',
    name: '골드 회원권',
    amount: 2000000,
    bonusPoints: 25000,
    discountPercent: 5,
    enabled: true,
    order: 2,
    createdAt: '2025-01-01'
  },
  {
    id: 'membership_300',
    name: 'VIP 회원권',
    amount: 3000000,
    bonusPoints: 50000,
    discountPercent: 7,
    enabled: true,
    order: 3,
    createdAt: '2025-01-01'
  }
];

const SEED_FORMS = {
  templates: [
    {
      id: "ft1",
      title: "개인정보 수집 이용 동의서",
      category: "필수",
      format: "plain" as const,
      body: "본원은 관련 법령에 의거하여...",
      requireSignature: true,
      enabled: true,
      updatedAt: "2025-12-30",
      status: "published" as const,
      version: 1,
      publishedAt: "2025-12-30",
    },
  ],
};

export const DEFAULT_SETTINGS: ChartSettings = {
  activeBranchId: "",
  branches: [],

  parts: [
    { id: "doctor", label: "원장" },
    { id: "coordinator", label: "코디네이터" },
    { id: "aesthetician", label: "피부관리사" },
    { id: "nursing_assistant", label: "간호조무사" },
    { id: "support", label: "경영지원" }
  ],

  columns: [
    { key: "reserved", label: "예약", order: 1, enabled: true },
    { key: "checked_in", label: "접수", order: 2, enabled: true },
    { key: "completed", label: "완료", order: 3, enabled: true },
    { key: "cancelled", label: "취소", order: 99, enabled: false }
  ],

  categories: [
    { id: "consult", label: "상담", enabled: true },
    { id: "laser", label: "레이저", enabled: true },
    { id: "lift", label: "리프팅", enabled: true },
    { id: "skin", label: "스킨케어", enabled: true },
    { id: "body", label: "체형/다이어트", enabled: true }
  ],

  viewModes: [
    { id: "byCategory", label: "카테고리별", enabled: true },
    { id: "byNewReturning", label: "초진/재진", enabled: true },
    { id: "byCustom", label: "사용자 세팅", enabled: true }
  ],

  cycleUnits: [
    { id: "week", label: "주", days: 7 },
    { id: "month", label: "월", days: 30 },
    { id: "quarter", label: "분기", days: 90 },
    { id: "halfYear", label: "반기", days: 182 },
    { id: "year", label: "년", days: 365 }
  ],

  integrations: [
    { id: "website", label: "홈페이지 예약", enabled: true },
    { id: "ticket", label: "여신티켓", enabled: false },
    { id: "naver", label: "네이버 예약", enabled: false },
    { id: "googleBusiness", label: "구글 비즈니스", enabled: false },
    { id: "kakao", label: "카카오톡", enabled: true },
    { id: "line", label: "LINE", enabled: false },
    { id: "instagram", label: "인스타그램", enabled: false },
    { id: "whatsapp", label: "WhatsApp", enabled: false },
    { id: "wechat", label: "WeChat", enabled: false }
  ],

  hospital: {
    hospitalNameKo: "",
    hospitalNameEn: "",
    businessNumber: "",
    providerNumber: "",
    medicalDepartments: "",
    effectiveDate: "",
    address: "",
    phone: "",
    fax: "",
    industrialAccidentNumber: "",
    billingAgencyNumber: "",
    directorName: "",
    directorBirthDate: "",
    logoDataUrl: undefined,
    stampHospitalDataUrl: undefined,
    stampDirectorDataUrl: undefined,
    operatingHours: {},
  },

  chartConfig: {
    waitLists: USE_SEED ? SEED_CHART_CONFIG.waitLists : [],
    visitPurposes: USE_SEED ? SEED_CHART_CONFIG.visitPurposes : [],
    statusRules: {
      tabletReceptionStatusId: "",
      sendDefaultStatusId: "",
      startProgressStatusId: "",
      applyWaitOrderSorting: true,
      statusTransitions: [],
      todoPerformerJobTitleIds: [],
      paymentAssigneeJobTitleIds: [],
      receptionDoctorJobTitleIds: [],
      procedureTodoStatsProcedureGroups: [],
    },
    statuses: USE_SEED ? SEED_CHART_CONFIG.statuses : [],
    memoSections: USE_SEED ? SEED_CHART_CONFIG.memoSections : [],
    coupons: USE_SEED ? SEED_CHART_CONFIG.coupons : [],
    patientTags: [],
  },

  members: {
    departments: USE_SEED ? SEED_MEMBERS.departments : [],
    jobTitles: USE_SEED ? SEED_MEMBERS.jobTitles : [],
    permissionProfiles: USE_SEED ? SEED_MEMBERS.permissionProfiles : [],
    users: [],
    invitedAccounts: [],
    tempAssignees: [],
  },

  tickets: {
    items: [],
    memberships: USE_SEED ? SEED_MEMBERSHIPS : [],
  },

  phrases: {
    my: [],
    clinic: [],
  },

  forms: USE_SEED ? SEED_FORMS : { templates: [] },

  integrationsConfig: {
    crm: { enabled: true, callerId: "02-1234-5678" },
    nemonic: { enabled: false },
    devices: { markvu: false, metavu: false, evelab: false, janus: false },
    instagram: { enabled: false, accounts: [] },
    wechat: { enabled: false },
    line: { enabled: false },
  },
};

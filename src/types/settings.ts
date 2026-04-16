export type Locale = "ko" | "en" | "ja" | "zh" | "th";

export type AppointmentStatusKey = "reserved" | "checked_in" | "completed" | "cancelled";

export interface Branch {
  id: string;      // ex) "guro"
  name: string;    // ex) "구로"
}

export interface Part {
  id: string;      // ex) "doctor"
  label: string;   // ex) "원장"
}

export interface AppointmentStatusColumn {
  key: AppointmentStatusKey;
  label: string;
  order: number;
  enabled: boolean;
}

export interface AppointmentCategory {
  id: string;         // ex) "laser"
  label: string;      // ex) "레이저"
  enabled: boolean;
}

export interface AppointmentViewMode {
  id: string;          // ex) "byCategory"
  label: string;       // ex) "카테고리별"
  enabled: boolean;
}

export interface IntegrationsSetting {
  id: "website" | "ticket" | "naver" | "googleBusiness" | "kakao" | "line" | "instagram" | "whatsapp" | "wechat";
  label: string;
  enabled: boolean;
}

/** ================================
 *  설정 > 병원
 *  ================================ */
export interface HospitalSettings {
  /** 표시용 */
  hospitalNameKo: string;
  hospitalNameEn: string;

  businessNumber: string;
  providerNumber: string;
  medicalDepartments: string;
  effectiveDate: string; // YYYY-MM-DD
  address: string;
  phone: string;
  fax: string;
  industrialAccidentNumber: string;
  billingAgencyNumber: string;
  directorName: string;
  directorBirthDate: string; // YYYY-MM-DD

  /** base64 dataUrl */
  logoDataUrl?: string;
  stampHospitalDataUrl?: string;
  stampDirectorDataUrl?: string;
  operatingHours?: Record<string, string>;

  /** 카드 단말기 모드: kis (기본) / manual (수기 전용) / nice (예정) */
  terminalMode?: "kis" | "manual" | "nice";
}

/** ================================
 *  설정 > 차트
 *  ================================ */
export type StatusRuleKey = "tabletReception" | "sendDefault" | "startProgress";

export interface ChartWaitListItem {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  isInitialReception?: boolean;
  isCompletionLocation?: boolean;
}

export interface VisitPurposeItem {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  linkedSchedule?: string;
  dpSchedule?: string;
}

export interface StatusItem {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  colorHex: string;
  // 사용 시, 해당 상태 대기 시간이 기준 분을 넘으면 카드 알림을 표시합니다.
  alertEnabled?: boolean;
  // 상태별 기본 알림 기준 시간(분)
  alertAfterMinutes?: number;
  // 사용 시, 상태 변경 시점마다 환자별로 알림 시간을 다시 입력할 수 있습니다.
  allowPerPatientAlertMinutes?: boolean;
  isCompletionStatus?: boolean;
}

export interface ChartMemoSection {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  showInVisitHistory?: boolean;
  printEnabled?: boolean;
}

export interface CouponItem {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  discountPercent: number; // 0~100
  createdAt: string; // YYYY-MM-DD
}

export interface ProcedureTodoStatsProcedureGroupRule {
  id: string;
  name: string;
  keywords: string[];
}

export type StatusTransitionActionType =
  | "drag_move"
  | "reception_confirm"
  | "quick_reception"
  | "send"
  | "start_progress"
  | "tablet_reception";

export interface ChartStatusTransitionRule {
  id: string;
  actionType: StatusTransitionActionType | "any";
  fromLocationId: string; // "*" = any
  toLocationId: string;   // "*" = any
  defaultStatusId: string;
  enabled?: boolean;
  order?: number;
}

export interface ChartStatusRules {
  tabletReceptionStatusId: string; // StatusItem.id
  sendDefaultStatusId: string;     // StatusItem.id
  startProgressStatusId: string;   // StatusItem.id
  applyWaitOrderSorting: boolean;
  // 위치 이동/액션별 기본 상태 규칙(From -> To)
  statusTransitions?: ChartStatusTransitionRule[];
  // 차트 할일 담당자 선택에 노출할 직군 id 목록
  // 비어있거나 undefined이면 승인된 전체 멤버를 노출합니다.
  todoPerformerJobTitleIds?: string[];
  // 수납 담당자 선택에 노출할 직군 id 목록
  // 비어있거나 undefined이면 승인된 전체 멤버를 노출합니다.
  paymentAssigneeJobTitleIds?: string[];
  receptionDoctorJobTitleIds?: string[];
  // 할일 통계 직원 X 시술 표에서 시술명 묶음 규칙
  // 예) name='제모', keywords=['제모', '레이저제모', '인중제모']
  procedureTodoStatsProcedureGroups?: ProcedureTodoStatsProcedureGroupRule[];
}

export interface ChartConfigSettings {
  waitLists: ChartWaitListItem[];
  visitPurposes: VisitPurposeItem[];

  statusRules: ChartStatusRules;

  statuses: StatusItem[];
  memoSections: ChartMemoSection[];
  coupons: CouponItem[];
  patientTags: string[];
  tickets?: TicketsSettings;
  phrases?: PhrasesSettings;
  forms?: FormsSettings;
  integrations?: IntegrationsConfig;
  printConfig?: PrintConfigItem[];
}

export interface PrintConfigItem {
  key: string;
  enabled: boolean;
}

export interface ProcedureCategory {
  id: string;
  order?: number;
  name: string;
  type: string; // '재진', '초진', '상담', etc. Badge text
  reservationCount: number; // e.g. 5
  interval: number; // e.g. 30 (minutes)

  // Additional settings
  visitPurpose?: string[]; // ['상담', '제모']
  startDate?: string;
  endDate?: string;
  useEndDate?: boolean;
  openTimePoint?: string; // '1주 전', '2주 전', etc.
  days?: string[]; // ['월', '화'...]
  isPartner?: boolean;
  dailyReservationCounts?: Record<string, number>; // { '월': 5, '화': 3 ... }
  visitPurposeCapacities?: Record<string, number>; // { 'vp_shurink': 3, '슈링크': 3 }
  minVisitIntervalDays?: number; // patient revisit interval rule (days)
  visitPurposeIntervalDays?: Record<string, number>; // per visitPurpose interval days
  operatingHours?: Record<string, string>; // { '월': '10:00~20:30', ... }
  breakHours?: Record<string, string>; // { '월': '13:00~14:00', ... }
}

/** ================================
 *  설정 > 멤버
 *  ================================ */
export type BranchScope = "all" | "own";

// Simplified permission map: key -> boolean
export type PermissionMap = Record<string, boolean>;

export interface PermissionProfile {
  id: string;
  name: string;
  branchScope: BranchScope;
  permissions: PermissionMap;
}

export interface Department {
  id: string;
  name: string;
  order: number;
}

export interface JobTitle {
  id: string;
  name: string;
  order: number;
}

export interface MemberUser {
  id: string;
  name: string;
  email?: string;
  departmentId?: string;
  jobTitleId?: string;
  branchId?: string;
  permissionProfileId: string;
  lastPasswordChangedAt?: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  autoLogoutHours?: number;
  role?: string;
  isApproved?: boolean;
}

export interface MembersSettings {
  departments: Department[];
  jobTitles: JobTitle[];
  permissionProfiles: PermissionProfile[];
  users: MemberUser[];
  invitedAccounts: Array<{ id: string; name: string; createdAt: string }>; // placeholder
  tempAssignees: MemberUser[]; // placeholder
}

export interface ChartSettings {
  activeBranchId: string;
  branches: Branch[];
  parts: Part[];

  columns: AppointmentStatusColumn[];
  categories: AppointmentCategory[];
  viewModes: AppointmentViewMode[];

  cycleUnits: Array<{ id: "week" | "month" | "quarter" | "halfYear" | "year"; label: string; days: number }>;

  integrations: IntegrationsSetting[];

  hospital: HospitalSettings;
  chartConfig: ChartConfigSettings;
  members: MembersSettings;
  tickets: TicketsSettings;
  phrases: PhrasesSettings;
  forms: FormsSettings;
  integrationsConfig: IntegrationsConfig;
}

/** ================================
 *  설정 > 티켓
 *  ================================ */
export interface TicketItem {
  id: string;
  code: string;
  name: string;
  saleStartDate?: string; // YYYY-MM-DD
  saleEndDate?: string;   // YYYY-MM-DD
  usageUnit: "session" | "period" | "package";
  totalCount?: number; // if session
  validDays?: number;  // if period
  price?: number;
  eventPrice?: number | null;
  singleSessionPrice?: number | null;
  defaultPenaltyRate?: number | null;
  reservCategoryId?: number;
  reservCategoryName?: string;
  queueCategoryName?: string; // 시술 그룹(대기 계산 집계 기준)
  queueDurationMinutes?: number; // 시술 소요시간(분)
  packageType?: string;
  enabled: boolean;
  autoTodoEnabled: boolean;
  autoTodoTitleTemplate?: string;
  autoTodoTasks?: string[]; // multiple todo steps. supports "{treatment}" placeholder
  autoTodoProcedureName?: string; // legacy field (migrated to queueCategoryName)
  minIntervalDays?: number; // for period tickets
  maxTotalCount?: number;   // for period tickets (optional limit)

  // Usage Restrictions
  weekTicketId?: number;
  allowedDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat. If undefined/empty -> all days allowed
  allowedTimeRange?: {
    start: string; // "HH:mm"
    end: string;   // "HH:mm"
  };

  // Package Specific
  rounds?: PackageRound[];
}

export interface PackageRound {
  round: number;
  treatments: string[]; // e.g. ["아쿠아필", "시크릿", "모델링팩"]
  minIntervalDays?: number; // Previous round + days. Round 1 usually 0.
}

export interface TicketRestrictionPreset {
  id: string;
  label: string;
  allowedDays?: number[];
  allowedTimeRange?: {
    start: string;
    end: string;
  };
}

export interface MembershipItem {
  id: string;               // Unique identifier
  name: string;             // Display name (e.g., "골드 회원권")
  amount: number;           // Amount in KRW (100만원 units)
  bonusPoints: number;      // Bonus points awarded upon purchase
  discountPercent: number;  // Additional discount % (e.g., 3)
  enabled: boolean;         // Whether this membership is active
  order: number;            // Display order
  createdAt: string;        // YYYY-MM-DD
}

export interface TicketsSettings {
  items: TicketItem[];
  presets?: TicketRestrictionPreset[];
  memberships?: MembershipItem[];
}

/** ================================
 *  설정 > 문구
 *  ================================ */
export interface PhraseItem {
  id: string;
  shortcut: string; // e.g. "/diet"
  title: string;
  content: string;
  enabled: boolean;
  order: number;
}

export interface PhrasesSettings {
  my: PhraseItem[];
  clinic: PhraseItem[];
}

/** ================================
 *  설정 > 서식
 *  ================================ */
export interface FormTemplate {
  id: string;
  title: string;
  category: string;
  body: string;
  format: "plain" | "markdown" | "html";
  requireSignature: boolean;
  enabled: boolean;
  updatedAt: string;
  status?: "draft" | "published" | "archived";
  version?: number;
  publishedAt?: string;
}

export interface FormsSettings {
  templates: FormTemplate[];
}

/** ================================
 *  설정 > 연동
 *  ================================ */
export interface IntegrationsConfig {
  crm: {
    enabled: boolean;
    callerId?: string; // 대표번호
    tollFree080?: string;
    kakao?: {
      provider: string;   // aligo | solapi | bizmsg
      apiKey: string;
      userId: string;
      senderKey: string;
      senderPhone: string;
    };
  };
  nemonic: {
    enabled: boolean;
    printerName?: string;
  };
  devices: {
    markvu: boolean;
    metavu: boolean;
    evelab: boolean;
    janus: boolean;
  };
  instagram: {
    enabled: boolean;
    accounts: Array<{ id: string; name: string }>;
  };
  wechat: {
    enabled: boolean;
    officialId?: string;
  };
  line: {
    enabled: boolean;
    officialId?: string;
  };
}

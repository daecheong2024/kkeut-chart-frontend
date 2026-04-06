export type RevenuePeriod = "daily" | "weekly" | "monthly" | "yearly";

export type PaymentMethodKind =
  | "cash"
  | "card"
  | "pay"
  | "platform"
  | "transfer"
  | "easy_pay"
  | "other"
  | "insurance";

export type PaymentMethodSummary = {
  method: PaymentMethodKind;
  methodLabel: string;
  count: number;
  taxableSupply: number;
  taxableVat: number;
  taxFreeTotal: number;
  total: number; // taxableSupply + taxableVat + taxFreeTotal
  ratio: number; // 0~1
};

export type RevenueSummary = {
  /** 전체 합계(부가세 포함) */
  grossTotal: number;
  /** 환불/취소 합계(부가세 포함) */
  refundTotal: number;
  /** 순매출(= grossTotal - refundTotal) */
  netTotal: number;
  /** 결제 건수(정상) */
  paymentCount: number;
  /** 환불/취소 건수 */
  refundCount: number;

  /** 과세 공급가(부가세 제외) */
  taxableSupply: number;
  /** 과세 부가세 */
  taxableVat: number;
  /** 비과세(면세) 합계 */
  taxFreeTotal: number;
  membershipCashUsage: number;
  membershipPointUsage: number;
};

export type PaymentStatus = "paid" | "refunded" | "cancelled";

export type PaymentTransaction = {
  id: string;
  paidAtISO: string;
  patientId: string;
  patientName: string;
  chartNo?: string;
  counselorName?: string;
  doctorName?: string;
  staffName?: string; // 수납/코디 등
  method: PaymentMethodKind;
  methodLabel: string;
  paymentSubMethod?: string;
  paymentSubMethodLabel?: string;
  taxableSupply: number;
  taxableVat: number;
  taxFreeTotal: number;
  total: number;
  status: PaymentStatus;
  memo?: string;
};

export type StaffContribution = {
  staffId: string;
  staffName: string;
  count: number;
  taxableSupply: number;
  taxableVat: number;
  taxFreeTotal: number;
  total: number;
  ratio: number; // 0~1
};

export type MembershipIncentiveSummary = {
  staffId: string;
  staffName: string;
  paymentCount: number;
  itemCount: number;
  membershipAmount: number;
  ratio: number; // 0~1
};

export type MembershipIncentiveTransaction = {
  paymentId: string;
  paidAtISO: string;
  patientId: string;
  patientName: string;
  chartNo?: string;
  staffId: string;
  staffName: string;
  counselorName?: string;
  doctorName?: string;
  membershipAmount: number;
  membershipItemCount: number;
  membershipItems?: string;
  status: PaymentStatus;
  memo?: string;
};

export type RevenueDashboard = {
  period: RevenuePeriod;
  branchId: string;
  range: { startISO: string; endISO: string };
  summary: RevenueSummary;
  byMethod: PaymentMethodSummary[];
  transactions?: PaymentTransaction[];
  byStaff?: StaffContribution[];
  membershipByStaff?: MembershipIncentiveSummary[];
  membershipTransactions?: MembershipIncentiveTransaction[];
};

export type RevenueQuery = {
  period: RevenuePeriod;
  /** 기준일(선택한 날짜) */
  anchorDateISO: string;
  branchId: string;
};

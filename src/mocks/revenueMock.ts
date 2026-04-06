import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  formatISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type {
  PaymentMethodKind,
  PaymentTransaction,
  RevenueDashboard,
  RevenuePeriod,
  RevenueQuery,
  StaffContribution,
} from "../types/revenue";

const METHOD_LABEL: Record<PaymentMethodKind, string> = {
  cash: "현금",
  card: "카드",
  pay: "페이",
  platform: "플랫폼",
  transfer: "계좌이체",
  easy_pay: "간편결제",
  other: "기타",
  insurance: "보험청구",
};

const STAFF = [
  { id: "s1", name: "김민지" },
  { id: "s2", name: "오규빈" },
  { id: "s3", name: "미지정" },
  { id: "s4", name: "박서연" },
  { id: "s5", name: "이예림" },
];

const DOCTORS = ["원장A", "원장B", "원장C"];
const PATIENTS = [
  "김지훈",
  "박지민",
  "이서연",
  "최민수",
  "정다은",
  "윤서준",
  "한예진",
  "서하준",
  "홍유나",
  "오지호",
  "장민정",
  "조재혁",
  "이시예",
  "조영경",
  "이미연",
];

function hash32(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number) {
  // xorshift32
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function splitTax(amount: number, taxableRatio: number) {
  // taxableSupply + vat(10%) + taxFree
  const taxableTotal = Math.round(amount * taxableRatio);
  const taxFreeTotal = amount - taxableTotal;
  // VAT: 10% of supply. So taxableTotal = supply + vat = supply * 1.1
  const supply = Math.round(taxableTotal / 1.1);
  const vat = taxableTotal - supply;
  return { taxableSupply: supply, taxableVat: vat, taxFreeTotal };
}

function buildDayTransactions(dateISO: string, branchId: string): PaymentTransaction[] {
  const seed = hash32(`${branchId}|${dateISO}`);
  const rng = makeRng(seed);

  const count = clampInt(70 + rng() * 80, 30, 180);
  const baseDate = new Date(dateISO);

  const methods: PaymentMethodKind[] = ["card", "cash", "pay", "platform", "other", "insurance"];
  // 보험청구는 적게
  const methodWeight: Record<PaymentMethodKind, number> = {
    card: 0.57,
    cash: 0.20,
    pay: 0.14,
    platform: 0.04,
    other: 0.04,
    insurance: 0.01,
    transfer: 0,
    easy_pay: 0,
  };

  function weightedMethod(): PaymentMethodKind {
    const r = rng();
    let acc = 0;
    for (const m of methods) {
      acc += methodWeight[m];
      if (r <= acc) return m;
    }
    return "card";
  }

  const txs: PaymentTransaction[] = [];
  for (let i = 0; i < count; i++) {
    const patientName = pick(rng, PATIENTS);
    const staff = pick(rng, STAFF);
    const doctor = pick(rng, DOCTORS);

    // 금액: 1만 ~ 60만 사이, 가끔 큰 결제
    const big = rng() < 0.07;
    const amount = big
      ? clampInt(300_000 + rng() * 2_000_000, 300_000, 2_300_000)
      : clampInt(10_000 + rng() * 600_000, 10_000, 600_000);

    // taxable ratio: 의료서비스는 보통 면세가 많지만, 예시 화면처럼 과세/면세가 섞인 UI를 위해 0.55 내외로 생성
    const taxableRatio = 0.45 + rng() * 0.25; // 0.45~0.70
    const { taxableSupply, taxableVat, taxFreeTotal } = splitTax(amount, taxableRatio);

    // 환불/취소 소량
    const status: PaymentTransaction["status"] = rng() < 0.03 ? "refunded" : "paid";

    // 결제시각: 10:00~20:30 사이 랜덤
    const minutesFromOpen = clampInt(rng() * (10.5 * 60), 0, 10.5 * 60);
    const paidAt = addDays(baseDate, 0);
    paidAt.setHours(10, 0, 0, 0);
    paidAt.setMinutes(paidAt.getMinutes() + minutesFromOpen);

    const method = weightedMethod();

    txs.push({
      id: `PAY-${seed.toString(16)}-${i + 1}`,
      paidAtISO: formatISO(paidAt),
      patientId: `P-${1000 + (seed % 9000)}-${i + 1}`,
      patientName,
      chartNo: String(1000 + Math.floor(rng() * 9000)),
      doctorName: doctor,
      staffName: staff.name,
      method,
      methodLabel: METHOD_LABEL[method],
      taxableSupply,
      taxableVat,
      taxFreeTotal,
      total: taxableSupply + taxableVat + taxFreeTotal,
      status,
    });
  }

  return txs.sort((a, b) => (a.paidAtISO < b.paidAtISO ? -1 : 1));
}

function summarizeFromTransactions(branchId: string, period: RevenuePeriod, startISO: string, endISO: string, txs: PaymentTransaction[]): RevenueDashboard {
  const paid = txs.filter((t) => t.status === "paid");
  const refunded = txs.filter((t) => t.status !== "paid");

  const grossTotal = paid.reduce((s, t) => s + t.total, 0);
  const refundTotal = refunded.reduce((s, t) => s + t.total, 0);

  const taxableSupply = paid.reduce((s, t) => s + t.taxableSupply, 0);
  const taxableVat = paid.reduce((s, t) => s + t.taxableVat, 0);
  const taxFreeTotal = paid.reduce((s, t) => s + t.taxFreeTotal, 0);

  const totalForRatio = grossTotal || 1;

  const byMethodMap = new Map<PaymentMethodKind, { count: number; taxableSupply: number; taxableVat: number; taxFreeTotal: number; total: number }>();
  for (const t of paid) {
    const cur = byMethodMap.get(t.method) ?? { count: 0, taxableSupply: 0, taxableVat: 0, taxFreeTotal: 0, total: 0 };
    cur.count += 1;
    cur.taxableSupply += t.taxableSupply;
    cur.taxableVat += t.taxableVat;
    cur.taxFreeTotal += t.taxFreeTotal;
    cur.total += t.total;
    byMethodMap.set(t.method, cur);
  }

  const byMethod = Array.from(byMethodMap.entries())
    .map(([method, v]) => ({
      method,
      methodLabel: METHOD_LABEL[method],
      count: v.count,
      taxableSupply: v.taxableSupply,
      taxableVat: v.taxableVat,
      taxFreeTotal: v.taxFreeTotal,
      total: v.total,
      ratio: v.total / totalForRatio,
    }))
    .sort((a, b) => b.total - a.total);

  const byStaffMap = new Map<string, StaffContribution>();
  for (const t of paid) {
    const name = t.staffName || "미지정";
    const id = `staff:${name}`;
    const cur = byStaffMap.get(id) ?? {
      staffId: id,
      staffName: name,
      count: 0,
      taxableSupply: 0,
      taxableVat: 0,
      taxFreeTotal: 0,
      total: 0,
      ratio: 0,
    };
    cur.count += 1;
    cur.taxableSupply += t.taxableSupply;
    cur.taxableVat += t.taxableVat;
    cur.taxFreeTotal += t.taxFreeTotal;
    cur.total += t.total;
    byStaffMap.set(id, cur);
  }

  const byStaff = Array.from(byStaffMap.values())
    .map((s) => ({ ...s, ratio: s.total / totalForRatio }))
    .sort((a, b) => b.total - a.total);

  return {
    period,
    branchId,
    range: { startISO, endISO },
    summary: {
      grossTotal,
      refundTotal,
      netTotal: grossTotal - refundTotal,
      paymentCount: paid.length,
      refundCount: refunded.length,
      taxableSupply,
      taxableVat,
      taxFreeTotal,
    },
    byMethod,
    transactions: period === "daily" ? txs : undefined,
    byStaff: period === "daily" ? byStaff : undefined,
  };
}

function makeRange(anchor: Date, period: RevenuePeriod) {
  if (period === "daily") {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(anchor);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === "weekly") {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = endOfWeek(anchor, { weekStartsOn: 1 });
    return { start, end };
  }
  if (period === "monthly") {
    const start = startOfMonth(anchor);
    const end = endOfMonth(anchor);
    return { start, end };
  }
  const start = startOfYear(anchor);
  const end = endOfYear(anchor);
  return { start, end };
}

function buildAggregate(period: RevenuePeriod, anchor: Date, branchId: string) {
  // 일간은 상세 거래내역 기반, 나머지는 일별 트랜잭션을 몇 일치 샘플링해서 합산
  const { start, end } = makeRange(anchor, period);

  if (period === "daily") {
    const dateISO = formatISO(start, { representation: "date" });
    const txs = buildDayTransactions(dateISO, branchId);
    return summarizeFromTransactions(branchId, period, formatISO(start), formatISO(end), txs);
  }

  const days: PaymentTransaction[] = [];
  let d = new Date(start);
  while (d <= end) {
    const dateISO = formatISO(d, { representation: "date" });
    // 주/월/연은 건수가 너무 많아지므로 하루치 일부만 샘플링
    const dayTxs = buildDayTransactions(dateISO, branchId);
    const sample = dayTxs.slice(0, Math.max(12, Math.floor(dayTxs.length * 0.15)));
    days.push(...sample);
    d = addDays(d, 1);
  }

  // 기간이 길수록 실제 건수/금액이 과소추정되므로 period별 스케일 보정
  const scaler = period === "weekly" ? 6.0 : period === "monthly" ? 18.0 : 220.0;
  const scaled = days.map((t) => ({ ...t, taxableSupply: Math.round(t.taxableSupply * scaler), taxableVat: Math.round(t.taxableVat * scaler), taxFreeTotal: Math.round(t.taxFreeTotal * scaler), total: Math.round(t.total * scaler) }));
  return summarizeFromTransactions(branchId, period, formatISO(start), formatISO(end), scaled);
}

export function mockRevenueDashboard(q: RevenueQuery): RevenueDashboard {
  const anchor = new Date(q.anchorDateISO);
  return buildAggregate(q.period, anchor, q.branchId);
}

export function shiftAnchorDate(period: RevenuePeriod, anchor: Date, delta: number) {
  if (period === "daily") return addDays(anchor, delta);
  if (period === "weekly") return addDays(anchor, delta * 7);
  if (period === "monthly") return addMonths(anchor, delta);
  return addYears(anchor, delta);
}

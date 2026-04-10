import React, { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addMonths, addYears, format } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";

import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { CustomDatePicker } from "../components/common/CustomDatePicker";
import { useSettingsStore } from "../stores/useSettingsStore";
import { revenueService } from "../services/revenueService";
import type { ReceivablesResponse } from "../services/revenueService";
import type { RevenueDashboard, RevenuePeriod, PaymentMethodKind, PaymentStatus } from "../types/revenue";
import { useCurrentUserPermissions } from "../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../components/common/NoPermissionOverlay";

const PERIODS: { key: RevenuePeriod; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "monthly", label: "월간" },
  { key: "yearly", label: "연간" },
];

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "전체 결제수단" },
  { value: "card", label: "카드" },
  { value: "cash", label: "현금" },
  { value: "pay", label: "페이" },
  { value: "platform", label: "플랫폼" },
  { value: "other", label: "기타" },
  { value: "insurance", label: "보험청구" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "전체 상태" },
  { value: "paid", label: "정상" },
  { value: "refunded", label: "환불" },
  { value: "cancelled", label: "취소" },
];

function won(n: number) {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function pct(ratio: number) {
  return `${(ratio * 100).toFixed(1)}%`;
}

function shiftAnchor(period: RevenuePeriod, anchor: Date, delta: number) {
  if (period === "daily") return addDays(anchor, delta);
  if (period === "weekly") return addDays(anchor, delta * 7);
  if (period === "monthly") return addMonths(anchor, delta);
  return addYears(anchor, delta);
}

function PeriodLabel({ data }: { data: RevenueDashboard }) {
  const start = new Date(data.range.startISO);
  const end = new Date(data.range.endISO);

  if (data.period === "daily") {
    return (
      <span className="text-sm text-gray-600">
        {format(start, "yyyy. MM. dd (EEE)", { locale: ko })}
      </span>
    );
  }

  if (data.period === "weekly") {
    return (
      <span className="text-sm text-gray-600">
        {format(start, "yyyy. MM. dd", { locale: ko })} ~ {format(end, "yyyy. MM. dd", { locale: ko })}
      </span>
    );
  }

  if (data.period === "monthly") {
    return <span className="text-sm text-gray-600">{format(start, "yyyy년 M월", { locale: ko })}</span>;
  }

  return <span className="text-sm text-gray-600">{format(start, "yyyy년", { locale: ko })}</span>;
}

function SectionCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#F8DCE2] bg-white" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
      <div className="flex items-center justify-between gap-3 border-b border-[#F8DCE2] bg-[#FCF7F8] px-5 py-4 rounded-t-2xl">
        <div className="text-sm font-semibold text-[#5C2A35]">{title}</div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#F8DCE2] bg-white px-4 py-3 text-center" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
      <div className="text-[11px] font-medium text-[#616161]">{label}</div>
      <div className="mt-1 text-base font-bold text-[#5C2A35] tabular-nums">{value}</div>
    </div>
  );
}

type TabKey = "stats" | "receivables";

export default function RevenueStatsPage() {
  const { settings } = useSettingsStore();
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);
  if (permLoaded && !permissions["stats.revenue.view"]) return <NoPermissionOverlay />;

  const [activeTab, setActiveTab] = useState<TabKey>("stats");
  const [period, setPeriod] = useState<RevenuePeriod>("daily");
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RevenueDashboard | null>(null);

  const [receivablesData, setReceivablesData] = useState<ReceivablesResponse | null>(null);
  const [receivablesLoading, setReceivablesLoading] = useState(false);
  const [receivablesError, setReceivablesError] = useState<string | null>(null);
  const [receivablesSearch, setReceivablesSearch] = useState("");
  const [receivablesCategory, setReceivablesCategory] = useState<"receivable" | "refundCompleted">("receivable");
  const [expandedReceivableIdx, setExpandedReceivableIdx] = useState<number | null>(null);
  const [receivablesPage, setReceivablesPage] = useState(1);
  const receivablesPageSize = 50;

  // daily-only filters
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("paid");
  const [membershipSearch, setMembershipSearch] = useState("");
  const [membershipStatusFilter, setMembershipStatusFilter] = useState<string>("all");

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setError(null);
        setLoading(true);
        const res = await revenueService.getDashboard({
          period,
          branchId: settings.activeBranchId,
          anchorDateISO: anchorDate.toISOString(),
        });
        if (!mounted) return;
        setData(res);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "매출 통계를 불러오지 못했습니다.");
        setData(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    void run();

    return () => {
      mounted = false;
    };
  }, [period, anchorDate, settings.activeBranchId]);

  const totalsByMethod = useMemo(() => {
    if (!data) return null;
    const t = data.byMethod.reduce(
      (acc, m) => {
        acc.count += m.count;
        acc.taxableSupply += m.taxableSupply;
        acc.taxableVat += m.taxableVat;
        acc.taxFreeTotal += m.taxFreeTotal;
        acc.total += m.total;
        return acc;
      },
      { count: 0, taxableSupply: 0, taxableVat: 0, taxFreeTotal: 0, total: 0 }
    );
    return t;
  }, [data]);

  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];

    const q = search.trim().toLowerCase();
    const method = methodFilter as PaymentMethodKind | "all";
    const status = statusFilter as PaymentStatus | "all";

    return data.transactions.filter((t) => {
      if (method !== "all" && t.method !== method) return false;
      if (status !== "all" && t.status !== status) return false;

      if (!q) return true;
      const hay = [
        t.patientName,
        t.patientId,
        t.chartNo ?? "",
        t.counselorName ?? "",
        t.doctorName ?? "",
        t.staffName ?? "",
        t.methodLabel,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, methodFilter, statusFilter]);

  const filteredMembershipTransactions = useMemo(() => {
    const rows = data?.membershipTransactions ?? [];
    const q = membershipSearch.trim().toLowerCase();
    const status = membershipStatusFilter as PaymentStatus | "all";

    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;

      const hay = [
        row.patientName,
        row.patientId,
        row.chartNo ?? "",
        row.staffName ?? "",
        row.counselorName ?? "",
        row.doctorName ?? "",
        row.membershipItems ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data, membershipSearch, membershipStatusFilter]);

  const membershipSummaryTotal = useMemo(() => {
    const rows = data?.membershipByStaff ?? [];
    return rows.reduce(
      (acc, row) => {
        acc.paymentCount += row.paymentCount;
        acc.itemCount += row.itemCount;
        acc.membershipAmount += row.membershipAmount;
        return acc;
      },
      { paymentCount: 0, itemCount: 0, membershipAmount: 0 }
    );
  }, [data]);

  const staffSummaryTotal = useMemo(() => {
    const rows = data?.byStaff ?? [];
    return rows.reduce(
      (acc, row) => {
        acc.count += row.count;
        acc.taxableSupply += row.taxableSupply;
        acc.taxableVat += row.taxableVat;
        acc.taxFreeTotal += row.taxFreeTotal;
        acc.total += row.total;
        return acc;
      },
      { count: 0, taxableSupply: 0, taxableVat: 0, taxFreeTotal: 0, total: 0 }
    );
  }, [data]);

  const loadReceivables = useCallback(async () => {
    setReceivablesLoading(true);
    setReceivablesError(null);
    try {
      const res = await revenueService.getReceivables({
        period,
        branchId: settings.activeBranchId,
        anchorDateISO: anchorDate.toISOString(),
      });
      setReceivablesData(res);
    } catch (e) {
      setReceivablesError(e instanceof Error ? e.message : "미수/환불 데이터를 불러오지 못했습니다.");
    } finally {
      setReceivablesLoading(false);
    }
  }, [period, anchorDate, settings.activeBranchId]);

  useEffect(() => {
    if (activeTab === "receivables") {
      void loadReceivables();
    }
  }, [activeTab, loadReceivables]);

  const filteredReceivablePatients = useMemo(() => {
    if (!receivablesData) return [];
    const source = receivablesCategory === "receivable"
      ? receivablesData.receivablePatients.map((p) => ({ ...p, amount: p.receivableAmount, date: p.addedDate, tickets: p.tickets ?? [], details: [] as { paymentType: string; authNo: string; refundAmount: number; refundSupplyAmount: number; refundVatAmount: number; refundNonTaxAmount: number; refundDate: string }[] }))
      : receivablesData.refundCompletedPatients.map((p) => ({ ...p, amount: p.refundAmount, date: p.refundDate, tickets: [] as { ticketId: number; ticketName: string; unitPrice: number; quantity: number; subTotal: number }[], details: p.details ?? [] }));

    const q = receivablesSearch.trim().toLowerCase();
    if (!q) return source;
    return source.filter((p) =>
      [String(p.customerId), p.customerName, p.telNo].join(" ").toLowerCase().includes(q)
    );
  }, [receivablesData, receivablesCategory, receivablesSearch]);

  const receivablesTotalPages = Math.max(1, Math.ceil(filteredReceivablePatients.length / receivablesPageSize));
  const pagedReceivablePatients = filteredReceivablePatients.slice(
    (receivablesPage - 1) * receivablesPageSize,
    receivablesPage * receivablesPageSize
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
      <TopBar title="수납" />

      <div className="flex items-center gap-1 border-b border-[#F8DCE2] bg-white px-6">
        {([
          { key: "stats" as TabKey, label: "수납통계" },
          { key: "receivables" as TabKey, label: "미수/환불 내역" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              "px-5 h-12 text-sm font-semibold border-b-2 transition-all duration-200 " +
              (activeTab === tab.key
                ? "border-[#D27A8C] text-[#D27A8C]"
                : "border-transparent text-gray-500 hover:text-gray-700")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 p-6 overflow-y-auto">
        {activeTab === "stats" && (<>
        {/* Toolbar */}
        <div className="rounded-2xl border border-[#F8DCE2] bg-white px-5 py-4" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center justify-center px-4 h-10 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-500 min-w-[120px]">
                {settings.branches.find(b => b.id === settings.activeBranchId)?.name || '지점'}
              </div>

              <div className="flex items-center rounded-lg border border-[#F8DCE2] bg-white p-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={
                      "px-4 h-10 text-sm font-medium rounded-lg transition-all duration-200 inline-flex items-center " +
                      (period === p.key
                        ? "bg-[#D27A8C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]"
                        : "text-[#616161] hover:bg-[#FCEBEF] hover:text-[#5C2A35]")
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {data && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">선택기간</span>
                  <PeriodLabel data={data} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setAnchorDate((d) => shiftAnchor(period, d, -1))}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                이전
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setAnchorDate((d) => shiftAnchor(period, d, 1))}
                className="gap-1"
              >
                다음
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setAnchorDate(new Date())}
                className="gap-1"
              >
                <RotateCcw className="h-4 w-4" />
                오늘
              </Button>

              <div className="min-w-[220px]">
                <CustomDatePicker value={anchorDate} onChange={setAnchorDate} />
              </div>
            </div>
          </div>

          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          {loading && <div className="mt-3 text-sm text-gray-400">불러오는 중…</div>}
        </div>

        {data && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <StatPill label="총 결제금액" value={won(data.summary.grossTotal)} />
              <StatPill label="환불/취소" value={won(data.summary.refundTotal)} />
              <StatPill label="순매출" value={won(data.summary.netTotal)} />
            </div>

            {/* Method summary */}
            <SectionCard title="결제수단별 요약">
              <div className="overflow-auto">
                <table className="w-full min-w-[920px] table-fixed">
                  <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                    <tr className="border-b border-gray-100">
                      <th className="w-40 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">결제수단</th>
                      <th className="w-20 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">건수</th>
                      <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">과세 공급가</th>
                      <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">부가세</th>
                      <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">비과세</th>
                      <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">합계</th>
                      <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byMethod.map((m) => (
                      <tr key={m.method} className="group hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                        <td className="py-3 px-2 text-sm font-medium text-gray-900 text-center">{m.methodLabel}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{m.count.toLocaleString("ko-KR")}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{won(m.taxableSupply)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{won(m.taxableVat)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{won(m.taxFreeTotal)}</td>
                        <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">{won(m.total)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{pct(m.ratio)}</td>
                      </tr>
                    ))}

                    {totalsByMethod && (
                      <tr className="border-t border-[rgb(var(--kkeut-border))] bg-gray-50">
                        <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">합계</td>
                        <td className="py-3 px-2 text-sm text-gray-700 text-center">{totalsByMethod.count.toLocaleString("ko-KR")}</td>
                        <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(totalsByMethod.taxableSupply)}</td>
                        <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(totalsByMethod.taxableVat)}</td>
                        <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(totalsByMethod.taxFreeTotal)}</td>
                        <td className="py-3 px-2 text-sm font-bold text-gray-900 text-center">{won(totalsByMethod.total)}</td>
                        <td className="py-3 px-2 text-sm text-gray-700 text-center">100.0%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
                <StatPill label="과세 공급가" value={won(data.summary.taxableSupply)} />
                <StatPill label="부가세" value={won(data.summary.taxableVat)} />
                <StatPill label="비과세" value={won(data.summary.taxFreeTotal)} />
                <StatPill label="회원권 현금 사용" value={won(data.summary.membershipCashUsage ?? 0)} />
                <StatPill label="회원권 포인트 사용" value={won(data.summary.membershipPointUsage ?? 0)} />
              </div>
            </SectionCard>

            <SectionCard title="직원별 매출 기여 (수납자 기준)">
              <div className="overflow-auto">
                <table className="w-full min-w-[980px] table-fixed">
                  <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                    <tr className="border-b border-gray-100">
                      <th className="w-40 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">직원</th>
                      <th className="w-20 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">건수</th>
                      <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">과세 공급가</th>
                      <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">부가세</th>
                      <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">비과세</th>
                      <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">합계</th>
                      <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.byStaff ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-gray-400 text-sm">
                          기간 내 직원 귀속 매출 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      (data.byStaff ?? []).map((s) => (
                        <tr key={s.staffId} className="group hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                          <td className="py-3 px-2 text-sm font-medium text-gray-900 text-center">{s.staffName}</td>
                          <td className="py-3 px-2 text-sm text-gray-600 text-center">{s.count.toLocaleString("ko-KR")}</td>
                          <td className="py-3 px-2 text-sm text-gray-600 text-center">{won(s.taxableSupply)}</td>
                          <td className="py-3 px-2 text-sm text-gray-600 text-center">{won(s.taxableVat)}</td>
                          <td className="py-3 px-2 text-sm text-gray-600 text-center">{won(s.taxFreeTotal)}</td>
                          <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">{won(s.total)}</td>
                          <td className="py-3 px-2 text-sm text-gray-600 text-center">{pct(s.ratio)}</td>
                        </tr>
                      ))
                    )}

                    <tr className="border-t border-[rgb(var(--kkeut-border))] bg-gray-50">
                      <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">합계</td>
                      <td className="py-3 px-2 text-sm text-gray-700 text-center">{staffSummaryTotal.count.toLocaleString("ko-KR")}</td>
                      <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(staffSummaryTotal.taxableSupply)}</td>
                      <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(staffSummaryTotal.taxableVat)}</td>
                      <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(staffSummaryTotal.taxFreeTotal)}</td>
                      <td className="py-3 px-2 text-sm font-bold text-gray-900 text-center">{won(staffSummaryTotal.total)}</td>
                      <td className="py-3 px-2 text-sm text-gray-700 text-center">
                        {staffSummaryTotal.total > 0 ? "100.0%" : "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title="직원별 회원권 결제 유치">
              <div className="overflow-auto">
                <table className="w-full min-w-[860px] table-fixed">
                  <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                    <tr className="border-b border-gray-100">
                      <th className="w-40 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">직원</th>
                      <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">회원권 결제 건수</th>
                      <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">회원권 항목수</th>
                      <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">회원권 결제금액</th>
                      <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.membershipByStaff ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-gray-400 text-sm">
                          기간 내 회원권 결제 유치 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      (data.membershipByStaff ?? []).map((s) => (
                        <tr key={s.staffId} className="group hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                          <td className="py-3 px-2 text-sm font-medium text-gray-900 text-center">{s.staffName}</td>
                          <td className="py-3 px-2 text-sm text-gray-600 text-center">{s.paymentCount.toLocaleString("ko-KR")}</td>
                          <td className="py-3 px-2 text-sm text-gray-600 text-center">{s.itemCount.toLocaleString("ko-KR")}</td>
                          <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">{won(s.membershipAmount)}</td>
                          <td className="py-3 px-2 text-sm text-gray-600 text-center">{pct(s.ratio)}</td>
                        </tr>
                      ))
                    )}

                    <tr className="border-t border-[rgb(var(--kkeut-border))] bg-gray-50">
                      <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">합계</td>
                      <td className="py-3 px-2 text-sm text-gray-700 text-center">
                        {membershipSummaryTotal.paymentCount.toLocaleString("ko-KR")}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-700 text-center">
                        {membershipSummaryTotal.itemCount.toLocaleString("ko-KR")}
                      </td>
                      <td className="py-3 px-2 text-sm font-bold text-gray-900 text-center">
                        {won(membershipSummaryTotal.membershipAmount)}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-700 text-center">
                        {membershipSummaryTotal.membershipAmount > 0 ? "100.0%" : "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard
              title="회원권 결제 건별 내역"
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      value={membershipSearch}
                      onChange={(e) => setMembershipSearch(e.target.value)}
                      placeholder="환자명/환자번호/직원/회원권 검색"
                      className="h-10 w-[280px] rounded-xl border border-[rgb(var(--kkeut-border))] bg-white pl-9 pr-3 text-sm outline-none focus:border-[rgba(var(--kkeut-primary),.55)] focus:ring-2 focus:ring-[rgba(var(--kkeut-primary),.15)]"
                    />
                  </div>
                  <Select
                    value={membershipStatusFilter}
                    onChange={(e) => setMembershipStatusFilter(e.target.value)}
                    options={STATUS_OPTIONS}
                    className="h-10"
                  />
                </div>
              }
            >
              <div className="overflow-auto">
                <table className="w-full min-w-[1250px] table-fixed">
                  <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                    <tr className="border-b border-gray-100">
                      <th className="w-36 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">결제일시</th>
                      <th className="w-36 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">환자</th>
                      <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">차트번호</th>
                      <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">상담</th>
                      <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">원장상담</th>
                      <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">수납직원</th>
                      <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">회원권 결제금액</th>
                      <th className="w-36 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">회원권 항목</th>
                      <th className="w-20 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembershipTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-gray-400 text-sm">
                          표시할 회원권 결제 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredMembershipTransactions.map((row) => (
                        <tr key={row.paymentId} className="group hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                          <td className="py-3 px-2 text-sm text-gray-700 text-center">
                            {format(new Date(row.paidAtISO), "MM.dd HH:mm")}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <div className="text-sm font-medium text-gray-900">{row.patientName}</div>
                            <div className="text-[11px] text-gray-400">{row.patientId}</div>
                          </td>
                          <td className="py-3 px-2 text-sm text-gray-700 text-center">{row.chartNo ?? "-"}</td>
                          <td className="py-3 px-2 text-sm text-gray-700 text-center">{row.counselorName ?? "-"}</td>
                          <td className="py-3 px-2 text-sm text-gray-700 text-center">{row.doctorName ?? "-"}</td>
                          <td className="py-3 px-2 text-sm text-gray-700 text-center">{row.staffName || "-"}</td>
                          <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">{won(row.membershipAmount)}</td>
                          <td className="py-3 px-2 text-sm text-gray-700 text-center">
                            {row.membershipItems
                              ? row.membershipItems
                              : `${row.membershipItemCount.toLocaleString("ko-KR")}건`}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span
                              className={
                                "inline-flex rounded-full px-2 py-1 text-[11px] font-medium " +
                                (row.status === "paid"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : row.status === "refunded"
                                    ? "bg-rose-50 text-rose-700"
                                    : "bg-gray-100 text-gray-600")
                              }
                            >
                              {row.status === "paid" ? "정상" : row.status === "refunded" ? "환불" : "취소"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* Daily-only section */}
            {data.period === "daily" && (
              <SectionCard
                title="일자별 결제 내역"
                right={
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="환자명/환자번호/직원/차트번호 검색"
                        className="h-10 w-[280px] rounded-xl border border-[rgb(var(--kkeut-border))] bg-white pl-9 pr-3 text-sm outline-none focus:border-[rgba(var(--kkeut-primary),.55)] focus:ring-2 focus:ring-[rgba(var(--kkeut-primary),.15)]"
                      />
                    </div>

                    <Select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} options={METHOD_OPTIONS} className="h-10" />
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_OPTIONS} className="h-10" />
                  </div>
                }
              >
                <div className="overflow-auto">
                  <table className="w-full min-w-[1320px] table-fixed">
                    <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                      <tr className="border-b border-gray-100">
                        <th className="w-36 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">결제시간</th>
                        <th className="w-36 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">환자</th>
                        <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">차트번호</th>
                        <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">상담</th>
                        <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">원장상담</th>
                        <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">수납직원</th>
                        <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">결제수단</th>
                        <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">과세 공급가</th>
                        <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">부가세</th>
                        <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">비과세</th>
                        <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">합계</th>
                        <th className="w-20 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="py-10 text-center text-gray-400 text-sm">
                            표시할 결제 내역이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((t) => (
                          <tr key={t.id} className="group hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">
                              {format(new Date(t.paidAtISO), "HH:mm")}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <div className="text-sm font-medium text-gray-900">{t.patientName}</div>
                              <div className="text-[11px] text-gray-400">{t.patientId}</div>
                            </td>
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">{t.chartNo ?? "-"}</td>
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">{t.counselorName ?? "-"}</td>
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">{t.doctorName ?? "-"}</td>
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">{t.staffName ?? "-"}</td>
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">{t.methodLabel}</td>
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(t.taxableSupply)}</td>
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(t.taxableVat)}</td>
                            <td className="py-3 px-2 text-sm text-gray-700 text-center">{won(t.taxFreeTotal)}</td>
                            <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">{won(t.total)}</td>
                            <td className="py-3 px-2 text-center">
                              <span
                                className={
                                  "inline-flex rounded-full px-2 py-1 text-[11px] font-medium " +
                                  (t.status === "paid"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : t.status === "refunded"
                                      ? "bg-rose-50 text-rose-700"
                                      : "bg-gray-100 text-gray-600")
                                }
                              >
                                {t.status === "paid" ? "정상" : t.status === "refunded" ? "환불" : "취소"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}
          </>
        )}
        </>)}

        {activeTab === "receivables" && (
          <div className="flex gap-6 min-h-0">
            <div className="w-[340px] shrink-0 space-y-3">
              <div className="rounded-2xl border border-[#F8DCE2] bg-white px-5 py-4" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center rounded-lg border border-[#F8DCE2] bg-white p-1">
                    {PERIODS.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => setPeriod(p.key)}
                        className={
                          "px-4 h-10 text-sm font-medium rounded-lg transition-all duration-200 inline-flex items-center " +
                          (period === p.key
                            ? "bg-[#D27A8C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]"
                            : "text-[#616161] hover:bg-[#FCEBEF] hover:text-[#5C2A35]")
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="w-full">
                    <CustomDatePicker value={anchorDate} onChange={setAnchorDate} />
                  </div>
                </div>
              </div>

              {[
                {
                  key: "receivable" as const,
                  label: "미수 환자",
                  color: "#C62828",
                  bg: "#FFF3F3",
                  border: "#FFCDD2",
                  count: receivablesData?.receivable.patientCount ?? 0,
                  sub: `총 ${receivablesData?.receivable.itemCount ?? 0}건/ ${won(receivablesData?.receivable.totalAmount ?? 0)}`,
                },
                {
                  key: "refundCompleted" as const,
                  label: "환불 완료 환자",
                  color: "#1565C0",
                  bg: "#E3F2FD",
                  border: "#90CAF9",
                  count: receivablesData?.refundCompleted.patientCount ?? 0,
                  sub: `총 ${receivablesData?.refundCompleted.itemCount ?? 0}건/ ${won(receivablesData?.refundCompleted.totalAmount ?? 0)}`,
                },
              ].map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => { if (card.key) { setReceivablesCategory(card.key); setReceivablesPage(1); setExpandedReceivableIdx(null); } }}
                  className={
                    "w-full rounded-2xl border px-4 py-3 text-left transition-all " +
                    (card.key === receivablesCategory
                      ? "ring-2 ring-[#D27A8C] ring-offset-1"
                      : "")
                  }
                  style={{ backgroundColor: card.bg, borderColor: card.border }}
                  disabled={!card.key}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: card.color }}>{card.label}</span>
                    <span className="text-lg font-extrabold tabular-nums" style={{ color: card.color }}>{card.count}명</span>
                  </div>
                  <div className="mt-1 text-xs font-medium" style={{ color: card.color }}>{card.sub}</div>
                </button>
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <SectionCard
                title={receivablesCategory === "receivable" ? `미수 내역 ${filteredReceivablePatients.length}` : `환불 완료 내역 ${filteredReceivablePatients.length}`}
                right={
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      value={receivablesSearch}
                      onChange={(e) => { setReceivablesSearch(e.target.value); setReceivablesPage(1); }}
                      placeholder="환자번호, 환자명으로 검색"
                      className="h-10 w-[260px] rounded-xl border border-[rgb(var(--kkeut-border))] bg-white pl-9 pr-3 text-sm outline-none focus:border-[rgba(var(--kkeut-primary),.55)] focus:ring-2 focus:ring-[rgba(var(--kkeut-primary),.15)]"
                    />
                  </div>
                }
              >
                {receivablesLoading && <div className="py-6 text-center text-sm text-gray-400">불러오는 중…</div>}
                {receivablesError && <div className="py-6 text-center text-sm text-red-500">{receivablesError}</div>}

                {!receivablesLoading && !receivablesError && (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[700px] table-fixed">
                      <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                        <tr className="border-b border-gray-100">
                          <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">환자번호</th>
                          <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">환자명</th>
                          <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">연락처</th>
                          <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">
                            {receivablesCategory === "receivable" ? "장바구니 추가일" : "환불일"}
                          </th>
                          <th className="w-28 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">
                            {receivablesCategory === "receivable" ? "미수 금액" : "환불 금액"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedReceivablePatients.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-gray-400 text-sm">데이터가 없습니다.</td>
                          </tr>
                        ) : (
                          pagedReceivablePatients.map((p, i) => {
                            const globalIdx = (receivablesPage - 1) * receivablesPageSize + i;
                            const hasDetail = receivablesCategory === "receivable" ? p.tickets?.length > 0 : p.details?.length > 0;
                            const isExpanded = expandedReceivableIdx === globalIdx;
                            return (
                            <React.Fragment key={`${p.customerId}-${i}`}>
                              <tr
                                className={`group border-b border-gray-50 last:border-0 transition-colors ${hasDetail ? "cursor-pointer hover:bg-[#F0F2FF]" : "hover:bg-gray-50"} ${isExpanded ? "bg-[#F0F2FF]" : ""}`}
                                onClick={() => {
                                  if (hasDetail) setExpandedReceivableIdx(isExpanded ? null : globalIdx);
                                }}
                              >
                                <td className="py-3 px-2 text-sm text-gray-700 text-center">
                                  {hasDetail ? (
                                    <span className="inline-flex items-center gap-1">
                                      <ChevronDown className={`h-3.5 w-3.5 text-[#D27A8C] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                      {p.customerId}
                                    </span>
                                  ) : p.customerId}
                                </td>
                                <td className="py-3 px-2 text-sm font-medium text-gray-900 text-center">{p.customerName}</td>
                                <td className="py-3 px-2 text-sm text-gray-700 text-center">{p.telNo}</td>
                                <td className="py-3 px-2 text-sm text-gray-700 text-center">{p.date}</td>
                                <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">{won(p.amount)}</td>
                              </tr>
                              {isExpanded && receivablesCategory === "receivable" && p.tickets?.length > 0 && (
                                <tr className="bg-[#FAFBFF]">
                                  <td colSpan={5} className="px-4 py-2">
                                    <table className="w-full">
                                      <thead>
                                        <tr className="border-b border-[#FCEBEF]">
                                          <th className="py-2 px-2 text-center text-xs font-semibold text-[#5C6BC0]">티켓명</th>
                                          <th className="py-2 px-2 text-center text-xs font-semibold text-[#5C6BC0]">단가</th>
                                          <th className="py-2 px-2 text-center text-xs font-semibold text-[#5C6BC0]">수량</th>
                                          <th className="py-2 px-2 text-center text-xs font-semibold text-[#5C6BC0]">소계</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {p.tickets.map((t: { ticketId: number; ticketName: string; unitPrice: number; quantity: number; subTotal: number }, ti: number) => (
                                          <tr key={ti} className="border-b border-[#F0F1FA] last:border-0">
                                            <td className="py-2 px-2 text-sm text-gray-700 text-center">{t.ticketName}</td>
                                            <td className="py-2 px-2 text-sm text-gray-600 text-center">{won(t.unitPrice)}</td>
                                            <td className="py-2 px-2 text-sm text-gray-600 text-center">{t.quantity}개</td>
                                            <td className="py-2 px-2 text-sm font-semibold text-gray-800 text-center tabular-nums">{won(t.subTotal)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                              {isExpanded && receivablesCategory === "refundCompleted" && p.details?.length > 0 && (
                                <tr className="bg-[#FFF8F6]">
                                  <td colSpan={5} className="px-4 py-2">
                                    <table className="w-full">
                                      <thead>
                                        <tr className="border-b border-[#FFCCBC]">
                                          <th className="py-2 px-2 text-center text-xs font-semibold text-[#E64A19]">결제수단</th>
                                          <th className="py-2 px-2 text-center text-xs font-semibold text-[#E64A19]">승인번호</th>
                                          <th className="py-2 px-2 text-center text-xs font-semibold text-[#E64A19]">환불일시</th>
                                          <th className="py-2 px-2 text-center text-xs font-semibold text-[#E64A19]">환불금액</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {p.details.map((d: { paymentType: string; authNo: string; refundAmount: number; refundDate: string }, di: number) => (
                                          <tr key={di} className="border-b border-[#FFE0D0] last:border-0">
                                            <td className="py-2 px-2 text-sm text-gray-700 text-center">{d.paymentType}</td>
                                            <td className="py-2 px-2 text-sm text-gray-600 text-center">{d.authNo}</td>
                                            <td className="py-2 px-2 text-sm text-gray-600 text-center">{d.refundDate}</td>
                                            <td className="py-2 px-2 text-sm font-semibold text-gray-800 text-center tabular-nums">{won(d.refundAmount)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {filteredReceivablePatients.length > receivablesPageSize && (
                  <div className="flex items-center justify-center gap-2 py-3 border-t border-[#F8DCE2]">
                    <button
                      disabled={receivablesPage <= 1}
                      onClick={() => { setReceivablesPage((p) => Math.max(1, p - 1)); setExpandedReceivableIdx(null); }}
                      className="h-8 px-3 rounded-lg border border-[#F8DCE2] bg-white text-xs font-medium text-[#242424] hover:bg-[#FCEBEF] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      이전
                    </button>
                    <span className="text-xs text-[#616161]">
                      {receivablesPage} / {receivablesTotalPages} 페이지
                      <span className="ml-2 text-[#9E9E9E]">(총 {filteredReceivablePatients.length}건)</span>
                    </span>
                    <button
                      disabled={receivablesPage >= receivablesTotalPages}
                      onClick={() => { setReceivablesPage((p) => p + 1); setExpandedReceivableIdx(null); }}
                      className="h-8 px-3 rounded-lg border border-[#F8DCE2] bg-white text-xs font-medium text-[#242424] hover:bg-[#FCEBEF] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      다음
                    </button>
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ko } from "date-fns/locale";
import { RotateCcw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CustomDatePicker } from "../components/common/CustomDatePicker";
import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import { procedureTodoStatsService } from "../services/procedureTodoStatsService";
import { useSettingsStore } from "../stores/useSettingsStore";
import type { ProcedureTodoDateStats, ProcedureTodoStaffStats, ProcedureTodoStatsDashboard } from "../types/procedureTodoStats";
import type { ProcedureTodoStatsProcedureGroupRule } from "../types/settings";
import { useCurrentUserPermissions } from "../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../components/common/NoPermissionOverlay";
import { resolveActiveBranchId } from "../utils/branch";

type QuickRangeKey = "day" | "week" | "month1" | "month3";
type PeriodUnit = "day" | "week" | "month";

type PeriodRow = {
  key: string;
  label: string;
  sortDate: Date;
  totalCount: number;
  assignedCount: number;
  doneCount: number;
  unassignedCount: number;
};

type StaffRow = {
  key: string;
  staffName: string;
  jobTitleName: string;
  assignedCount: number;
  doneCount: number;
  completionRate: number;
  averageWorkMinutes: number;
  workSamples: number;
};

type JobRow = {
  jobTitleName: string;
  totalAssigned: number;
  totalDone: number;
  staffCount: number;
  averageAssigned: number;
  medianAssigned: number;
  top3Share: number;
  dailyAvg: number;
  completionRate: number;
  maxName: string;
  maxCount: number;
  staffRows: StaffRow[];
};

type ProcedureRule = { name: string; keys: string[] };
type ProcedureCountRow = { name: string; count: number };

const nf = new Intl.NumberFormat("ko-KR");
const fmtCount = (v: number) => nf.format(Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
const fmtRate = (v: number) => `${(Number.isFinite(v) ? Math.max(0, v) : 0).toFixed(1)}%`;
const fmtDec = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(1);
const fmtMin = (v: number) => `${fmtDec(v)}분`;

function toDateSafe(v: string | Date | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const p = parseISO(v);
  if (!Number.isNaN(p.getTime())) return p;
  const f = new Date(v);
  return Number.isNaN(f.getTime()) ? null : f;
}

function normalizeTxt(v?: string): string {
  return (v || "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeProc(v?: string): string {
  let s = (v || "").trim() || "기타";
  s = s.replace(/\s*[\(\[]\s*잔여\s*\d+\s*회\s*[\)\]]\s*$/g, "");
  s = s.replace(/^\s*\d+\s*회차?\s*[-:]\s*/g, "");
  s = s.replace(/\s*[-:]\s*\d+\s*회차?\s*$/g, "");
  s = s.replace(/\s*\d+\s*회차?\s*$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s || "기타";
}

function buildRules(rules?: ProcedureTodoStatsProcedureGroupRule[]): ProcedureRule[] {
  return (rules || [])
    .map((r) => {
      const name = (r.name || "").trim();
      const keys = (r.keywords || []).map((k) => normalizeTxt(normalizeProc(k))).filter(Boolean);
      return { name, keys };
    })
    .filter((r) => r.name && r.keys.length > 0);
}

function toPeriod(d: Date, unit: PeriodUnit): { key: string; label: string; sortDate: Date } {
  if (unit === "day") {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return { key: format(day, "yyyy-MM-dd"), label: format(day, "MM.dd (EEE)", { locale: ko }), sortDate: day };
  }
  if (unit === "week") {
    const ws = startOfWeek(d, { weekStartsOn: 1 });
    const we = addDays(ws, 6);
    return { key: format(ws, "yyyy-'W'II"), label: `${format(ws, "MM.dd")} ~ ${format(we, "MM.dd")}`, sortDate: ws };
  }
  const ms = startOfMonth(d);
  return { key: format(ms, "yyyy-MM"), label: format(ms, "yyyy.MM"), sortDate: ms };
}

function aggregate(rows: ProcedureTodoDateStats[] | undefined, unit: PeriodUnit): PeriodRow[] {
  const m = new Map<string, PeriodRow>();
  for (const r of rows || []) {
    const d = toDateSafe(r.date);
    if (!d) continue;
    const p = toPeriod(d, unit);
    const cur = m.get(p.key) || {
      key: p.key,
      label: p.label,
      sortDate: p.sortDate,
      totalCount: 0,
      assignedCount: 0,
      doneCount: 0,
      unassignedCount: 0,
    };
    cur.totalCount += Number(r.totalCount || 0);
    cur.assignedCount += Number(r.assignedCount || 0);
    cur.doneCount += Number(r.doneCount || 0);
    cur.unassignedCount += Number(r.unassignedCount || 0);
    m.set(p.key, cur);
  }
  return Array.from(m.values()).sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid] ?? 0;
  const left = s[mid - 1] ?? 0;
  const right = s[mid] ?? 0;
  return (left + right) / 2;
}

function staffKey(row: ProcedureTodoStaffStats): string {
  const id = (row.staffId || "").trim();
  const name = (row.staffName || "미지정").trim() || "미지정";
  const job = (row.jobTitleId || row.jobTitleName || "미지정").trim();
  return `${id || name}|${job}`;
}

function quickRange(key: QuickRangeKey): { from: Date; to: Date } {
  const today = new Date();
  if (key === "day") return { from: today, to: today };
  if (key === "week") return { from: addDays(today, -6), to: today };
  if (key === "month1") return { from: addDays(today, -29), to: today };
  return { from: addDays(today, -89), to: today };
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#F8DCE2] bg-white px-4 py-3 text-center" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
      <div className="text-[11px] font-medium text-[#616161]">{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums text-[#5C2A35]">{value}</div>
    </div>
  );
}

export default function TodoStatsPage() {
  const { settings } = useSettingsStore();
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);
  if (permLoaded && !permissions["stats.statistics.view"]) return <NoPermissionOverlay />;
  const branchId = resolveActiveBranchId("");

  const [fromDate, setFromDate] = useState<Date>(() => addDays(new Date(), -89));
  const [toDate, setToDate] = useState<Date>(() => new Date());
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("month");
  const [selectedJob, setSelectedJob] = useState<string>("전체");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ProcedureTodoStatsDashboard | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const branchName = useMemo(
    () => settings.branches.find((b) => b.id === branchId)?.name || "지점",
    [branchId, settings.branches]
  );

  const applyQuick = useCallback((key: QuickRangeKey) => {
    const r = quickRange(key);
    setFromDate(r.from);
    setToDate(r.to);
    if (key === "day" || key === "week") setPeriodUnit("day");
    if (key === "month1") setPeriodUnit("week");
    if (key === "month3") setPeriodUnit("month");
  }, []);

  useEffect(() => {
    let mounted = true;
    async function run() {
      try {
        setLoading(true);
        setError(null);
        if (!branchId) throw new Error("지점 정보가 없습니다.");
        const from = fromDate <= toDate ? fromDate : toDate;
        const to = toDate >= fromDate ? toDate : fromDate;
        const res = await procedureTodoStatsService.getDashboard({
          branchId,
          fromDateISO: format(from, "yyyy-MM-dd"),
          toDateISO: format(to, "yyyy-MM-dd"),
        });
        if (!mounted) return;
        setDashboard(res);
        setGeneratedAt(new Date());
      } catch (e) {
        if (!mounted) return;
        setDashboard(null);
        setError(e instanceof Error ? e.message : "할일 통계를 불러오지 못했습니다.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }
    void run();
    return () => {
      mounted = false;
    };
  }, [branchId, fromDate, toDate]);

  const rules = useMemo(() => buildRules(settings.chartConfig?.statusRules?.procedureTodoStatsProcedureGroups), [
    settings.chartConfig?.statusRules?.procedureTodoStatsProcedureGroups,
  ]);

  const mapProc = useCallback(
    (raw?: string) => {
      const n = normalizeProc(raw);
      const k = normalizeTxt(n);
      for (const r of rules) {
        if (r.keys.some((rk) => k.includes(rk))) return r.name;
      }
      return n;
    },
    [rules]
  );

  const periodRows = useMemo(() => aggregate(dashboard?.byDate, periodUnit), [dashboard?.byDate, periodUnit]);

  const staffRows = useMemo<StaffRow[]>(
    () =>
      (dashboard?.byStaff || [])
        .map((r) => ({
          key: staffKey(r),
          staffName: (r.staffName || "").trim() || "미지정",
          jobTitleName: (r.jobTitleName || "").trim() || "미지정",
          assignedCount: Number(r.assignedCount || 0),
          doneCount: Number(r.doneCount || 0),
          completionRate: Number(r.completionRate || 0),
          averageWorkMinutes: Number(r.averageWorkMinutes || 0),
          workSamples: Number(r.workSamples || 0),
        }))
        .sort((a, b) => b.assignedCount - a.assignedCount || a.staffName.localeCompare(b.staffName, "ko")),
    [dashboard?.byStaff]
  );

  const days = Math.max(1, differenceInCalendarDays(toDate, fromDate) + 1);

  const jobs = useMemo<JobRow[]>(() => {
    const m = new Map<string, StaffRow[]>();
    for (const s of staffRows) {
      const key = s.jobTitleName || "미지정";
      const arr = m.get(key) || [];
      arr.push(s);
      m.set(key, arr);
    }
    return Array.from(m.entries())
      .map(([jobTitleName, rows]) => {
        const sorted = [...rows].sort((a, b) => b.assignedCount - a.assignedCount);
        const totalAssigned = sorted.reduce((sum, r) => sum + r.assignedCount, 0);
        const totalDone = sorted.reduce((sum, r) => sum + r.doneCount, 0);
        const staffCount = sorted.length;
        const top3 = sorted.slice(0, 3).reduce((sum, r) => sum + r.assignedCount, 0);
        const max = sorted[0];
        return {
          jobTitleName,
          totalAssigned,
          totalDone,
          staffCount,
          averageAssigned: staffCount ? totalAssigned / staffCount : 0,
          medianAssigned: median(sorted.map((r) => r.assignedCount)),
          top3Share: totalAssigned ? (top3 / totalAssigned) * 100 : 0,
          dailyAvg: totalAssigned / days,
          completionRate: totalAssigned ? (totalDone / totalAssigned) * 100 : 0,
          maxName: max?.staffName || "-",
          maxCount: max?.assignedCount || 0,
          staffRows: sorted,
        };
      })
      .sort((a, b) => b.totalAssigned - a.totalAssigned || a.jobTitleName.localeCompare(b.jobTitleName, "ko"));
  }, [days, staffRows]);

  const jobOptions = useMemo(() => Array.from(new Set(["전체", ...jobs.map((j) => j.jobTitleName)])), [jobs]);

  useEffect(() => {
    if (!jobOptions.includes(selectedJob)) setSelectedJob("전체");
  }, [jobOptions, selectedJob]);

  const chartJob = useMemo(() => {
    if (selectedJob !== "전체") return selectedJob;
    return jobs.find((j) => j.totalAssigned > 0)?.jobTitleName || "전체";
  }, [jobs, selectedJob]);

  const staffDist = useMemo(
    () =>
      (chartJob === "전체" ? staffRows : staffRows.filter((s) => s.jobTitleName === chartJob))
        .filter((s) => s.assignedCount > 0)
        .slice(0, 12)
        .map((s) => ({ name: s.staffName, count: s.assignedCount })),
    [chartJob, staffRows]
  );

  const procDist = useMemo<ProcedureCountRow[]>(() => {
    const m = new Map<string, number>();
    for (const r of dashboard?.byStaffProcedure || []) {
      if (chartJob !== "전체" && ((r.jobTitleName || "").trim() || "미지정") !== chartJob) continue;
      const name = mapProc(r.procedureName);
      m.set(name, (m.get(name) || 0) + Number(r.totalCount || 0));
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"))
      .slice(0, 10);
  }, [chartJob, dashboard?.byStaffProcedure, mapProc]);

  const topJobs = useMemo(() => jobs.filter((j) => j.totalAssigned > 0).slice(0, 4), [jobs]);

  const sum = dashboard?.summary;
  const total = Number(sum?.totalTodos || 0);
  const assigned = Number(sum?.assignedTodos || 0);
  const unassigned = Number(sum?.unassignedTodos || 0);
  const done = Number(sum?.doneCount || 0);
  const doing = Number(sum?.doingCount || 0);
  const todo = Number(sum?.todoCount || 0);

  const topJob = jobs[0];
  const topStaff = staffRows[0];
  const topProc = procDist[0];
  const peak = useMemo(() => [...periodRows].sort((a, b) => b.assignedCount - a.assignedCount)[0], [periodRows]);
  const categorizedCount = useMemo(() => {
    const keys = new Set<string>();
    for (const row of dashboard?.byStaffProcedure || []) {
      if (Number(row.totalCount || 0) <= 0) continue;
      keys.add(mapProc(row.procedureName));
    }
    return keys.size;
  }, [dashboard?.byStaffProcedure, mapProc]);

  const criteria = [
    "분석 단위는 환자 차트와 연결된 할일(행)입니다.",
    "담당자 지정 건수는 담당자 필드가 설정된 할일 기준으로 계산합니다.",
    "직군/담당자 표는 기간 내 누적 지정건수와 완료지표를 함께 표시합니다.",
    "시술 분류는 설정 > 차트의 '통계 시술 분류명' 규칙을 우선 적용합니다.",
  ];

  const insights = [
    `전체 ${fmtCount(total)}건 중 담당자 지정 ${fmtCount(assigned)}건(${fmtRate(total ? (assigned / total) * 100 : 0)}), 미지정 ${fmtCount(
      unassigned
    )}건(${fmtRate(total ? (unassigned / total) * 100 : 0)})입니다.`,
    topJob
      ? `최다 지정 직군은 ${topJob.jobTitleName}(${fmtCount(topJob.totalAssigned)}건, 완료율 ${fmtRate(topJob.completionRate)})입니다.`
      : "최다 지정 직군 데이터가 없습니다.",
    topStaff
      ? `최다 지정 담당자는 ${topStaff.staffName}(${topStaff.jobTitleName}) ${fmtCount(topStaff.assignedCount)}건입니다.`
      : "최다 지정 담당자 데이터가 없습니다.",
    topProc ? `주요 시술/할일 분류 1위는 '${topProc.name}' ${fmtCount(topProc.count)}건입니다.` : "시술 분류 데이터가 없습니다.",
    peak ? `가장 지정이 집중된 구간은 ${peak.label} (${fmtCount(peak.assignedCount)}건)입니다.` : "기간별 추이 데이터가 없습니다.",
  ];

  const rangeLabel = `${format(fromDate, "yyyy-MM-dd")} ~ ${format(toDate, "yyyy-MM-dd")}`;
  const generatedLabel = format(generatedAt || new Date(), "yyyy-MM-dd HH:mm");

  const kpis: Array<{ label: string; value: string }> = [
    { label: "전체 할일 건수", value: fmtCount(total) },
    { label: "담당자 지정", value: fmtCount(assigned) },
    { label: "담당자 미지정", value: fmtCount(unassigned) },
    { label: "완료 건수", value: fmtCount(done) },
    { label: "진행중 건수", value: fmtCount(doing) },
    { label: "대기 건수", value: fmtCount(todo) },
    { label: "시술 분류 수", value: fmtCount(categorizedCount) },
    { label: "완료율", value: fmtRate(total ? (done / total) * 100 : 0) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
      <TopBar title="할일 통계" />

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        <section className="rounded-2xl border border-[#F8DCE2] bg-white px-5 py-4" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="md" className="min-w-[96px]">
              {branchName}
            </Button>
            <span className="px-1 text-xs text-gray-400">집계기간</span>
            <div className="w-[180px]">
              <CustomDatePicker value={fromDate} onChange={setFromDate} />
            </div>
            <span className="text-gray-300">~</span>
            <div className="w-[180px]">
              <CustomDatePicker value={toDate} onChange={setToDate} />
            </div>
            <Button variant="outline" size="md" onClick={() => applyQuick("day")}>
              오늘
            </Button>
            <Button variant="outline" size="md" onClick={() => applyQuick("week")}>
              최근 7일
            </Button>
            <Button variant="outline" size="md" onClick={() => applyQuick("month1")}>
              최근 1개월
            </Button>
            <Button variant="outline" size="md" onClick={() => applyQuick("month3")}>
              최근 3개월
            </Button>
            <Button variant="outline" size="md" className="gap-1" onClick={() => applyQuick("month3")}>
              <RotateCcw className="h-4 w-4" />
              기본
            </Button>
            <div className="ml-auto inline-flex rounded-lg border border-[#F8DCE2] bg-white p-1">
              {(["day", "week", "month"] as PeriodUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`px-4 h-10 text-sm font-medium rounded-lg transition-all duration-200 inline-flex items-center ${periodUnit === u ? "bg-[#E26B7C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]" : "text-[#616161] hover:bg-[#FCEBEF] hover:text-[#5C2A35]"}`}
                  onClick={() => setPeriodUnit(u)}
                >
                  {u === "day" ? "일별" : u === "week" ? "주별" : "월별"}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {loading && !dashboard ? (
          <div className="rounded-2xl border border-[#F8DCE2] bg-white px-6 py-10 text-center text-gray-500">할일 통계를 불러오는 중입니다...</div>
        ) : null}

        {dashboard ? (
          <>
            <section className="rounded-2xl border border-[#F8DCE2] bg-white" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
              <div className="flex items-center justify-between gap-3 border-b border-[#F8DCE2] bg-[#FCF7F8] px-5 py-4 rounded-t-2xl">
                <div>
                  <div className="text-sm font-semibold text-[#5C2A35]">{branchName} 할일/시술 통계</div>
                  <div className="mt-1 text-xs text-[#616161]">집계기간: {rangeLabel} | 생성시각: {generatedLabel}</div>
                </div>
              </div>
              <div className="p-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((item) => (
                  <KpiCell key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[#F8DCE2] bg-white" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
              <div className="border-b border-[#F8DCE2] bg-[#FCF7F8] px-5 py-4 rounded-t-2xl">
                <div className="text-sm font-semibold text-[#5C2A35]">집계 기준</div>
              </div>
              <div className="p-5">
                <ul className="space-y-1.5 text-sm leading-relaxed text-[#242424]">{criteria.map((v) => <li key={v}>- {v}</li>)}</ul>
                <div className="mt-5 border-t border-[#F8DCE2] pt-4">
                  <div className="text-sm font-semibold text-[#5C2A35]">핵심 요약</div>
                  <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-[#242424]">{insights.map((v) => <li key={v}>- {v}</li>)}</ul>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#F8DCE2] bg-white" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
              <div className="border-b border-[#F8DCE2] bg-[#FCF7F8] px-5 py-4 rounded-t-2xl">
                <div className="text-sm font-semibold text-[#5C2A35]">직군별 현황</div>
                <div className="mt-1 text-xs text-[#616161]">직군별 지정건수와 인당 평균/중앙값, 집중도를 비교합니다.</div>
              </div>
              <div className="p-5">
              <div className="overflow-auto">
                <table className="w-full min-w-[1240px] table-fixed">
                  <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                    <tr className="border-b border-gray-100">
                      {["직군", "인원수", "총 지정건수", "1인 평균 지정", "1인 중앙값 지정", "상위 3명 비중", "일평균 지정", "최다 지정자", "최대 지정건수"].map((h) => (
                        <th key={h} className="py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((r) => (
                      <tr key={r.jobTitleName} className="group hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                        <td className="py-3 px-2 text-sm font-medium text-gray-900 text-center">{r.jobTitleName}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtCount(r.staffCount)}</td>
                        <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-center">{fmtCount(r.totalAssigned)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtDec(r.averageAssigned)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtDec(r.medianAssigned)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtRate(r.top3Share)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtDec(r.dailyAvg)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{r.maxName}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtCount(r.maxCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-xl border border-[#F8DCE2] bg-[#FCF7F8] p-4">
                <div className="mb-2 text-center text-sm font-semibold text-[#5C2A35]">기간별 담당자 지정/완료 추이</div>
                <div className="h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={periodRows} margin={{ top: 18, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number | string | undefined) => `${fmtCount(Number(value || 0))}건`} />
                      <Line type="monotone" dataKey="assignedCount" stroke="#E26B7C" strokeWidth={3} dot={{ r: 3 }} name="배정" />
                      <Line type="monotone" dataKey="doneCount" stroke="#F49EAF" strokeWidth={3} dot={{ r: 3 }} name="완료" />
                      <Line type="monotone" dataKey="totalCount" stroke="#99354E" strokeWidth={3} dot={{ r: 3 }} name="전체" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              </div>
            </section>

            {topJobs.map((job, idx) => {
              const top10 = job.staffRows.slice(0, 10);
              const top5Share = job.totalAssigned ? (top10.slice(0, 5).reduce((s, r) => s + r.assignedCount, 0) / job.totalAssigned) * 100 : 0;
              return (
                <section key={job.jobTitleName} className="rounded-2xl border border-[#F8DCE2] bg-white" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
                  <div className="border-b border-[#F8DCE2] bg-[#FCF7F8] px-5 py-4 rounded-t-2xl">
                    <div className="text-sm font-semibold text-[#5C2A35]">{job.jobTitleName} 담당자별 할일 현황</div>
                  </div>
                  <div className="p-5">
                  <div className="overflow-auto">
                    <table className="w-full min-w-[1240px] table-fixed">
                      <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                        <tr className="border-b border-gray-100">{["순위", "이름", "지정건수", "직군 내 비중", "완료건수", "완료율", "평균 소요시간", "소요시간 샘플수"].map((h) => <th key={h} className="py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {top10.map((r, i) => (
                          <tr key={r.key} className="group hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                            <td className="py-3 px-2 text-sm text-gray-600 text-center">{i + 1}</td>
                            <td className="py-3 px-2 text-sm font-medium text-gray-900 text-center">{r.staffName}</td>
                            <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtCount(r.assignedCount)}</td>
                            <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtRate(job.totalAssigned ? (r.assignedCount / job.totalAssigned) * 100 : 0)}</td>
                            <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtCount(r.doneCount)}</td>
                            <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtRate(r.completionRate)}</td>
                            <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtMin(r.averageWorkMinutes)}</td>
                            <td className="py-3 px-2 text-sm text-gray-600 text-center">{fmtCount(r.workSamples)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-[#242424]">
                    <li>- {job.jobTitleName} 최다 지정자는 {job.maxName}이며 총 {fmtCount(job.maxCount)}건입니다.</li>
                    <li>- {job.jobTitleName} 상위 5명이 전체의 {fmtRate(top5Share)}를 담당합니다.</li>
                  </ul>
                  </div>
                </section>
              );
            })}

            <section className="rounded-2xl border border-[#F8DCE2] bg-white" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F8DCE2] bg-[#FCF7F8] px-5 py-4 rounded-t-2xl">
                <div className="text-sm font-semibold text-[#5C2A35]">{chartJob} 담당자 분포와 주요 시술</div>
                <div className="flex flex-wrap gap-2">
                  {jobOptions.map((j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => setSelectedJob(j)}
                      className={`h-10 rounded-lg border px-4 text-sm font-medium transition-all duration-200 inline-flex items-center ${selectedJob === j ? "border-[#E26B7C] bg-[#E26B7C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]" : "border-[#F8DCE2] bg-white text-[#616161] hover:bg-[#FCEBEF] hover:text-[#5C2A35]"}`}
                    >
                      {j}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-5 grid gap-5 xl:grid-cols-2">
                <div className="rounded-xl border border-[#F8DCE2] bg-[#FCF7F8] p-4">
                  <div className="mb-2 text-center text-sm font-semibold text-[#5C2A35]">{chartJob} 담당자 지정 건수</div>
                  <div className="h-[460px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={staffDist} layout="vertical" margin={{ top: 6, right: 18, left: 10, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 12 }} interval={0} />
                        <Tooltip formatter={(value: number | string | undefined) => `${fmtCount(Number(value || 0))}건`} />
                        <Bar dataKey="count" fill="#E26B7C" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-xl border border-[#F8DCE2] bg-[#FCF7F8] p-4">
                  <div className="mb-2 text-center text-sm font-semibold text-[#5C2A35]">{chartJob} TOP 10 시술 분류</div>
                  <div className="h-[460px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={procDist} layout="vertical" margin={{ top: 6, right: 18, left: 10, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 12 }} interval={0} />
                        <Tooltip formatter={(value: number | string | undefined) => `${fmtCount(Number(value || 0))}건`} />
                        <Bar dataKey="count" fill="#F49EAF" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

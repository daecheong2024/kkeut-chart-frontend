import React, { useMemo, useState, useEffect } from "react";
import { Download, Search, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { TopBar } from "../components/layout/TopBar";
import { patientService } from "../services/patientService";
import { NewPatientModal } from "../components/common/NewPatientModal";
import { ReceptionForm } from "../components/chart/ReceptionForm";
import { visitService } from "../services/visitService";
import { ticketService } from "../services/ticketService";
import { fetchQuickTicketOptions, canOverrideCycleBlock, type QuickTicketOption } from "../utils/quickTicketOption";
import { Ticket as TicketIcon } from "lucide-react";
import { useScheduleStore } from "../stores/useScheduleStore";
import { useChartStore } from "../stores/useChartStore";
import { resolveActiveBranchId } from "../utils/branch";
import { Gift, X, Check } from "lucide-react";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useCurrentUserPermissions } from "../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../components/common/NoPermissionOverlay";

export default function PatientListPage() {
  const navigate = useNavigate();
  const [selectedSex, setSelectedSex] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAge, setSelectedAge] = useState("전체");
  const [selectedTag, setSelectedTag] = useState("전체");
  const [selectedMarketing, setSelectedMarketing] = useState("전체");
  const [patients, setPatients] = useState<import("../services/patientService").PatientSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  const [showReceptionForm, setShowReceptionForm] = useState(false);
  const [selectedPatientForReception, setSelectedPatientForReception] = useState<import("../services/patientService").PatientSearchResult | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPatientForEdit, setSelectedPatientForEdit] = useState<any>(null);
  const [tagMaster, setTagMaster] = useState<{ id: number; name: string }[]>([]);
  const [quickTicketPickerData, setQuickTicketPickerData] = useState<{ tickets: any[]; receptionData: any; _selectedIds?: string[] } | null>(null);
  const [quickTicketBusy, setQuickTicketBusy] = useState(false);

  const { settings } = useSettingsStore();
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);
  if (permLoaded && !permissions["patients.view"]) return <NoPermissionOverlay />;

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const branchId = resolveActiveBranchId("");
        if (!branchId) return;
        const response = await import("../services/apiClient").then(m => m.default.get(`/settings/tags?branchId=${branchId}`));
        const data = response.data ?? [];
        setTagMaster(data.map((t: any) => ({ id: t.id, name: t.name })));
      } catch (error) {
        console.error("Failed to load patient tags:", error);
      }
    };
    fetchTags();
  }, [settings.activeBranchId]);

  const handleChartClick = (p: import("../services/patientService").PatientSearchResult) => {
    navigate(`/app/chart-view/${p.id}`);
  };

  const handleReceptionClick = (p: import("../services/patientService").PatientSearchResult) => {
    setSelectedPatientForReception(p);
    setShowReceptionForm(true);
  };

  const handleReservationClick = (p: import("../services/patientService").PatientSearchResult) => {
    navigate('/app/reservation', { state: { reservePatient: { id: p.id, name: p.name, phone: p.phone, gender: p.gender === 'MALE' ? '남' : p.gender === 'FEMALE' ? '여' : '기타', age: p.age, birthDate: p.birthDate }, _ts: Date.now() } });
  };

  const handleEditClick = async (p: import("../services/patientService").PatientSearchResult) => {
    try {
      const detail = await patientService.getById(p.id);
      if (detail) {
        setSelectedPatientForEdit(detail);
        setIsEditModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to fetch patient details", error);
      alert("환자 정보를 불러오는데 실패했습니다.");
    }
  };

  const handleReceptionConfirm = async (data: any) => {
    if (!selectedPatientForReception) return;
    try {
      const branchId = resolveActiveBranchId("");
      if (!branchId) { alert("지점 정보가 없습니다."); return; }
      await visitService.createVisit({
        patientId: selectedPatientForReception.id,
        branchId,
        registerTime: new Date().toISOString(),
        status: 'wait',
        room: data.room || 'main_wait',
        memo: data.memo,
        doctorName: data.doctor || undefined,
        visitPurposeIds: data.visitPurposeId ? [data.visitPurposeId] : undefined
      });
      useScheduleStore.getState().refresh();
      useChartStore.getState().fetchPatients(useScheduleStore.getState().dateISO, branchId);
      alert("접수가 완료되었습니다: " + selectedPatientForReception.name);
      setShowReceptionForm(false);
      setSelectedPatientForReception(null);
    } catch (error: any) {
      console.error("Reception failed", error);
      alert(error?.response?.data?.message || error?.message || "접수에 실패했습니다.");
    }
  };

  const loadPatients = async () => {
    setIsLoading(true);
    try {
      let minAge: number | undefined;
      let maxAge: number | undefined;

      if (selectedAge !== "전체") {
        if (selectedAge === "10대") { minAge = 10; maxAge = 19; }
        else if (selectedAge === "20대") { minAge = 20; maxAge = 29; }
        else if (selectedAge === "30대") { minAge = 30; maxAge = 39; }
        else if (selectedAge === "40대") { minAge = 40; maxAge = 49; }
        else if (selectedAge === "50대") { minAge = 50; maxAge = 59; }
        else if (selectedAge === "60대 이상") { minAge = 60; }
      }

      const marketingAgreed = selectedMarketing === "전체" ? undefined : selectedMarketing === "동의";

      const results = await patientService.searchPatients(searchQuery || "", {
        gender: selectedSex,
        minAge,
        maxAge,
        tag: selectedTag,
        marketingAgreed
      }, currentPage, pageSize);
      setPatients(results.items);
      setTotalCount(results.totalCount);
    } catch (error) {
      console.error("Failed to load patients:", error);
      setPatients([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedSex, selectedAge, selectedTag, selectedMarketing]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatients();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedSex, selectedAge, selectedTag, selectedMarketing, currentPage]);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Use patients directly as they are now server-filtered
  const filteredPatients = patients;

  const handleDownload = () => {
    const selectedSet = new Set(selectedIds);
    const rows = selectedSet.size > 0
      ? filteredPatients.filter((p) => selectedSet.has(String(p.id)))
      : filteredPatients;

    if (rows.length === 0) {
      alert("다운로드할 환자 데이터가 없습니다.");
      return;
    }

    const headers = [
      "환자번호",
      "환자명",
      "생년월일",
      "나이",
      "성별",
      "전화번호",
      "최근방문일",
      "환자태그",
      "마케팅 수신 동의",
    ];

    const escapeCsv = (value: unknown) => {
      const text = String(value ?? "");
      if (text.includes('"') || text.includes(",") || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const lines = [
      headers.join(","),
      ...rows.map((p) =>
        [
          p.id,
          p.name,
          p.birthDate || "",
          `${p.age || 0}세`,
          p.gender === "MALE" ? "남" : p.gender === "FEMALE" ? "여" : "-",
          p.phone || "",
          p.lastVisit || "",
          (p.tags || []).join("; "),
          p.marketing || "",
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ];

    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `환자목록_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  const isAllSelected = filteredPatients.length > 0 && selectedIds.length === filteredPatients.length;

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(filteredPatients.map((p) => String(p.id)));
    else setSelectedIds([]);
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="flex h-full flex-col bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
      <TopBar title="환자 목록" />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-[240px] flex-col border-r border-[#F8DCE2] bg-[#FCF7F8] pt-6">
          <div className="px-5 mb-6 flex items-center justify-between">
            {/* Removed duplicate title */}
            <button className="text-xs font-medium text-[#E26B7C] hover:text-[#99354E]">조건그룹 등록</button>
          </div>

          <div className="px-5 mb-2">
            <span className="text-xs font-medium text-gray-400">기본 그룹</span>
          </div>

          <div className="px-3">
            <div className="flex items-center justify-between rounded-lg bg-[#FCEBEF] px-4 py-3 text-sm font-medium text-[#E26B7C] cursor-pointer">
              <span>전체 환자</span>
              <span className="text-[#E26B7C]">{filteredPatients.length}</span>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-white">
          {/* Mobile group header */}
          <div className="md:hidden border-b border-[#F8DCE2] bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-gray-900">전체 환자</div>
                <div className="truncate text-xs text-gray-500">총 {filteredPatients.length}명</div>
              </div>
              <button className="text-xs font-bold text-[#E26B7C]">조건그룹</button>
            </div>
          </div>

          {/* Filters + actions */}
          <div className="flex flex-col gap-3 border-b border-[#F8DCE2] px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pr-4">
              {/* Sex Toggle */}
              <div className="flex items-center rounded-full bg-gray-100 p-1 shrink-0">
                {["전체", "남", "여"].map((label) => (
                  <button
                    key={label}
                    onClick={() => setSelectedSex(label)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                      selectedSex === label ? "bg-[#E26B7C] text-white shadow-[0_4px_12px_rgba(226,107,124,0.18)]" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-gray-300 mx-1 shrink-0" />

              {/* Age */}
              <div className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
                <span className="whitespace-nowrap">연령</span>
                <div className="relative">
                  <select
                    value={selectedAge}
                    onChange={(e) => setSelectedAge(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:border-[#F49EAF] bg-white hover:bg-[#FCEBEF] cursor-pointer min-w-[90px]"
                  >
                    <option value="전체">전체</option>
                    <option value="10대">10대</option>
                    <option value="20대">20대</option>
                    <option value="30대">30대</option>
                    <option value="40대">40대</option>
                    <option value="50대">50대</option>
                    <option value="60대 이상">60대 이상</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Tag */}
              <div className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
                <span className="whitespace-nowrap">태그</span>
                <div className="relative">
                  <select
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:border-[#F49EAF] bg-white hover:bg-[#FCEBEF] cursor-pointer min-w-[90px]"
                  >
                    <option value="전체">전체</option>
                    {tagMaster.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Marketing */}
              <div className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
                <span className="whitespace-nowrap">마케팅</span>
                <div className="relative">
                  <select
                    value={selectedMarketing}
                    onChange={(e) => setSelectedMarketing(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:border-[#F49EAF] bg-white hover:bg-[#FCEBEF] cursor-pointer min-w-[90px]"
                  >
                    <option value="전체">전체</option>
                    <option value="동의">동의</option>
                    <option value="미동의">미동의</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-2 text-gray-600 font-normal" onClick={handleDownload}>
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">다운로드</span>
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 py-3 md:px-6 md:py-4">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="환자번호, 환자명, 연락처로 검색"
                className="w-full pl-10 pr-4 py-2 text-sm border-b border-gray-300 focus:outline-none focus:border-[#F49EAF] transition-colors placeholder:text-gray-400 bg-transparent"
              />
            </div>
          </div>

          {/* Data */}
          <div className="flex-1 overflow-auto">
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full min-w-[1000px] table-fixed">
                <thead className="bg-[#FCF7F8] sticky top-0 z-10">
                  <tr className="border-b border-[#F8DCE2]">
                    <th className="w-12 py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 cursor-pointer"
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">환자번호</th>
                    <th className="w-48 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">환자명</th>
                    <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">생년월일</th>
                    <th className="w-16 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">나이</th>
                    <th className="w-16 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">성별</th>
                    <th className="w-32 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">전화번호</th>
                    <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">최근방문일</th>
                    <th className="w-48 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">환자태그</th>
                    <th className="w-24 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">마케팅 수신 동의</th>
                    <th className="w-48 py-3 px-2 text-center text-xs font-semibold text-[#5C2A35]">기능</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-gray-400 text-sm">
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredPatients.map((p) => (
                      <tr
                        key={p.id}
                        className="group hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                      >
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 cursor-pointer"
                            checked={selectedIds.includes(String(p.id))}
                            onChange={() => handleSelectOne(String(p.id))}
                          />
                        </td>
                        <td className="py-3 px-2 text-center text-xs text-gray-500">{p.id}</td>
                        <td className="py-3 px-2 text-center text-xs font-medium text-gray-900">{p.name}</td>
                        <td className="py-3 px-2 text-center text-xs text-gray-600">{p.birthDate || "-"}</td>
                        <td className="py-3 px-2 text-center text-xs text-gray-600">{p.age || 0}세</td>
                        <td className="py-3 px-2 text-center text-xs text-gray-600">{p.gender === 'MALE' ? '남' : p.gender === 'FEMALE' ? '여' : '-'}</td>
                        <td className="py-3 px-2 text-center text-xs text-gray-600">{p.phone}</td>
                        <td className="py-3 px-2 text-center text-xs text-gray-600">{p.lastVisit || "-"}</td>
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {(p.tags || []).map((t: string) => (
                              <span key={t} className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center text-xs text-gray-600">{p.marketing}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              className="h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
                              onClick={() => handleChartClick(p)}
                            >
                              차트
                            </button>
                            <button
                              className="h-7 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                              onClick={() => handleReceptionClick(p)}
                            >
                              접수
                            </button>
                            <button
                              className="h-7 px-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
                              onClick={() => handleReservationClick(p)}
                            >
                              예약
                            </button>
                            <button
                              className="h-7 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
                              onClick={() => handleEditClick(p)}
                            >
                              수정
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden px-4 pb-6 space-y-2">
              {filteredPatients.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">검색 결과가 없습니다.</div>
              ) : (
                filteredPatients.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 cursor-pointer"
                        checked={selectedIds.includes(String(p.id))}
                        onChange={() => handleSelectOne(String(p.id))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-gray-900">{p.name}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {p.id} · {p.gender} · {p.age}세 · {p.birthDate}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold",
                              p.marketing === "동의" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                            )}
                          >
                            {p.marketing}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <div className="text-[10px] font-bold text-gray-400">전화</div>
                            <div className="mt-0.5 font-medium text-gray-700">{p.phone || "-"}</div>
                          </div>
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <div className="text-[10px] font-bold text-gray-400">최근방문</div>
                            <div className="mt-0.5 font-medium text-gray-700">{p.lastVisit || "-"}</div>
                          </div>
                        </div>

                        {(p.tags || []).length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {(p.tags || []).map((t: string) => (
                              <span key={t} className="inline-block rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-3 flex items-center gap-1.5">
                          <button className="h-7 flex-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleChartClick(p)}>차트</button>
                          <button className="h-7 flex-1 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100" onClick={() => handleReceptionClick(p)}>접수</button>
                          <button className="h-7 flex-1 rounded-lg border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 hover:bg-amber-100" onClick={() => handleReservationClick(p)}>예약</button>
                          <button className="h-7 flex-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => handleEditClick(p)}>수정</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {totalCount > pageSize && (
            <div className="flex items-center justify-center gap-2 py-4 border-t border-[#F8DCE2] bg-[#FCF7F8]">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-8 px-3 rounded-lg border border-[#F8DCE2] bg-white text-xs font-medium text-[#242424] hover:bg-[#FCEBEF] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              >
                이전
              </button>
              <span className="text-xs text-[#616161]">
                {currentPage} / {Math.ceil(totalCount / pageSize)} 페이지
                <span className="ml-2 text-[#9E9E9E]">(총 {totalCount.toLocaleString()}명)</span>
              </span>
              <button
                disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="h-8 px-3 rounded-lg border border-[#F8DCE2] bg-white text-xs font-medium text-[#242424] hover:bg-[#FCEBEF] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              >
                다음
              </button>
            </div>
          )}
        </main>
      </div>

      {showReceptionForm && selectedPatientForReception && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1500px] max-h-[85vh] flex flex-col overflow-hidden border border-[#F8DCE2] animate-in fade-in zoom-in-95 duration-200">
            <ReceptionForm
              patient={{
                id: selectedPatientForReception.id,
                name: selectedPatientForReception.name,
                phone: selectedPatientForReception.phone || '',
                gender: selectedPatientForReception.gender === 'MALE' ? 'MALE' : selectedPatientForReception.gender === 'FEMALE' ? 'FEMALE' : 'OTHER',
                age: selectedPatientForReception.age || 0,
                tags: selectedPatientForReception.tags || [],
                chartNo: String(selectedPatientForReception.id),
                status: 'wait',
                location: 'reception',
                time: new Date().toLocaleTimeString(),
                visitDate: new Date().toISOString().split('T')[0],
              } as any}
              onClose={() => { setShowReceptionForm(false); setSelectedPatientForReception(null); }}
              onConfirm={handleReceptionConfirm}
              onQuickAction={async (data) => {
                if (!selectedPatientForReception) return;
                const customerId = Number(selectedPatientForReception.id || 0);
                if (!Number.isFinite(customerId) || customerId <= 0) {
                  alert("빠른 차감 대상이 아닙니다.");
                  return;
                }
                try {
                  const ownedTickets = await ticketService.getTickets(customerId);
                  const branchId = resolveActiveBranchId("");
                  const dateISO = new Date().toISOString().slice(0, 10);
                  const { settings: s } = useSettingsStore.getState();
                  const ticketDefs = s.tickets?.items || [];
                  const options = await fetchQuickTicketOptions(ownedTickets || [], ticketDefs, branchId, dateISO);
                  if (options.length === 0) {
                    alert("빠른 차감 대상이 아닙니다. (잔여 시술권 없음)");
                    return;
                  }
                  setQuickTicketPickerData({ tickets: options, receptionData: data });
                } catch (e) {
                  console.error("ticket check failed", e);
                  alert("시술권 조회에 실패했습니다.");
                }
              }}
            />
          </div>
        </div>,
        document.body
      )}

      {quickTicketPickerData && createPortal(
        <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/35 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-[620px] max-h-[80vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-base font-bold text-slate-900">차감할 시술권 선택</div>
                <div className="mt-0.5 text-xs text-slate-500">차감할 시술권을 선택해 주세요.</div>
              </div>
              <button type="button" onClick={() => setQuickTicketPickerData(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="닫기">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[52vh] overflow-y-auto px-5 py-4 space-y-2.5">
              {quickTicketPickerData.tickets.map((option: QuickTicketOption) => {
                const allowOverride = canOverrideCycleBlock(option);
                const disabled = option.remaining <= 0 || (option.cycleBlocked && !allowOverride);
                const selected = (quickTicketPickerData._selectedIds || []).includes(option.ticketId);
                return (
                  <button
                    key={`qt-${option.ticketId}`}
                    type="button"
                    disabled={quickTicketBusy || disabled}
                    onClick={() => {
                      if (disabled) return;
                      setQuickTicketPickerData((prev: any) => {
                        if (!prev) return prev;
                        const ids: string[] = prev._selectedIds || [];
                        const next = ids.includes(option.ticketId) ? ids.filter((id: string) => id !== option.ticketId) : [...ids, option.ticketId];
                        return { ...prev, _selectedIds: next };
                      });
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${disabled ? "cursor-not-allowed border-red-200 bg-red-50/50 text-slate-400 opacity-70" : selected ? "border-[#E26B7C] bg-[#FCEBEF] ring-1 ring-[#E26B7C]/30" : allowOverride ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${disabled ? "border-gray-300 bg-gray-200" : selected ? "border-[#E26B7C] bg-[#E26B7C] text-white" : "border-gray-300 bg-white"}`}>
                        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <TicketIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate text-sm font-semibold">{option.ticketName}</span>
                          {option.isPeriod && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">주기권</span>}
                          {option.isPackage && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">패키지</span>}
                        </div>
                        <div className={`mt-1 text-[11px] leading-relaxed ${disabled ? "text-red-500 font-medium" : "text-slate-500"}`}>
                          {disabled ? `⛔ ${option.cycleBlockReason || "지금은 사용할 수 없습니다."}` : "선택하여 차감"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-slate-800">잔여 {option.remaining}회</div>
                        {option.nextAvailableAt && <div className="mt-1 text-[10px] text-amber-600">다음 가능: {option.nextAvailableAt}</div>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50">
              <button type="button" onClick={() => setQuickTicketPickerData(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">취소</button>
              <button
                type="button"
                disabled={quickTicketBusy || !(quickTicketPickerData._selectedIds?.length)}
                onClick={async () => {
                  if (!selectedPatientForReception) return;
                  const selectedOptions = quickTicketPickerData.tickets.filter((o: QuickTicketOption) => (quickTicketPickerData._selectedIds || []).includes(o.ticketId));
                  if (selectedOptions.length === 0) return;
                  setQuickTicketBusy(true);
                  try {
                    const branchId = resolveActiveBranchId("");
                    if (!branchId) { setQuickTicketPickerData(null); return; }
                    const receptionData = quickTicketPickerData.receptionData;
                    await visitService.createVisit({
                      patientId: selectedPatientForReception.id, branchId,
                      registerTime: new Date().toISOString(), status: 'wait',
                      room: receptionData.room || 'main_wait', memo: receptionData.memo,
                      doctorName: receptionData.doctor || undefined,
                      visitPurposeIds: receptionData.visitPurposeId ? [receptionData.visitPurposeId] : undefined
                    });
                    for (const option of selectedOptions) {
                      await ticketService.useTicket(option.ticketId, option.isPeriod);
                    }
                    useScheduleStore.getState().refresh();
                    useChartStore.getState().fetchPatients(useScheduleStore.getState().dateISO, branchId);
                    setQuickTicketPickerData(null);
                    setShowReceptionForm(false);
                    setSelectedPatientForReception(null);
                  } catch (e: any) {
                    console.error("quick ticket deduct failed", e);
                  } finally {
                    setQuickTicketBusy(false);
                  }
                }}
                className="rounded-lg bg-[#E26B7C] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#99354E] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                차감하기 ({quickTicketPickerData._selectedIds?.length || 0}건)
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <NewPatientModal
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setTimeout(() => setSelectedPatientForEdit(null), 300); }}
        mode="edit"
        initialData={selectedPatientForEdit ? {
          name: selectedPatientForEdit.name,
          phone: selectedPatientForEdit.phone,
          dob: selectedPatientForEdit.birthDate || selectedPatientForEdit.dob,
          sex: selectedPatientForEdit.sex,
          tags: selectedPatientForEdit.tags || [],
          zipcode: selectedPatientForEdit.zipcode,
          address: selectedPatientForEdit.address,
          detailAddress: selectedPatientForEdit.detailAddress,
          email: selectedPatientForEdit.email,
          emergencyPhone: selectedPatientForEdit.emergencyPhone,
          isTaxDataAgree: selectedPatientForEdit.isTaxDataAgree,
        } : undefined}
        onConfirm={async (data) => {
          try {
            if (!selectedPatientForEdit) return;
            let birthDate = null;
            let sex = undefined;
            const { name, phone, id1, id2, noId, tags, emergencyPhone, zipcode, address, detailAddress, email } = data;
            if (!noId && id1 && id2) {
              const yearPrefix = ['1', '2', '5', '6'].includes(id2[0]) ? '19' : '20';
              birthDate = `${yearPrefix}${id1.substring(0, 2)}-${id1.substring(2, 4)}-${id1.substring(4, 6)}`;
              if (['1', '3', '5', '7'].includes(id2[0])) sex = "M";
              else if (['2', '4', '6', '8'].includes(id2[0])) sex = "F";
            }
            await patientService.update(selectedPatientForEdit.id, {
              name, phone, sex, birthDate: birthDate || undefined,
              zipcode, address, detailAddress, email, emergencyPhone,
              isTaxDataAgree: data.isTaxDataAgree,
            } as any);

            if (tags && tags.length >= 0) {
              const existingTags = await patientService.getTags(selectedPatientForEdit.id);
              const selectedTagNames: string[] = tags;
              const toAdd = selectedTagNames.filter((n: string) => !existingTags.some(e => e.tagName === n));
              const toRemove = existingTags.filter(e => !selectedTagNames.includes(e.tagName));

              for (const tagName of toAdd) {
                const master = tagMaster.find(t => t.name === tagName);
                if (master) await patientService.addTag(selectedPatientForEdit.id, master.id);
              }
              for (const tag of toRemove) {
                await patientService.removeTag(selectedPatientForEdit.id, tag.tagId);
              }
            }

            alert("환자 정보가 수정되었습니다.");
            setIsEditModalOpen(false);
            setTimeout(() => setSelectedPatientForEdit(null), 300);
            loadPatients();
          } catch (error: any) {
            console.error("Update failed", error);
            const msg = error.response?.data?.title || error.response?.data || error.message || "알 수 없는 오류";
            alert(`수정에 실패했습니다: ${JSON.stringify(msg)}`);
          }
        }}
      />
    </div>
  );
}

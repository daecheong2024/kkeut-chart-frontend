import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Loader2, RefreshCcw, Users } from "lucide-react";
import { useScheduleStore } from "../../stores/useScheduleStore";
import { resolveActiveBranchId } from "../../utils/branch";
import { useChartSignalR } from "../../hooks/useChartSignalR";
import { VIEW_EVENT_MAP } from "../../config/signalrEvents";
import apiClient from "../../services/apiClient";

function getWaitLevel(estimatedWaitMinutes: number): "low" | "medium" | "high" {
    if (estimatedWaitMinutes >= 40) return "high";
    if (estimatedWaitMinutes >= 20) return "medium";
    return "low";
}

export function ProcedureStatusView() {
    const { dateISO } = useScheduleStore();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
    const [backendSummary, setBackendSummary] = useState<any>(null);

    const loadStatusData = useCallback(async () => {
        const branchId = resolveActiveBranchId();
        if (!branchId) return;

        setLoading(true);
        setError(null);

        try {
            const res = await apiClient.get(`/customers/procedure-status-summary?date=${dateISO}`);
            setBackendSummary(res.data);
        } catch (e) {
            console.error("Failed to load procedure status:", e);
            setError("시술 현황 데이터를 불러오지 못했습니다.");
        }

        setLastLoadedAt(new Date());
        setLoading(false);
    }, [dateISO]);

    useChartSignalR({
        onEventData: (data: any) => {
            if (data.eventType === 'statistics' && data.summary) {
                setBackendSummary(data.summary);
            }
            if (data.eventType === 'status_changed' || data.eventType === 'location_changed' || data.eventType === 'procedure_status') {
                void loadStatusData();
            }
        },
        enabled: true,
        events: VIEW_EVENT_MAP.procedure,
    });

    useEffect(() => {
        void loadStatusData();
        const timer = setInterval(() => {
            void loadStatusData();
        }, 30000);
        return () => clearInterval(timer);
    }, [loadStatusData]);

    const locationRows = useMemo(() => {
        if (!backendSummary?.locationStats) return [];
        return (backendSummary.locationStats as any[]).map((loc: any) => ({
            id: String(loc.locationId || ""),
            label: String(loc.locationLabel || loc.locationId || ""),
            totalPatients: Number(loc.totalPatients || 0),
            doingPatients: Number(loc.doingPatients || 0),
            waitingPatients: Number(loc.waitingPatients || 0),
            topProcedures: (loc.topProcedures || []).map((p: any) => ({
                name: String(p.name || ""),
                doingPatients: Number(p.doingPatients || 0),
                waitingPatients: Number(p.waitingPatients || 0),
            })),
        }));
    }, [backendSummary?.locationStats]);

    const queueRows = useMemo(() => {
        if (!backendSummary?.queueStats) return [];
        return (backendSummary.queueStats as any[])
            .map((q: any) => ({
                key: String(q.procedureName || "기타"),
                name: String(q.procedureName || "기타"),
                todoCount: Math.max(0, Number(q.todoCount || 0)),
                doingCount: Math.max(0, Number(q.doingCount || 0)),
                doneCount: Math.max(0, Number(q.doneCount || 0)),
                estimatedWaitMinutes: Math.max(0, Number(q.estimatedWaitMinutes || 0)),
                averageWorkMinutes: Math.max(0, Number(q.averageWorkMinutes || 0)),
            }))
            .filter((row: any) => row.todoCount > 0 || row.doingCount > 0 || row.estimatedWaitMinutes > 0)
            .sort((a: any, b: any) => {
                if (b.estimatedWaitMinutes !== a.estimatedWaitMinutes) return b.estimatedWaitMinutes - a.estimatedWaitMinutes;
                if (b.doingCount !== a.doingCount) return b.doingCount - a.doingCount;
                if (b.todoCount !== a.todoCount) return b.todoCount - a.todoCount;
                return a.name.localeCompare(b.name, "ko");
            });
    }, [backendSummary?.queueStats]);

    const queueMaxWait = useMemo(
        () => Math.max(1, ...queueRows.map((row: any) => row.estimatedWaitMinutes)),
        [queueRows]
    );

    const summary = useMemo(() => {
        return {
            totalPatients: backendSummary?.totalPatients ?? 0,
            totalDoingPatients: backendSummary?.doingPatients ?? 0,
            highCongestionCount: backendSummary?.congestionCount ?? 0,
            averageWait: backendSummary?.averageWaitMinutes ?? 0,
        };
    }, [backendSummary]);

    return (
        <div className="h-full overflow-y-auto p-2 md:p-3" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
            <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                {[
                    { label: "현재 환자", value: summary.totalPatients, unit: "명", bg: "#FCEBEF", color: "#D27A8C", border: "#F8DCE2" },
                    { label: "시술 진행", value: summary.totalDoingPatients, unit: "명", bg: "#E0F7FA", color: "#00838F", border: "#80DEEA" },
                    { label: "평균 대기", value: summary.averageWait, unit: "분", bg: "#FFF8E1", color: "#F57F17", border: "#FFE082" },
                    { label: "혼잡 시술", value: summary.highCongestionCount, unit: "개", bg: "#FCE4EC", color: "#C62828", border: "#EF9A9A" },
                ].map((card) => (
                    <div key={card.label} className="rounded-[12px] px-3 py-3 text-center transition-all duration-200" style={{ backgroundColor: card.bg, border: `1px solid ${card.border}` }}>
                        <div className="text-[11px] font-bold tracking-[0.1px]" style={{ color: card.color }}>{card.label}</div>
                        <div className="mt-1 flex items-baseline justify-center gap-1">
                            <span className="text-[22px] font-extrabold tabular-nums leading-none" style={{ color: card.color }}>{card.value}</span>
                            <span className="text-[11px] font-medium" style={{ color: card.color }}>{card.unit}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mb-3 flex items-center justify-between rounded-[8px] px-3 py-2" style={{ backgroundColor: "#FCF7F8", border: "1px solid #FCEBEF" }}>
                <div className="text-[12px]" style={{ color: "#616161" }}>
                    기준일 <span className="font-bold" style={{ color: "#5C2A35" }}>{dateISO}</span>
                    {lastLoadedAt && (
                        <span className="ml-2 text-[11px]" style={{ color: "#9E9E9E" }}>
                            {lastLoadedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 갱신
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => { void loadStatusData(); }}
                    className="inline-flex items-center gap-1 rounded-[8px] px-3 py-1.5 text-[11px] font-bold transition-all duration-200"
                    style={{ backgroundColor: "#FFFFFF", border: "1px solid #F8DCE2", color: "#D27A8C" }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#FCEBEF"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
                >
                    <RefreshCcw className="h-3 w-3" />
                    새로고침
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <section className="rounded-[12px] overflow-hidden" style={{ border: "1px solid #F8DCE2" }}>
                    <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: "#FCF7F8", borderBottom: "1px solid #FCEBEF" }}>
                        <Users className="h-4 w-4" style={{ color: "#D27A8C" }} />
                        <h3 className="text-[13px] font-bold" style={{ color: "#5C2A35" }}>위치별 시술 진행 현황</h3>
                    </div>

                    <div className="p-3 grid grid-cols-1 gap-2 md:grid-cols-2" style={{ backgroundColor: "#FFFFFF" }}>
                        {locationRows.map((location: any) => (
                            <div key={location.id} className="rounded-[8px] p-2.5" style={{ backgroundColor: "#FAF3F5", border: "1px solid #FCEBEF" }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-bold" style={{ color: "#5C2A35" }}>{location.label}</span>
                                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ backgroundColor: "#FCEBEF", color: "#D27A8C" }}>
                                        {location.totalPatients}명
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-[11px] font-medium">
                                    <span style={{ color: "#00838F" }}>진행 {location.doingPatients}명</span>
                                    <span style={{ color: "#9E9E9E" }}>·</span>
                                    <span style={{ color: "#F57F17" }}>대기 {location.waitingPatients}명</span>
                                </div>

                                {location.topProcedures.length > 0 ? (
                                    <div className="mt-2 space-y-1">
                                        {location.topProcedures.map((procedure: any) => (
                                            <div
                                                key={`${location.id}-${procedure.name}`}
                                                className="rounded-[6px] px-2 py-1.5 flex items-center justify-between gap-2"
                                                style={{ backgroundColor: "#FFFFFF", border: "1px solid #FCEBEF" }}
                                            >
                                                <span className="truncate text-[11px] font-semibold" style={{ color: "#242424" }}>{procedure.name}</span>
                                                <span className="shrink-0 text-[10px] font-medium tabular-nums" style={{ color: "#616161" }}>
                                                    {procedure.doingPatients > 0 && <span style={{ color: "#00838F" }}>진행{procedure.doingPatients} </span>}
                                                    {procedure.waitingPatients > 0 && <span style={{ color: "#F57F17" }}>대기{procedure.waitingPatients}</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-2 rounded-[6px] py-2 text-center text-[11px]" style={{ border: "1px dashed #F8DCE2", color: "#9E9E9E" }}>
                                        시술 없음
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-[12px] overflow-hidden" style={{ border: "1px solid #F8DCE2" }}>
                    <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: "#FCF7F8", borderBottom: "1px solid #FCEBEF" }}>
                        <Activity className="h-4 w-4" style={{ color: "#D27A8C" }} />
                        <h3 className="text-[13px] font-bold" style={{ color: "#5C2A35" }}>시술 그룹별 예상 대기 시간</h3>
                    </div>

                    <div className="p-3" style={{ backgroundColor: "#FFFFFF" }}>
                        {queueRows.length === 0 ? (
                            <div className="rounded-[8px] py-8 text-center text-[12px]" style={{ border: "1px dashed #F8DCE2", color: "#9E9E9E" }}>
                                대기 중인 데이터가 없습니다.
                            </div>
                        ) : (
                            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                                {queueRows.map((row: any) => {
                                    const level = getWaitLevel(row.estimatedWaitMinutes);
                                    const width = Math.min(100, Math.round((row.estimatedWaitMinutes / queueMaxWait) * 100));
                                    const barColor = level === "high" ? "#E53935" : level === "medium" ? "#F57F17" : "#2E7D32";
                                    const barBg = level === "high" ? "#FFCDD2" : level === "medium" ? "#FFE082" : "#A5D6A7";

                                    return (
                                        <div key={row.key} className="rounded-[8px] p-2.5" style={{ backgroundColor: "#FAF3F5", border: "1px solid #FCEBEF" }}>
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="truncate text-[12px] font-bold" style={{ color: "#242424" }}>{row.name}</div>
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "#FFF8E1", color: "#F57F17", border: "1px solid #FFE082" }}>
                                                            대기 {row.todoCount}
                                                        </span>
                                                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "#E0F7FA", color: "#00838F", border: "1px solid #80DEEA" }}>
                                                            진행 {row.doingCount}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className="inline-flex items-center gap-1 text-[14px] font-extrabold tabular-nums" style={{ color: barColor }}>
                                                        <Clock3 className="h-3.5 w-3.5" />
                                                        {row.estimatedWaitMinutes}분
                                                    </div>
                                                    <div className="text-[10px] font-medium" style={{ color: "#9E9E9E" }}>평균 {Math.round(row.averageWorkMinutes)}분/건</div>
                                                </div>
                                            </div>
                                            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: barBg }}>
                                                <div
                                                    className="h-full rounded-full transition-all duration-300"
                                                    style={{ width: `${Math.max(4, width)}%`, backgroundColor: barColor }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {loading && (
                <div className="pointer-events-none fixed bottom-6 right-6 z-20 inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium backdrop-blur" style={{ backgroundColor: "rgba(255,255,255,0.9)", border: "1px solid #F8DCE2", color: "#D27A8C", boxShadow: "0 4px 12px rgba(226,107,124,0.12)" }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    현황 갱신 중...
                </div>
            )}

            {error && (
                <div className="mt-3 rounded-[8px] px-3 py-2 text-[11px]" style={{ backgroundColor: "#FFF3F3", border: "1px solid #FFCDD2", color: "#C62828" }}>
                    {error}
                </div>
            )}
        </div>
    );
}

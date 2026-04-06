import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Plus } from "lucide-react";
import { PatientSearchModal } from "../components/common/PatientSearchModal";
import { TopBar } from "../components/layout/TopBar";
import { DateToolbar } from "../components/dashboard/DateToolbar";
import { CalendarMini } from "../components/dashboard/CalendarMini";
import { StatusColumn } from "../components/dashboard/StatusColumn";
import { useScheduleStore } from "../stores/useScheduleStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useChartStore } from "../stores/useChartStore";
import { useChartSignalR } from "../hooks/useChartSignalR";
import { VIEW_EVENT_MAP } from "../config/signalrEvents";
import { resolveActiveBranchId } from "../utils/branch";

import { IntegratedView } from "../components/chart/IntegratedView";
import { WaitView } from "../components/chart/WaitView";
import { ProcedureStatusView } from "../components/chart/ProcedureStatusView";
import { useCurrentUserPermissions } from "../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../components/common/NoPermissionOverlay";

type ViewMode = 'wait' | 'reservation' | 'visit' | 'integrated' | 'procedure_status';

export default function BoardPage() {
    const [viewMode, setViewMode] = useState<ViewMode>('integrated');
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const { settings } = useSettingsStore();
    const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);

    const { patients } = useChartStore();
    const fetchPatients = useChartStore((s) => s.fetchPatients);
    const { loading, error, items, refresh, moveStatus, dateISO } = useScheduleStore();

    const loadBoardData = useCallback(async () => {
        if (viewMode === 'integrated' || viewMode === 'procedure_status') return;
        const branchId = resolveActiveBranchId();
        if (!branchId) return;
        await Promise.allSettled([
            refresh(),
            fetchPatients(dateISO, branchId),
        ]);
    }, [viewMode, settings.activeBranchId, refresh, fetchPatients, dateISO]);

    useEffect(() => {
        if (viewMode === 'integrated' || viewMode === 'procedure_status') return;
        void loadBoardData();
    }, [loadBoardData, viewMode]);

    useEffect(() => {
        if (viewMode === 'integrated' || viewMode === 'procedure_status') return;
        const timer = setInterval(() => {
            void loadBoardData();
        }, 10000);
        return () => clearInterval(timer);
    }, [loadBoardData, viewMode]);

    useChartSignalR({
        onVisitCreated: () => {
            void loadBoardData();
        },
        onVisitUpdated: () => {
            void loadBoardData();
        },
        onVisitDeleted: () => {
            void loadBoardData();
        },
        onRefreshRequired: () => {
            void loadBoardData();
        },
        enabled: viewMode === 'wait',
        events: VIEW_EVENT_MAP.board,
    });

    const enabledCols = useMemo(() => {
        return [...settings.columns].filter((c) => c.enabled).sort((a, b) => a.order - b.order);
    }, [settings.columns]);

    const itemsForBranch = useMemo(() => {
        return items.filter((it) => it.branchId === settings.activeBranchId);
    }, [items, settings.activeBranchId]);

    const waitingCount = useMemo(() => {
        const waitLists = settings.chartConfig?.waitLists || [];
        return patients.filter(p => {
            const isWaiting = waitLists.some(w => w.enabled && w.id === p.location);
            return isWaiting && p.status !== 'done';
        }).length;
    }, [patients, settings.chartConfig?.waitLists]);

    const tabs: { key: ViewMode; label: string; badge?: number }[] = [
        { key: 'wait', label: '대기', badge: waitingCount },
        { key: 'integrated', label: '통합' },
        { key: 'procedure_status', label: '시술 현황' },
    ];

    if (permLoaded && !permissions["chart.view"]) {
        return (
            <div className="flex flex-col h-full bg-[#F5F7FA]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
                <TopBar title="차트" />
                <NoPermissionOverlay />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#F5F7FA]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
            <TopBar title="차트">
                <div className="flex items-center gap-1 rounded-lg border border-[#C5CAE9] bg-white p-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setViewMode(tab.key)}
                            className={`px-4 py-2 min-h-[40px] text-sm font-medium rounded-lg transition-all duration-200 ease-in-out whitespace-nowrap ${
                                viewMode === tab.key
                                    ? 'bg-[#3F51B5] text-white shadow-[0_4px_12px_rgba(63,81,181,0.18)]'
                                    : 'text-[#616161] hover:text-[#1A237E] hover:bg-[#E8EAF6]'
                            }`}
                        >
                            {tab.label}
                            {tab.badge != null && tab.badge > 0 && (
                                <span className={`ml-1.5 text-xs font-bold ${viewMode === tab.key ? 'text-indigo-200' : 'text-[#3F51B5]'}`}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </TopBar>

            <div className="flex-1 overflow-hidden p-4">
                {viewMode === 'integrated' && <IntegratedView />}
                {viewMode === 'wait' && <WaitView />}
                {viewMode === 'procedure_status' && <ProcedureStatusView />}
            </div>

            <PatientSearchModal
                isOpen={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
            />
        </div>
    );
}

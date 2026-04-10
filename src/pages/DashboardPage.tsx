import React, { useEffect } from "react";
import { TopBar } from "../components/layout/TopBar";
import { HospitalTaskSection } from "../components/dashboard/HospitalTaskSection";
import { NoticeSection } from "../components/dashboard/NoticeSection";
import { useScheduleStore } from "../stores/useScheduleStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useCurrentUserPermissions } from "../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../components/common/NoPermissionOverlay";

export default function DashboardPage() {
  const { settings } = useSettingsStore();
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);
  const { refresh, dateISO } = useScheduleStore();

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO, settings.activeBranchId]);

  if (permLoaded && !permissions["dashboard.view"]) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif", background: "linear-gradient(135deg, #FCF7F8 0%, #FCEBEF 100%)" }}>
        <TopBar title="대시보드" />
        <NoPermissionOverlay />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif", background: "linear-gradient(135deg, #FCF7F8 0%, #FCEBEF 100%)" }}>
      <TopBar title="대시보드" />

      <div className="flex min-h-0 flex-1 overflow-hidden p-6">
        <div className="grid min-h-0 w-full grid-cols-12 gap-6">
          <div className="col-span-12 min-h-0 lg:col-span-5">
            <HospitalTaskSection />
          </div>
          <div className="col-span-12 min-h-0 lg:col-span-7">
            <NoticeSection />
          </div>
        </div>
      </div>
    </div>
  );
}

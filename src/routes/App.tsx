import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import LoginPage from "../pages/LoginPage";
import SignupPage from "../pages/SignupPage";
import DashboardPage from "../pages/DashboardPage";
import BoardPage from "../pages/BoardPage";
import ReservationPage from "../pages/ReservationPage";
import PlaceholderPage from "../pages/PlaceholderPage";
import RevenueStatsPage from "../pages/RevenueStatsPage";
import ProcedureTodoStatsPage from "../pages/TodoStatsPage";
import MyInfoPage from "../pages/MyInfoPage";
import PatientChartPage from "../pages/PatientChartPage";
import PatientListPage from "../pages/PatientListPage";
import HospitalSettingsPage from "../pages/settings/HospitalSettingsPage";
import ChartSettingsPage from "../pages/settings/ChartSettingsPage";
import MembersSettingsPage from "../pages/settings/MembersSettingsPage";
import TicketsSettingsPage from "../pages/settings/TicketsSettingsPage";
import PhrasesSettingsPage from "../pages/settings/PhrasesSettingsPage";
import FormsSettingsPage from "../pages/settings/FormsSettingsPage";
import IntegrationsSettingsPage from "../pages/settings/IntegrationsSettingsPage";
import BranchSettingsPage from "../pages/settings/BranchSettingsPage";
import TerminalTestPage from "../pages/settings/TerminalTestPage";
import MessagesPage from "../pages/crm/MessagesPage";
import ConsentSignaturePage from "../pages/mobile/ConsentSignaturePage";
import KioskBookingPage from "../pages/kiosk/KioskBookingPage";
import TabletCheckinPage from "../pages/tablet/TabletCheckinPage";
import { AppShell } from "../components/layout/AppShell";
import { useAuthStore } from "../stores/useAuthStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import apiClient from "../services/apiClient";
import { useEffect } from "react";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthed);
  const loc = useLocation();

  if (!isAuthed) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  const setBranches = useSettingsStore((state) => state.setBranches);

  useEffect(() => {
    // Fetch branches on app mount (globally available for Login & App)
    apiClient.get("/branches")
      .then((res) => {
        const mapped = res.data.map((b: any) => ({
          id: String(b.id),
          name: b.name
        }));
        if (mapped.length > 0) {
          setBranches(mapped);
        }
      })
      .catch((err) => console.error("Failed to fetch branches globally", err));
  }, [setBranches]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* 모바일 공개 페이지 (인증 불필요) */}
      <Route path="/m/consent/:token" element={<ConsentSignaturePage />} />
      <Route path="/kiosk" element={<KioskBookingPage />} />
      <Route path="/tablet-checkin" element={<TabletCheckinPage />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="chart" element={<BoardPage />} />
        <Route path="chart-view/:patientId" element={<PatientChartPage />} />
        <Route path="reservation" element={<ReservationPage />} />
        <Route path="schedule" element={<Navigate to="chart" replace />} /> {/* Backward compatibility */}
        <Route path="my-info" element={<MyInfoPage />} />

        <Route path="patients" element={<PatientListPage />} />
        <Route
          path="stats"
          element={<Navigate to="revenue" replace />}
        />
        <Route
          path="stats/revenue"
          element={<RevenueStatsPage />}
        />
        <Route
          path="stats/todo"
          element={<ProcedureTodoStatsPage />}
        />
        <Route
          path="stats/procedure"
          element={<PlaceholderPage title="시술 통계" desc="인기 시술 및 시술별 성과를 확인할 수 있는 페이지입니다." />}
        />
        <Route
          path="integrations"
          element={<Navigate to="/app/settings/integrations" replace />}
        />

        {/* ===== 설정(설정) 메뉴 하위 ===== */}
        <Route path="settings" element={<Navigate to="settings/hospital" replace />} />
        <Route path="settings/hospital" element={<HospitalSettingsPage />} />
        <Route path="settings/chart" element={<ChartSettingsPage />} />
        <Route path="settings/members" element={<MembersSettingsPage />} />
        <Route path="settings/tickets" element={<TicketsSettingsPage />} />
        <Route path="settings/phrases" element={<PhrasesSettingsPage />} />
        <Route path="settings/forms" element={<FormsSettingsPage />} />
        <Route path="settings/integrations" element={<IntegrationsSettingsPage />} />
        <Route path="settings/branches" element={<BranchSettingsPage />} />
        <Route path="settings/terminal-test" element={<TerminalTestPage />} />


        {/* CRM */}
        <Route path="crm" element={<Navigate to="crm/messages" replace />} />
        <Route path="crm/messages" element={<MessagesPage />} />
        <Route
          path="crm/sns"
          element={
            <PlaceholderPage
              title="SNS 관리"
              desc="Instagram, Blog 등 소셜 미디어 연동 기능 (Beta)"
            />
          }
        />
        <Route
          path="crm/dispatch"
          element={<PlaceholderPage title="발송정보" desc="메시지 발송 내역 및 통계" />}
        />
        <Route
          path="crm/phone"
          element={<PlaceholderPage title="전화" desc="CTI 연동 및 통화 내역" />}
        />
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

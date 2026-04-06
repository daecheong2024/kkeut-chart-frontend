import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarCheck2,
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ClipboardList,
  Mail,
  UserCog,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { cn } from "../../lib/cn";
import { BrandMark } from "../BrandMark";
import { useAuthStore } from "../../stores/useAuthStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { useAppShell } from "./AppShellContext";

const items = [
  { to: "/app", label: "대시보드", icon: LayoutDashboard },
  { to: "/app/chart", label: "차트", icon: ClipboardList },
  { to: "/app/reservation", label: "예약", icon: CalendarCheck2 },
  { to: "/app/patients", label: "환자", icon: Users }
];

export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const logout = useAuthStore((s) => s.logout);
  const userEmail = useAuthStore((s) => s.userEmail);
  const isAdmin = userEmail?.toLowerCase() === "admin@admin.com";
  const location = useLocation();
  const navigate = useNavigate();
  const shell = useAppShell();
  const [isCrmOpen, setIsCrmOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const isCrmActive = location.pathname.startsWith('/app/crm');
  const isStatsActive = location.pathname.startsWith('/app/stats');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isSettingsActive = location.pathname.startsWith('/app/settings');
  const activeBranchId = useSettingsStore((s) => s.settings.activeBranchId);
  const { permissions } = useCurrentUserPermissions(activeBranchId);
  const canManageBranches = !!permissions["settings.branches"];

  if (collapsed) {
    return (
      <aside className="kkeut-sidebar-shell flex h-full w-[52px] flex-col items-center">
        <div className="py-4 border-b border-white/10 w-full flex justify-center">
          <button
            onClick={() => shell?.toggleSidebarCollapsed()}
            className="p-1.5 rounded hover:bg-white/15 text-white/50 hover:text-white transition-colors"
            title="사이드바 펼치기"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto w-full flex flex-col items-center gap-1">
          {items.map((it) => {
            const isActive = it.to === "/app"
              ? location.pathname === "/app"
              : location.pathname.startsWith(it.to);
            return (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={onNavigate}
                end={it.to === "/app"}
                className={cn(
                  "kkeut-sidebar-item flex items-center justify-center rounded-xl w-9 h-9",
                  isActive && "kkeut-sidebar-item-active"
                )}
                title={it.label}
              >
                <it.icon className="h-4.5 w-4.5" />
              </NavLink>
            );
          })}

          {/* Stats */}
          <button
            onClick={() => navigate("/app/stats/revenue")}
            className={cn(
              "kkeut-sidebar-item flex items-center justify-center rounded-xl w-9 h-9",
              isStatsActive && "kkeut-sidebar-item-active"
            )}
            title="통계"
          >
            <BarChart3 className="h-4.5 w-4.5" />
          </button>

          {/* CRM */}
          <button
            onClick={() => navigate("/app/crm/sns")}
            className={cn(
              "kkeut-sidebar-item flex items-center justify-center rounded-xl w-9 h-9",
              isCrmActive && "kkeut-sidebar-item-active"
            )}
            title="CRM"
          >
            <Mail className="h-4.5 w-4.5" />
          </button>

          {/* Settings */}
          <button
            onClick={() => navigate("/app/settings/hospital")}
            className={cn(
              "kkeut-sidebar-item flex items-center justify-center rounded-xl w-9 h-9",
              isSettingsActive && "kkeut-sidebar-item-active"
            )}
            title="설정"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        </nav>

        <div className="border-t border-white/10 py-3 w-full flex flex-col items-center gap-2">
          <NavLink
            to="/app/my-info"
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center justify-center rounded-xl w-9 h-9 transition-colors",
                isActive
                  ? "bg-[rgba(var(--kkeut-primary),.16)] text-white"
                  : "text-slate-100 hover:bg-white/15"
              )
            }
            title="내정보"
          >
            <UserCog className="h-4 w-4" />
          </NavLink>
          <button
            onClick={logout}
            className="flex items-center justify-center rounded-xl w-9 h-9 text-slate-100 hover:bg-white/15"
            title="로그아웃"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="kkeut-sidebar-shell flex h-full w-[264px] flex-col">
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <BrandMark />
        {shell && (
          <button
            onClick={() => shell.toggleSidebarCollapsed()}
            className="p-1 rounded hover:bg-white/15 text-white/50 hover:text-white transition-colors"
            title="사이드바 접기"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="kkeut-sidebar-scroll flex-1 px-3 py-3 overflow-y-auto">
        {items.slice(0, 4).map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            end={it.to === "/app"}
            className={({ isActive }) =>
              cn(
                "kkeut-sidebar-item mb-1.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                isActive && "kkeut-sidebar-item-active"
              )
            }
          >
            <it.icon className="h-4.5 w-4.5" />
            {it.label}
          </NavLink>
        ))}

        {/* Stats Menu */}
        <div>
          <button
            onClick={() => setIsStatsOpen(!isStatsOpen)}
            className={cn(
              "kkeut-sidebar-item mb-1.5 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold",
              (isStatsOpen || isStatsActive) && "bg-white/10 border border-white/10",
              isStatsActive && !isStatsOpen && "kkeut-sidebar-item-active"
            )}
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="h-4.5 w-4.5" />
              <span>통계</span>
            </div>
            {isStatsOpen ? <ChevronUp className="h-4 w-4 text-slate-300" /> : <ChevronDown className="h-4 w-4 text-slate-300" />}
          </button>

          {isStatsOpen && (
            <div className="kkeut-sidebar-submenu mb-2 space-y-1">
              <NavLink
                to="/app/stats/revenue"
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  "kkeut-sidebar-subitem block px-3 py-2 text-sm font-medium pl-10",
                  isActive && "kkeut-sidebar-subitem-active"
                )}
              >
                매출
              </NavLink>
              <NavLink
                to="/app/stats/todo"
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  "kkeut-sidebar-subitem block px-3 py-2 text-sm font-medium pl-10",
                  isActive && "kkeut-sidebar-subitem-active"
                )}
              >
                할일
              </NavLink>
            </div>
          )}
        </div>

        {/* CRM Menu */}
        <div>
          <button
            onClick={() => setIsCrmOpen(!isCrmOpen)}
            className={cn(
              "kkeut-sidebar-item mb-1.5 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold",
              (isCrmOpen || isCrmActive) && "bg-white/10 border border-white/10",
              isCrmActive && !isCrmOpen && "kkeut-sidebar-item-active"
            )}
          >
            <div className="flex items-center gap-3">
              <Mail className="h-4.5 w-4.5" />
              <span>CRM</span>
            </div>
            {isCrmOpen ? <ChevronUp className="h-4 w-4 text-slate-300" /> : <ChevronDown className="h-4 w-4 text-slate-300" />}
          </button>

          {isCrmOpen && (
            <div className="kkeut-sidebar-submenu mb-2 space-y-1">
              <NavLink
                to="/app/crm/sns"
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  "kkeut-sidebar-subitem flex items-center justify-between px-3 py-2 text-sm font-medium pl-10",
                  isActive && "kkeut-sidebar-subitem-active"
                )}
              >
                SNS
                <span className="text-[10px] font-bold text-cyan-700 bg-cyan-100 px-1.5 py-0.5 rounded">Beta</span>
              </NavLink>
              <NavLink
                to="/app/crm/messages"
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  "kkeut-sidebar-subitem block px-3 py-2 text-sm font-medium pl-10",
                  isActive && "kkeut-sidebar-subitem-active"
                )}
              >
                메시지
              </NavLink>
            </div>
          )}
        </div>

        {items.slice(4).map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            end={it.to === "/app"}
            className={({ isActive }) =>
              cn(
                "kkeut-sidebar-item mb-1.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                isActive && "kkeut-sidebar-item-active"
              )
            }
          >
            <it.icon className="h-4.5 w-4.5" />
            {it.label}
          </NavLink>
        ))}

        {/* 설정 Menu */}
        <div>
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={cn(
              "kkeut-sidebar-item mb-1.5 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold",
              (isSettingsOpen || isSettingsActive) && "bg-white/10 border border-white/10",
              isSettingsActive && !isSettingsOpen && "kkeut-sidebar-item-active"
            )}
          >
            <div className="flex items-center gap-3">
              <Settings className="h-4.5 w-4.5" />
              <span>설정</span>
            </div>
            {isSettingsOpen ? <ChevronUp className="h-4 w-4 text-slate-300" /> : <ChevronDown className="h-4 w-4 text-slate-300" />}
          </button>

          {isSettingsOpen && (
            <div className="kkeut-sidebar-submenu mb-2 space-y-1">
              {[
                { to: "/app/settings/hospital", label: "병원" },
                { to: "/app/settings/chart", label: "차트" },
                { to: "/app/settings/members", label: "멤버" },
                { to: "/app/settings/tickets", label: "티켓" },
                { to: "/app/settings/phrases", label: "문구" },
                { to: "/app/settings/forms", label: "서식" },
                { to: "/app/settings/integrations", label: "연동" },
                ...(canManageBranches ? [{ to: "/app/settings/branches", label: "지점" }] : []),
                ...(isAdmin ? [{ to: "/app/settings/terminal-test", label: "단말기" }] : []),
              ].map(sub => (
                <NavLink
                  key={sub.to}
                  to={sub.to}
                  onClick={onNavigate}
                  className={({ isActive }) => cn(
                    "kkeut-sidebar-subitem block px-3 py-2 text-sm font-medium pl-10",
                    isActive && "kkeut-sidebar-subitem-active"
                  )}
                >
                  {sub.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="space-y-2 border-t border-white/10 p-3">
        <NavLink
          to="/app/my-info"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
              isActive
                ? "border-[rgba(var(--kkeut-primary),.45)] bg-[rgba(var(--kkeut-primary),.16)] text-white"
                : "border-white/20 bg-white/10 text-slate-100 hover:bg-white/15"
            )
          }
        >
          <UserCog className="h-4 w-4" />
          내정보
        </NavLink>

        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/15"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </button>
      </div>
    </aside>
  );
}

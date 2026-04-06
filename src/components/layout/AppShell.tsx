import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AppShellProvider, useAppShell } from "./AppShellContext";
import { MobileBottomNav } from "./MobileBottomNav";
import { cn } from "../../lib/cn";
import { useSettingsStore } from "../../stores/useSettingsStore";
import apiClient from "../../services/apiClient";

function AppShellInner() {
  const shell = useAppShell();
  const isMobile = !!shell?.isMobile;
  const isCompact = !!shell?.isCompact;

  return (
    <div className="kkeut-app-layout flex h-screen w-full overflow-hidden">
      {/* Desktop sidebar (xl+) */}
      <div
        className={cn(
          "hidden xl:flex shrink-0 transition-all duration-200",
          shell?.sidebarCollapsed ? "w-[52px]" : "w-[264px]"
        )}
      >
        <Sidebar collapsed={!!shell?.sidebarCollapsed} />
      </div>

      {/* Compact drawer sidebar (tablet + phone) */}
      {isCompact ? (
        <div
          className={cn(
            "fixed inset-0 z-50 xl:hidden",
            shell?.sidebarOpen ? "pointer-events-auto" : "pointer-events-none"
          )}
          aria-hidden={!shell?.sidebarOpen}
        >
          <div
            className={cn(
              "absolute inset-0 bg-black/30 transition-opacity",
              shell?.sidebarOpen ? "opacity-100" : "opacity-0"
            )}
            onClick={() => shell?.closeSidebar()}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl transition-transform duration-300",
              "kkeut-sidebar-shell",
              shell?.sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <Sidebar onNavigate={() => shell?.closeSidebar()} />
          </div>
        </div>
      ) : null}

      {/* Only reserve space for bottom nav on phones */}
      <main className={cn("kkeut-main-stage flex min-w-0 flex-1 flex-col", isMobile && "pb-16")}>
        <Outlet />
      </main>

      {isMobile ? <MobileBottomNav /> : null}
    </div>
  );
}

export function AppShell() {
  return (
    <AppShellProvider>
      <AppShellInner />
    </AppShellProvider>
  );
}

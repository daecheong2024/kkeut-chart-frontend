import React, { createContext, useContext, useMemo, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";

type AppShellCtx = {
  isMobile: boolean;
  isCompact: boolean;
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
};

const Ctx = createContext<AppShellCtx | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  // NOTE:
  // - isMobile: small phones (show bottom nav)
  // - isCompact: tablets + phones (hide persistent sidebar, use drawer + hamburger)
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isCompact = useMediaQuery("(max-width: 1279px)");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const value = useMemo<AppShellCtx>(() => {
    const openSidebar = () => setSidebarOpen(true);
    const closeSidebar = () => setSidebarOpen(false);
    const toggleSidebar = () => setSidebarOpen((v) => !v);
    const toggleSidebarCollapsed = () => setSidebarCollapsed((v) => !v);
    return { isMobile, isCompact, sidebarOpen, openSidebar, closeSidebar, toggleSidebar, sidebarCollapsed, toggleSidebarCollapsed };
  }, [isMobile, isCompact, sidebarOpen, sidebarCollapsed]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppShell() {
  return useContext(Ctx);
}

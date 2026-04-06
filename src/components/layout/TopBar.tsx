import React from "react";
import { Menu } from "lucide-react";
import { GlobalSearchBar } from "../common/GlobalSearchBar";
import { useAppShell } from "./AppShellContext";

export function TopBar({ title, children }: { title: string; children?: React.ReactNode }) {
  const shell = useAppShell();

  return (
    <header
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
        gap: 16, padding: "12px 24px",
        background: "#F8F9FD",
        borderBottom: "1px solid #C5CAE9",
        boxShadow: "0 1px 3px rgba(63, 81, 181, 0.06)",
        fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        {shell?.isCompact ? (
          <button
            type="button"
            onClick={() => shell.openSidebar()}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 40, height: 40, borderRadius: 8,
              border: "1px solid #C5CAE9", background: "#FFFFFF",
              color: "#242424", cursor: "pointer",
              transition: "all 0.2s ease-in-out",
            }}
            aria-label="메뉴 열기"
          >
            <Menu style={{ width: 20, height: 20 }} />
          </button>
        ) : null}

        <div style={{ fontSize: 18, fontWeight: 700, color: "#1A237E", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
          {title}
        </div>

        {children && <div style={{ minWidth: 0, flex: 1 }}>{children}</div>}
      </div>

      <GlobalSearchBar className="w-full md:w-auto" />
    </header>
  );
}

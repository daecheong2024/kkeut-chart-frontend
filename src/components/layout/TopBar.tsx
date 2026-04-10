import React from "react";
import { Menu } from "lucide-react";
import { GlobalSearchBar } from "../common/GlobalSearchBar";
import { useAppShell } from "./AppShellContext";

export function TopBar({ title, children }: { title: string; children?: React.ReactNode }) {
  const shell = useAppShell();

  return (
    <header
      style={{
        position: "relative",
        display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
        gap: 16, padding: "14px 28px",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCF7F8 100%)",
        borderBottom: "1px solid #F8DCE2",
        boxShadow: "0 4px 16px rgba(226, 107, 124, 0.06)",
        fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {shell?.isCompact ? (
          <button
            type="button"
            onClick={() => shell.openSidebar()}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 40, height: 40, borderRadius: 10,
              border: "1px solid #F8DCE2", background: "#FFFFFF",
              color: "#5C2A35", cursor: "pointer",
              transition: "all 0.2s ease-in-out",
              boxShadow: "0 2px 6px rgba(226, 107, 124, 0.08)",
            }}
            aria-label="메뉴 열기"
          >
            <Menu style={{ width: 20, height: 20 }} />
          </button>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 4, height: 22,
              borderRadius: 4,
              background: "linear-gradient(180deg, #D27A8C 0%, #8B3F50 100%)",
              boxShadow: "0 2px 8px rgba(226, 107, 124, 0.32)",
            }}
          />
          <div style={{ fontSize: 19, fontWeight: 800, color: "#5C2A35", letterSpacing: "-0.4px", lineHeight: 1.2 }}>
            {title}
          </div>
        </div>

        {children && <div style={{ minWidth: 0, flex: 1 }}>{children}</div>}
      </div>

      <GlobalSearchBar className="w-full md:w-auto" />
    </header>
  );
}

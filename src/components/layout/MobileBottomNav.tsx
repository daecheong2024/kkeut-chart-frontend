import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, CalendarCheck2, ClipboardList, Users, Settings } from "lucide-react";
import { cn } from "../../lib/cn";

const items = [
  { to: "/app", label: "홈", icon: LayoutDashboard },
  { to: "/app/reservation", label: "예약", icon: CalendarCheck2 },
  { to: "/app/chart", label: "차트", icon: ClipboardList },
  { to: "/app/patients", label: "환자", icon: Users },
  { to: "/app/settings/hospital", label: "설정", icon: Settings },
];

export function MobileBottomNav() {
  return (
    <nav className="kkeut-bottom-nav fixed inset-x-0 bottom-0 z-40 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-5 px-2 py-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold text-slate-600",
                isActive && "bg-[rgba(var(--kkeut-primary),.14)] text-[rgb(var(--kkeut-primary-strong))] shadow-sm"
              )
            }
          >
            <it.icon className="h-5 w-5" />
            <span className="leading-none">{it.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

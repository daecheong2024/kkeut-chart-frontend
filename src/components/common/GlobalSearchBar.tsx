import React from "react";
import { Bell, Search } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { PatientSearchModal } from "./PatientSearchModal";
import { resolveActiveBranchId } from "../../utils/branch";

interface GlobalSearchBarProps {
  className?: string;
}

export function GlobalSearchBar({ className }: GlobalSearchBarProps) {
  const { settings } = useSettingsStore();
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);

  const branches = settings?.branches?.length > 0 ? settings.branches : [];
  const activeBranchId = resolveActiveBranchId();

  return (
    <>
      <div className={`flex items-center gap-2 md:gap-3 ${className || ""}`}>
        <div className="relative flex-1 md:w-[320px] md:flex-none" onClick={() => setIsSearchOpen(true)}>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            readOnly
            type="text"
            placeholder="환자/예약 검색"
            className="w-full h-10 pl-10 pr-10 border border-slate-200/80 bg-white/90 rounded-xl text-sm font-medium text-slate-700 transition-all outline-none placeholder:text-slate-400 cursor-pointer hover:bg-white hover:shadow-sm"
          />
        </div>

        <div className="relative shrink-0">
          <div className="flex items-center h-10 pl-3 pr-4 bg-white/85 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-600 min-w-[88px] shadow-sm">
            {branches.find((b) => b.id === activeBranchId)?.name || "지점"}
          </div>
        </div>

        <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200/80 bg-white/90 hover:bg-white text-slate-600 transition-colors shadow-sm">
          <Bell className="w-4 h-4" />
        </button>
      </div>

      <PatientSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}

import React, { useMemo } from "react";
import { format } from "date-fns";
import { cn } from "../../lib/cn";
import { useScheduleStore } from "../../stores/useScheduleStore";

export function CalendarMini() {
  const dateISO = useScheduleStore((s) => s.dateISO);
  const setDateISO = useScheduleStore((s) => s.setDateISO);

  const { year, month, days, startDow } = useMemo(() => {
    const d = new Date(dateISO + "T00:00:00");
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days = last.getDate();
    const startDow = first.getDay(); // 0-6
    return { year, month, days, startDow };
  }, [dateISO]);

  const title = useMemo(() => {
    const d = new Date(year, month, 1);
    return format(d, "yyyy.MM");
  }, [year, month]);

  function pick(day: number) {
    const d = new Date(year, month, day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setDateISO(`${yyyy}-${mm}-${dd}`);
  }

  const selectedDay = Number(dateISO.split("-")[2]);

  const cells: Array<number | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let i = 1; i <= days; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const dow = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">{title}</div>
        <div className="text-xs text-gray-500">빠른 날짜 이동</div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {dow.map((d) => (
          <div key={d} className="py-1 text-center text-[11px] font-semibold text-gray-500">
            {d}
          </div>
        ))}
        {cells.map((v, idx) => (
          <button
            key={idx}
            disabled={!v}
            onClick={() => v && pick(v)}
            className={cn(
              "h-8 rounded-lg text-sm transition",
              !v && "cursor-default opacity-0",
              v && "hover:bg-gray-50",
              v === selectedDay && "bg-[rgba(var(--kkeut-primary),.12)] font-bold text-[rgb(var(--kkeut-primary))]"
            )}
          >
            {v ?? ""}
          </button>
        ))}
      </div>
    </div>
  );
}

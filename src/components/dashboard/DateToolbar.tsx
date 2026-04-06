import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { Button } from "../ui/Button";
import { useScheduleStore } from "../../stores/useScheduleStore";

function shiftDay(iso: string, delta: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function DateToolbar() {
  const dateISO = useScheduleStore((s) => s.dateISO);
  const setDateISO = useScheduleStore((s) => s.setDateISO);
  const refresh = useScheduleStore((s) => s.refresh);

  const label = useMemo(() => {
    const d = new Date(dateISO + "T00:00:00");
    return format(d, "yyyy-MM-dd (EEE)");
  }, [dateISO]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDateISO(shiftDay(dateISO, -1))}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          이전
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDateISO(shiftDay(dateISO, 1))}>
          다음
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 py-2 text-sm font-semibold">
          {label}
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={() => void refresh()}>
        <RotateCcw className="mr-2 h-4 w-4" />
        새로고침
      </Button>
    </div>
  );
}

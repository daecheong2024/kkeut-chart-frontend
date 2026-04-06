import React, { useMemo } from "react";
import { Clock3, User } from "lucide-react";
import { format } from "date-fns";
import type { AppointmentItem } from "../../types/appointments";
import { Badge } from "../ui/Badge";
import { cn } from "../../lib/cn";

export function AppointmentCard({
  item,
  onMove
}: {
  item: AppointmentItem;
  onMove: (next: AppointmentItem["status"]) => void;
}) {
  const timeLabel = useMemo(() => {
    const d = new Date(item.startAt);
    return format(d, "p");
  }, [item.startAt]);

  const sexAge = [item.patient.sex === "M" ? "남" : item.patient.sex === "F" ? "여" : "", item.patient.age ? `${item.patient.age}세` : ""]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(var(--kkeut-primary),.10)]">
              <User className="h-4 w-4 text-[rgb(var(--kkeut-primary))]" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{item.patient.name}</div>
              <div className="text-xs text-gray-500">{sexAge || "—"}</div>
            </div>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-1 text-xs text-gray-600">
          <Clock3 className="h-3.5 w-3.5" />
          {timeLabel}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.labels.slice(0, 4).map((t) => (
          <Badge key={t} className={cn(t === "네이버" && "border-orange-200 bg-orange-50 text-orange-700")}>
            {t}
          </Badge>
        ))}
      </div>

      {item.note && <div className="mt-2 line-clamp-3 text-xs text-gray-600">{item.note}</div>}

      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded-lg border border-[rgb(var(--kkeut-border))] px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => onMove("reserved")}
        >
          예약
        </button>
        <button
          className="rounded-lg border border-[rgb(var(--kkeut-border))] px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => onMove("checked_in")}
        >
          접수
        </button>
        <button
          className="rounded-lg border border-[rgb(var(--kkeut-border))] px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => onMove("completed")}
        >
          완료
        </button>
      </div>
    </div>
  );
}

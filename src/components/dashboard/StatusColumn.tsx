import React from "react";
import type { AppointmentItem } from "../../types/appointments";
import { AppointmentCard } from "./AppointmentCard";

export function StatusColumn({
  title,
  items,
  onMove
}: {
  title: string;
  items: AppointmentItem[];
  onMove: (id: string, next: AppointmentItem["status"]) => void;
}) {
  return (
    <div className="flex min-w-[320px] flex-1 flex-col">
      <div className="flex items-center justify-between pb-2">
        <div className="text-sm font-extrabold">{title}</div>
        <div className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{items.length}</div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-auto rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-2">
        {items.length === 0 ? (
          <div className="grid h-24 place-items-center text-xs text-gray-500">표시할 항목이 없습니다</div>
        ) : (
          items.map((it) => (
            <AppointmentCard
              key={it.id}
              item={it}
              onMove={(next) => onMove(it.id, next)}
            />
          ))
        )}
      </div>
    </div>
  );
}

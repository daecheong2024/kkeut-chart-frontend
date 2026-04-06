import React from "react";
import { TopBar } from "../components/layout/TopBar";

export default function PlaceholderPage({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title={title} />
      <div className="p-6">
        <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-sm">
          <div className="text-lg font-extrabold">{title}</div>
          <div className="mt-2 text-sm text-gray-600">{desc}</div>

          <div className="mt-5 text-sm font-semibold">여기서 확장할 예정</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
            <li>예약 조회/변경/취소</li>
            <li>시술 주기 체크</li>
            <li>잔여 시술/포인트</li>
            <li>연동(네이버/구글/카카오/라인/위챗 등)</li>
            <li>통계(할일/매출/직원별/회원권)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import type { AppointmentStatusColumn } from "../types/settings";

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const { userEmail } = useAuthStore();
  const navigate = useNavigate();
  const [draftCols, setDraftCols] = useState<AppointmentStatusColumn[]>(settings.columns);
  const allowedBranchManagerEmail = "jihongryu1991@gmail.com";

  const hasBranchPerm = useMemo(() => {
    return (userEmail || "").trim().toLowerCase() === allowedBranchManagerEmail;
  }, [userEmail]);

  const enabledCount = useMemo(() => draftCols.filter((c) => c.enabled).length, [draftCols]);

  function toggle(key: AppointmentStatusColumn["key"]) {
    setDraftCols((cols) => cols.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c)));
  }

  function changeLabel(key: AppointmentStatusColumn["key"], label: string) {
    setDraftCols((cols) => cols.map((c) => (c.key === key ? { ...c, label } : c)));
  }

  function save() {
    // 여기서도 "하드코딩 금지": settings.columns만 바꿔도 UI 보드가 자동 반영됨
    updateSettings({ columns: draftCols });
    alert("저장되었습니다. (로컬스토리지)");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="설정(동적)" />

      <div className="p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-sm">
            <div className="text-lg font-extrabold">예약 보드 컬럼 설정</div>
            <div className="mt-2 text-sm text-gray-600">
              컬럼은 <span className="font-semibold">설정 기반</span>으로 렌더링됩니다. (현재: {enabledCount}개 활성)
            </div>

            <div className="mt-4 space-y-3">
              {draftCols
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--kkeut-border))] bg-gray-50 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold">{c.key}</div>
                      <div className="mt-1 max-w-[320px]">
                        <Input value={c.label} onChange={(e) => changeLabel(c.key, e.target.value)} />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant={c.enabled ? "primary" : "outline"} size="sm" onClick={() => toggle(c.key)}>
                        {c.enabled ? "사용" : "미사용"}
                      </Button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={save}>
                저장
              </Button>
              <Button variant="outline" onClick={resetSettings}>
                초기화
              </Button>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              추후 백엔드에서 <code className="rounded bg-gray-100 px-1">/settings</code>로 내려주면 프론트는 동일 로직으로 바로 반영됩니다.
            </div>
          </div>

          <div className="rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-6 shadow-sm">
            <div className="text-lg font-extrabold">지점/연동/권한(placeholder)</div>
            <div className="mt-2 text-sm text-gray-600">
              네트워크(8개 지점) 확장 대응을 위해,
              지점/권한/연동은 모두 설정 테이블로 관리하는 방향을 권장합니다.
            </div>

            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">현재 지점 목록</div>
                {hasBranchPerm && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/app/settings/branches")}>
                    지점 관리
                  </Button>
                )}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {settings.branches.map((b) => (
                  <li key={b.id}>
                    {b.name} <span className="text-xs text-gray-400">({b.id})</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-xs text-gray-500">
                (추후) 지점 추가/숨김/순서/권한까지 모두 UI로 세팅 가능하게 확장합니다.
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <div className="text-sm font-bold">연동(예정)</div>
              <div className="mt-2 text-sm text-gray-700">
                홈페이지 / 여신티켓 / 네이버예약 / 구글비즈니스 / 카카오 / 라인 / 인스타 / 왓츠앱 / 위챗
              </div>
              <div className="mt-2 text-xs text-gray-500">
                프론트는 on/off 및 UI 플로우를 먼저 만들고, 실제 연결은 C# API 단계에서 진행합니다.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Switch } from "../../components/ui/Switch";
import { useSettingsStore } from "../../stores/useSettingsStore";
import type { IntegrationsConfig } from "../../types/settings";
import { MessageSquare, Instagram, MonitorSmartphone, Layers, Link2, Copy, ExternalLink, ReceiptText, CheckCircle2, XCircle, Download, RefreshCw } from "lucide-react";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";
import {
    printService,
    PRINT_AGENT_DOWNLOAD_URL,
    BIXOLON_DRIVER_URL,
    type PrintAgentStatus,
} from "../../services/printService";

async function safeOpenDownload(url: string, label: string) {
  const isExternal = /^https?:\/\//i.test(url);
  if (isExternal) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || ct.includes("text/html")) {
      alert(
        `${label} 이(가) 아직 서버에 배포되지 않았습니다.\n\nIT 담당자에게 문의하거나, 프론트 배포 디렉터리의 'downloads/' 경로에 설치 파일을 업로드해야 합니다.\n\n요청 경로: ${url}`,
      );
      return;
    }
  } catch {
    alert(`${label} 요청에 실패했습니다. IT 담당자에게 문의하세요.\n\n요청 경로: ${url}`);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function StatusRow({
  label,
  ok,
  helperOk,
  helperFail,
  downloadHref,
  downloadLabel,
}: {
  label: string;
  ok: boolean;
  helperOk?: string;
  helperFail?: string;
  downloadHref?: string;
  downloadLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[rgb(var(--kkeut-border))] bg-white p-3">
      <div className="flex items-start gap-2 min-w-0">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
        )}
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-800">{label}</div>
          <div className="mt-0.5 text-[11px] text-gray-500 break-all">
            {ok ? helperOk : helperFail}
          </div>
        </div>
      </div>
      {!ok && downloadHref && (
        <button
          type="button"
          onClick={() => safeOpenDownload(downloadHref, downloadLabel ?? "설치 파일")}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700 hover:bg-violet-100"
        >
          <Download className="h-3.5 w-3.5" />
          {downloadLabel ?? "다운로드"}
        </button>
      )}
    </div>
  );
}

function ReceiptPrinterCard() {
  const [status, setStatus] = useState<PrintAgentStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = React.useCallback(async () => {
    setChecking(true);
    try {
      const s = await printService.getPrintAgentStatus();
      setStatus(s);
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const agentOk = !!status?.agentAvailable;
  const bixolonOk = !!status?.bixolonInstalled;

  return (
    <div className="flex flex-col rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${agentOk && bixolonOk ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
            <ReceiptText className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-gray-900">차트 프린터</div>
            <div className="text-xs text-gray-500">
              {agentOk && bixolonOk
                ? "정상 동작 중"
                : agentOk
                ? "에이전트 실행중, 프린터 미확인"
                : "에이전트 미실행 또는 미설치"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={checking}
          className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--kkeut-border))] bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          title="상태 새로고침"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      <div className="space-y-2">
        <StatusRow
          label="끗차트 인쇄 에이전트"
          ok={agentOk}
          helperOk={
            status
              ? `v${status.agentVersion ?? "-"} · 포트 ${status.port ?? "-"} · 기본 프린터: ${status.defaultPrinter ?? "미설정"}`
              : ""
          }
          helperFail="운영 PC에 에이전트가 실행되어 있지 않습니다. 설치 후 재부팅 하면 자동 상주합니다."
          downloadHref={PRINT_AGENT_DOWNLOAD_URL}
          downloadLabel="에이전트 설치파일"
        />
        <StatusRow
          label="BIXOLON 프린터 드라이버"
          ok={bixolonOk}
          helperOk={
            status?.bixolonIsDefault
              ? "기본 프린터로 설정되어 있습니다."
              : "설치됨 (기본 프린터로 설정 권장)"
          }
          helperFail={
            agentOk
              ? "설치된 프린터 중 BIXOLON 이 발견되지 않았습니다. 드라이버 설치 후 USB 연결을 확인하세요."
              : "에이전트 실행 후 다시 확인해 주세요."
          }
          downloadHref={BIXOLON_DRIVER_URL}
          downloadLabel="BIXOLON 드라이버"
        />
      </div>

      {status?.installedPrinters && status.installedPrinters.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] text-gray-500">
          <div className="mb-1 font-bold text-gray-600">설치된 프린터 ({status.installedPrinters.length})</div>
          <div className="break-all leading-relaxed">{status.installedPrinters.join(", ")}</div>
        </div>
      )}
    </div>
  );
}

function Card({ title, icon: Icon, children, enabled, onToggle }: any) {
  return (
    <div className={`flex flex-col rounded-2xl border ${enabled ? 'border-violet-200 bg-violet-50/10' : 'border-[rgb(var(--kkeut-border))] bg-white'} p-5 shadow-sm transition-all`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${enabled ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-500'}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-gray-900">{title}</div>
            <div className="text-xs text-gray-500">{enabled ? '연동 사용중' : '연동 미사용'}</div>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      <div className={`flex-1 transition-all ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
        {children}
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const { settings, updateSettings } = useSettingsStore();
  const activeBranchId = settings.activeBranchId;
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(activeBranchId);
  if (permLoaded && !permissions["settings.integrations"]) return <NoPermissionOverlay />;
  const activeBranchName = useMemo(() => {
    const hit = (settings.branches || []).find((branch) => String(branch.id) === String(activeBranchId));
    return hit?.name || `지점 ${activeBranchId || "-"}`;
  }, [activeBranchId, settings.branches]);
  const [copiedKey, setCopiedKey] = useState<"" | "kiosk" | "tablet">("");

  const [draft, setDraft] = useState<IntegrationsConfig>({
    crm: { enabled: true },
    nemonic: { enabled: false },
    devices: { markvu: false, metavu: false, evelab: false, janus: false },
    instagram: { enabled: false, accounts: [] },
    wechat: { enabled: false },
    line: { enabled: false },
  });
  const [original, setOriginal] = useState<IntegrationsConfig>(draft);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    async function load() {
      if (!activeBranchId) return;
      try {
        setLoading(true);
        const { externalInterfaceService } = await import("../../services/externalInterfaceService");
        const integrations = await externalInterfaceService.getIntegrations(activeBranchId);
        setDraft(integrations);
        setOriginal(integrations);
      } catch (e) {
        console.error("Failed to load integrations settings", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeBranchId]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(original), [draft, original]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const kioskUrl = `${origin}/kiosk?branchId=${encodeURIComponent(String(activeBranchId || ""))}`;
  const tabletCheckinUrl = `${origin}/tablet-checkin?branchId=${encodeURIComponent(String(activeBranchId || ""))}`;

  const handleCopyUrl = async (key: "kiosk" | "tablet", value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1200);
    } catch {
      alert("URL 복사에 실패했습니다.");
    }
  };

  const save = async () => {
    if (!activeBranchId) return;
    try {
      const { externalInterfaceService } = await import("../../services/externalInterfaceService");
      await externalInterfaceService.saveIntegrations(activeBranchId, draft);
      updateSettings({ integrationsConfig: draft });
      setOriginal(draft);
      alert("저장되었습니다.");
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    }
  };

  const revert = () => {
    if (dirty && confirm("변경사항을 취소하시겠습니까?")) {
      setDraft(original);
    }
  };// Helper to update state safely
  const update = (patch: Partial<IntegrationsConfig>) => setDraft(p => ({ ...p, ...patch }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="설정 > 연동" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <div className="text-lg font-extrabold">외부 연동 설정</div>
            <div className="mt-1 text-sm text-gray-600">
              프린터, 장비, 메신저 등 외부 서비스와의 연동을 관리합니다.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!dirty}>저장</Button>
            <Button variant="outline" onClick={revert} disabled={!dirty}>되돌리기</Button>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-lg bg-[rgba(var(--kkeut-primary),.1)] p-2 text-[rgb(var(--kkeut-primary-strong))]">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <div className="font-extrabold text-gray-900">테블릿 예약/접수 접속 URL</div>
              <div className="text-xs text-gray-500">
                현재 선택 지점: <span className="font-bold text-gray-700">{activeBranchName}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-slate-50/60 p-3">
              <div className="mb-2 text-xs font-bold text-gray-600">태블릿 다음예약 URL</div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-gray-700 break-all">{kioskUrl}</div>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyUrl("kiosk", kioskUrl)}>
                  <Copy className="mr-1 h-4 w-4" />
                  {copiedKey === "kiosk" ? "복사됨" : "복사"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(kioskUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="mr-1 h-4 w-4" />
                  열기
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-[rgb(var(--kkeut-border))] bg-slate-50/60 p-3">
              <div className="mb-2 text-xs font-bold text-gray-600">태블릿 접수 URL</div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-gray-700 break-all">{tabletCheckinUrl}</div>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyUrl("tablet", tabletCheckinUrl)}>
                  <Copy className="mr-1 h-4 w-4" />
                  {copiedKey === "tablet" ? "복사됨" : "복사"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(tabletCheckinUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="mr-1 h-4 w-4" />
                  열기
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            직원 안내용으로 URL 그대로 전달하면 됩니다. 지점별로 `branchId`가 자동 포함됩니다.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* CRM */}
          <Card
            title="CRM / 메시지"
            icon={MessageSquare}
            enabled={draft.crm.enabled}
            onToggle={(v: boolean) => update({ crm: { ...draft.crm, enabled: v } })}
          >
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-bold text-gray-500">발신번호 (Caller ID)</label>
                <Input
                  value={draft.crm.callerId || ""}
                  onChange={e => update({ crm: { ...draft.crm, callerId: e.target.value } })}
                  placeholder="02-0000-0000"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">080 수신거부 번호</label>
                <Input
                  value={draft.crm.tollFree080 || ""}
                  onChange={e => update({ crm: { ...draft.crm, tollFree080: e.target.value } })}
                  placeholder="080-0000-0000"
                />
              </div>

              {/* Solapi 알림톡/SMS 설정 */}
              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="text-xs font-bold text-violet-600 mb-2">📱 Solapi 알림톡/SMS 설정</div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-bold text-gray-500">API Key</label>
                    <Input
                      value={draft.crm.kakao?.apiKey || ""}
                      onChange={e => update({ crm: { ...draft.crm, kakao: { ...(draft.crm.kakao || { provider: 'solapi', apiKey: '', userId: '', senderKey: '', senderPhone: '' }), provider: 'solapi', apiKey: e.target.value } } })}
                      placeholder="Solapi API Key"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">API Secret</label>
                    <Input
                      type="password"
                      value={draft.crm.kakao?.userId || ""}
                      onChange={e => update({ crm: { ...draft.crm, kakao: { ...(draft.crm.kakao || { provider: 'solapi', apiKey: '', userId: '', senderKey: '', senderPhone: '' }), provider: 'solapi', userId: e.target.value } } })}
                      placeholder="Solapi API Secret"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">카카오 채널 ID (pfId)</label>
                    <Input
                      value={draft.crm.kakao?.senderKey || ""}
                      onChange={e => update({ crm: { ...draft.crm, kakao: { ...(draft.crm.kakao || { provider: 'solapi', apiKey: '', userId: '', senderKey: '', senderPhone: '' }), provider: 'solapi', senderKey: e.target.value } } })}
                      placeholder="KA01PF..."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">알림톡 템플릿 ID</label>
                    <Input
                      value={(draft.crm.kakao as any)?.templateId || ""}
                      onChange={e => update({ crm: { ...draft.crm, kakao: { ...(draft.crm.kakao || { provider: 'solapi', apiKey: '', userId: '', senderKey: '', senderPhone: '' }), provider: 'solapi', templateId: e.target.value } as any } })}
                      placeholder="검수 통과 후 발급되는 템플릿 ID (미입력 시 SMS 발송)"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">발신 전화번호</label>
                    <Input
                      value={draft.crm.kakao?.senderPhone || ""}
                      onChange={e => update({ crm: { ...draft.crm, kakao: { ...(draft.crm.kakao || { provider: 'solapi', apiKey: '', userId: '', senderKey: '', senderPhone: '' }), provider: 'solapi', senderPhone: e.target.value } } })}
                      placeholder="02-6959-6080"
                    />
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-gray-400">
                  * solapi.com 가입 후 API Key/Secret 입력. 알림톡은 카카오 채널 연동 + 템플릿 검수 후 사용 가능. 템플릿 미입력 시 SMS로 발송됩니다.
                </div>
              </div>
            </div>
          </Card>

          {/* Chart Printer (BIXOLON + KkeutPrintAgent) */}
          <ReceiptPrinterCard />

          {/* Devices */}
          <div className="flex flex-col rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                <MonitorSmartphone className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-gray-900">피부진단기 연동</div>
            </div>
            <div className="space-y-3">
              {[
                { key: "markvu", label: "Mark-Vu (마크뷰)" },
                { key: "metavu", label: "Meta-Vu (메타뷰)" },
                { key: "evelab", label: "Eve-Lab (이브랩)" },
                { key: "janus", label: "Janus (야누스)" },
              ].map((d) => (
                <div key={d.key} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <span className="text-sm font-medium">{d.label}</span>
                  <Switch
                    checked={(draft.devices as any)[d.key]}
                    onCheckedChange={v => update({ devices: { ...draft.devices, [d.key]: v } })}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Instagram */}
          <Card
            title="Instagram"
            icon={Instagram}
            enabled={draft.instagram.enabled}
            onToggle={(v: boolean) => update({ instagram: { ...draft.instagram, enabled: v } })}
          >
            <div className="pt-2 text-center">
              <div className="text-sm text-gray-600 mb-3">연동된 계정</div>
              {draft.instagram.accounts.length > 0 ? (
                <div className="space-y-2">
                  {draft.instagram.accounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg text-xs">
                      <span className="font-bold">@{acc.name}</span>
                      <button className="text-red-500">삭제</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
                  연동된 계정이 없습니다.
                </div>
              )}
              <Button variant="outline" size="sm" className="mt-3 w-full">
                + 계정 연결 (준비중)
              </Button>
            </div>
          </Card>

          {/* Wechat */}
          <Card
            title="WeChat (위챗)"
            icon={Layers}
            enabled={draft.wechat.enabled}
            onToggle={(v: boolean) => update({ wechat: { ...draft.wechat, enabled: v } })}
          >
            <div className="pt-2">
              <label className="text-xs font-bold text-gray-500">Official Account ID</label>
              <Input
                value={draft.wechat.officialId || ""}
                onChange={e => update({ wechat: { ...draft.wechat, officialId: e.target.value } })}
                placeholder="wx_..."
              />
            </div>
          </Card>

          {/* LINE */}
          <Card
            title="LINE (라인)"
            icon={Layers}
            enabled={draft.line.enabled}
            onToggle={(v: boolean) => update({ line: { ...draft.line, enabled: v } })}
          >
            <div className="pt-2">
              <label className="text-xs font-bold text-gray-500">Channel ID</label>
              <Input
                value={draft.line.officialId || ""}
                onChange={e => update({ line: { ...draft.line, officialId: e.target.value } })}
                placeholder="@..."
              />
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

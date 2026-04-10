import React, { useMemo, useState } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Switch } from "../../components/ui/Switch";
import { useSettingsStore } from "../../stores/useSettingsStore";
import type { IntegrationsConfig } from "../../types/settings";
import { Printer, MessageSquare, Instagram, MonitorSmartphone, Layers, Link2, Copy, ExternalLink } from "lucide-react";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";

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

          {/* Name Printer */}
          <Card
            title="네모닉 프린터"
            icon={Printer}
            enabled={draft.nemonic.enabled}
            onToggle={(v: boolean) => update({ nemonic: { ...draft.nemonic, enabled: v } })}
          >
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-bold text-gray-500">프린터 장치명</label>
                <Input
                  value={draft.nemonic.printerName || ""}
                  onChange={e => update({ nemonic: { ...draft.nemonic, printerName: e.target.value } })}
                  placeholder="Nemonic_Printer_01"
                />
              </div>
              <div className="text-xs text-gray-400">
                * 로컬 네트워크 또는 블루투스로 연결된 프린터 이름을 정확히 입력하세요.
              </div>
            </div>
          </Card>

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

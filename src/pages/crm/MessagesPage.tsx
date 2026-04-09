import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Plus, Search, Trash2, Copy, Edit2, Play, Send, ChevronDown, Check } from "lucide-react";

import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { useCrmMessagesStore } from "../../stores/useCrmMessagesStore";
import { crmCommunicationService, type CommunicationPreferenceRow } from "../../services/crmCommunicationService";
import { crmMessagesConfigService } from "../../services/crmMessagesConfigService";
import { renderTemplate } from "../../utils/renderTemplate";
import { resolveActiveBranchId } from "../../utils/branch";
import type {
    MessageTemplate,
    AutomationRule,
    MessageChannel,
    OutboxItem,
    MessageTemplateStatus,
} from "../../types/crm";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";

type CrmTestPatient = {
    id: string;
    name: string;
    phone: string;
};

const TEMPLATE_VARIABLES = [
    { key: "patientName", label: "환자명", sample: "홍길동" },
    { key: "clinicName", label: "병원명", sample: "끝의원" },
    { key: "date", label: "날짜", sample: "2026-02-25" },
    { key: "time", label: "시간", sample: "14:00" },
    { key: "ticketName", label: "티켓명", sample: "PDL 레이저" },
    { key: "remainCount", label: "잔여횟수", sample: "3" },
] as const;

const TEMPLATE_VARIABLE_KEY_SET = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
const SMS_SOFT_LIMIT = 90;
const SMS_HARD_LIMIT = 2000;

const SAMPLE_TEMPLATE_CONTEXT = TEMPLATE_VARIABLES.reduce<Record<string, string>>((acc, item) => {
    acc[item.key] = item.sample;
    return acc;
}, {});

const QUICK_CONTENT_SNIPPETS = [
    {
        id: "reservation_confirm",
        label: "예약 확정형",
        content: "[{{clinicName}}] {{patientName}}님, {{date}} {{time}} 예약이 확정되었습니다. 변동 시 연락 부탁드립니다.",
    },
    {
        id: "reservation_reminder",
        label: "예약 리마인드형",
        content: "[{{clinicName}}] {{patientName}}님, 내일({{date}}) {{time}} 예약이 있습니다. 늦지 않게 내원해주세요.",
    },
    {
        id: "ticket_used",
        label: "차감 안내형",
        content: "{{patientName}}님, '{{ticketName}}' 1회가 차감되었습니다. 잔여 {{remainCount}}회입니다.",
    },
];

const TEMPLATE_STATUS_LABEL: Record<MessageTemplateStatus, string> = {
    draft: "초안",
    published: "배포",
    archived: "보관",
};

const TEMPLATE_STATUS_STYLE: Record<MessageTemplateStatus, string> = {
    draft: "bg-[#FCEBEF] text-[#E26B7C]",
    published: "bg-emerald-100 text-emerald-700",
    archived: "bg-amber-100 text-amber-700",
};

type Tab = "templates" | "automations" | "outbox" | "optout";

function getTemplateStatus(template: MessageTemplate): MessageTemplateStatus {
    if (template.status) return template.status;
    return template.enabled ? "published" : "draft";
}

function getChannelLabel(channel: MessageChannel) {
    return channel === "kakao" ? "알림톡" : "SMS";
}

function getChannelBadgeClass(channel: MessageChannel) {
    return channel === "kakao" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800";
}

function toDateOnly(iso?: string) {
    if (!iso) return "-";
    return iso.split("T")[0] ?? iso;
}

function normalizePhoneDigits(phone: string) {
    return String(phone || "").replace(/\D/g, "");
}

function formatPhoneNumber(phone: string) {
    const digits = normalizePhoneDigits(phone);
    if (digits.length === 11) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        if (digits.startsWith("02")) {
            return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
        }
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
}

function createMaskedPhone(phone: string) {
    return formatPhoneNumber(phone).replace(/-(\d{3,4})-/, "-****-");
}

function normalizeTemplateContentSyntax(content: string) {
    const markers = new Map<string, string>();
    let markerIndex = 0;

    let normalized = content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
        const marker = `__CRM_VAR_MARKER_${markerIndex++}__`;
        markers.set(marker, `{{${key}}}`);
        return marker;
    });

    normalized = normalized.replace(/\{(\w+)\}/g, (_match, key: string) => `{{${key}}}`);

    markers.forEach((value, marker) => {
        normalized = normalized.split(marker).join(value);
    });

    return normalized;
}

function extractTemplateVariableKeys(content: string) {
    const keys = new Set<string>();
    const matches = content.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
    for (const match of matches) {
        if (match[1]) keys.add(match[1]);
    }
    return Array.from(keys);
}

function extractTemplateVariableTokens(content: string) {
    return extractTemplateVariableKeys(content).map((key) => `{{${key}}}`);
}

function getUnknownVariableKeys(content: string) {
    return extractTemplateVariableKeys(content).filter((key) => !TEMPLATE_VARIABLE_KEY_SET.has(key));
}

function getByteLength(text: string) {
    return new TextEncoder().encode(text).length;
}

type PremiumSelectOption = {
    value: string;
    label: string;
    description?: string;
};

function PremiumSelect({
    value,
    options,
    onChange,
    placeholder = "선택",
    disabled = false,
    className = "",
}: {
    value: string;
    options: PremiumSelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const selected = options.find((option) => option.value === value);

    useEffect(() => {
        const handleMouseDown = (event: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                type="button"
                disabled={disabled}
                className={`flex h-10 w-full items-center justify-between rounded-xl border px-3 text-left text-sm transition ${
                    disabled
                        ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                        : "border-slate-300 bg-white text-slate-700 hover:border-[rgba(var(--kkeut-primary),.45)] hover:bg-[rgba(var(--kkeut-primary),.04)]"
                }`}
                onClick={() => {
                    if (disabled) return;
                    setOpen((prev) => !prev);
                }}
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <span className={`truncate ${selected ? "font-semibold text-slate-700" : "text-slate-400"}`}>
                    {selected?.label ?? placeholder}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && options.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[130] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-1 shadow-[0_18px_36px_-18px_rgba(15,23,42,.35)] backdrop-blur">
                    {options.map((option) => {
                        const isSelected = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                className={`flex w-full items-start justify-between rounded-lg px-3 py-2 text-left transition ${
                                    isSelected
                                        ? "bg-[rgba(var(--kkeut-primary),.13)] font-semibold text-[rgb(var(--kkeut-primary-strong))]"
                                        : "text-slate-700 hover:bg-slate-100/80"
                                }`}
                                onClick={() => {
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm">{option.label}</span>
                                    {option.description && <span className="mt-0.5 block truncate text-[11px] text-slate-500">{option.description}</span>}
                                </span>
                                {isSelected ? <Check className="ml-2 mt-0.5 h-4 w-4 shrink-0" /> : null}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function buildTemplateContext(patient: { name: string }) {
    return {
        ...SAMPLE_TEMPLATE_CONTEXT,
        patientName: patient.name,
    };
}

function createNowIso() {
    return new Date().toISOString();
}

export default function MessagesPage() {
    const { settings } = useSettingsStore();
    const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);
    if (permLoaded && !permissions["crm.message.send"]) return <NoPermissionOverlay />;
    const [activeTab, setActiveTab] = useState<Tab>("templates");
    const branchId = resolveActiveBranchId();
    const {
        templates,
        automations,
        outbox,
        setTemplates,
        setAutomations,
        setOutbox,
        setPatientPref,
    } = useCrmMessagesStore();
    const [testPatients, setTestPatients] = useState<CrmTestPatient[]>([]);
    const [isSyncLoading, setIsSyncLoading] = useState(false);
    const [isSyncSaving, setIsSyncSaving] = useState(false);
    const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
    const [syncReady, setSyncReady] = useState(false);

    useEffect(() => {
        if (!branchId) {
            setSyncErrorMessage("활성 지점 정보를 확인할 수 없습니다.");
            setSyncReady(false);
            return;
        }

        let cancelled = false;
        setIsSyncLoading(true);
        setSyncErrorMessage(null);
        setSyncReady(false);

        const load = async () => {
            try {
                const config = await crmMessagesConfigService.get(branchId);
                if (cancelled) return;

                setTemplates(config.templates);
                setAutomations(config.automations);
                setOutbox(config.outbox);

                try {
                    const prefRows = await crmCommunicationService.getCommunicationPreferences("");
                    if (cancelled) return;
                    const mappedPatients = prefRows.map((row) => ({
                        id: String(row.patientId),
                        name: row.patientName,
                        phone: row.phone || "",
                    }));
                    setTestPatients(mappedPatients);
                    prefRows.forEach((row) => {
                        setPatientPref(String(row.patientId), {
                            patientId: String(row.patientId),
                            optOutAll: row.optOutAll,
                            optOutSms: row.optOutSms,
                            optOutKakao: row.optOutKakao,
                            updatedAt: row.updatedAt,
                        });
                    });
                } catch (prefError: any) {
                    console.error("Failed to load communication preferences for CRM message tests:", prefError);
                    setTestPatients([]);
                }

                setSyncReady(true);
            } catch (error: any) {
                const message =
                    error?.response?.data?.message ||
                    error?.message ||
                    "CRM 메시지 설정을 불러오지 못했습니다.";
                if (!cancelled) {
                    setSyncErrorMessage(String(message));
                    setSyncReady(false);
                }
            } finally {
                if (!cancelled) {
                    setIsSyncLoading(false);
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [branchId, setAutomations, setOutbox, setPatientPref, setTemplates]);

    useEffect(() => {
        if (!branchId || !syncReady) return;

        const timer = setTimeout(() => {
            void (async () => {
                try {
                    setIsSyncSaving(true);
                    await crmMessagesConfigService.update(branchId, {
                        templates,
                        automations,
                        outbox,
                    });
                    setSyncErrorMessage(null);
                } catch (error: any) {
                    const message =
                        error?.response?.data?.message ||
                        error?.message ||
                        "CRM 메시지 설정 저장에 실패했습니다.";
                    setSyncErrorMessage(String(message));
                } finally {
                    setIsSyncSaving(false);
                }
            })();
        }, 350);

        return () => clearTimeout(timer);
    }, [automations, branchId, outbox, syncReady, templates]);

    return (
        <div className="flex h-full flex-col bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
            <TopBar title="CRM > 메시지" />

            <div className="border-b border-gray-200 px-4 md:px-6">
                <div className="no-scrollbar flex gap-4 overflow-x-auto md:gap-6">
                    {(["templates", "automations", "outbox", "optout"] as Tab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`whitespace-nowrap border-b-2 py-4 text-sm font-bold transition-colors ${activeTab === tab
                                ? "border-violet-600 text-violet-600"
                                : "border-transparent text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            {tab === "templates" && "템플릿 관리"}
                            {tab === "automations" && "자동발송 설정"}
                            {tab === "outbox" && "발송 내역"}
                            {tab === "optout" && "수신거부 관리"}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-hidden bg-[#FAF3F5] p-4 md:p-6">
                <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
                    {isSyncLoading && <span className="rounded-full bg-slate-100 px-2 py-1">동기화 중...</span>}
                    {isSyncSaving && !isSyncLoading && <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">저장 중...</span>}
                    {syncErrorMessage && <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700">{syncErrorMessage}</span>}
                </div>
                {activeTab === "templates" && <TemplatesTab testPatients={testPatients} />}
                {activeTab === "automations" && <AutomationsTab testPatients={testPatients} />}
                {activeTab === "outbox" && <OutboxTab />}
                {activeTab === "optout" && <OptOutTab />}
            </div>
        </div>
    );
}

function TemplatesTab({ testPatients }: { testPatients: CrmTestPatient[] }) {
    const { templates, addTemplate, updateTemplate, deleteTemplate } = useCrmMessagesStore();
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);

    const filtered = templates.filter((t) => {
        const keyword = search.trim();
        if (!keyword) return true;
        const status = getTemplateStatus(t);
        return (
            t.name.includes(keyword) ||
            t.category.includes(keyword) ||
            t.content.includes(keyword) ||
            TEMPLATE_STATUS_LABEL[status].includes(keyword)
        );
    });

    const handleCreate = () => {
        const newItem: MessageTemplate = {
            id: `tmpl_${Date.now()}`,
            name: "새 템플릿",
            channel: "kakao",
            category: "기타",
            enabled: false,
            content: "",
            variables: [],
            updatedAt: createNowIso(),
            status: "draft",
            version: 0,
        };
        addTemplate(newItem);
        setEditingId(newItem.id);
    };

    const handleCopy = (template: MessageTemplate) => {
        const copied: MessageTemplate = {
            ...template,
            id: `tmpl_${Date.now()}`,
            name: `${template.name} (복사본)`,
            enabled: false,
            status: "draft",
            version: 0,
            publishedAt: undefined,
            updatedAt: createNowIso(),
        };
        addTemplate(copied);
    };

    const handleToggleEnabled = (template: MessageTemplate, enabled: boolean) => {
        const currentStatus = getTemplateStatus(template);
        if (enabled) {
            updateTemplate(template.id, {
                enabled: true,
                status: "published",
                version: Math.max(1, template.version ?? 0),
                publishedAt: template.publishedAt || createNowIso(),
            });
            return;
        }

        updateTemplate(template.id, {
            enabled: false,
            status: currentStatus === "published" ? "draft" : currentStatus,
        });
    };

    return (
        <div className="flex h-full flex-col gap-4">
            <div className="flex justify-between rounded-xl border border-[#F8DCE2] bg-white p-4" style={{ boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)" }}>
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input className="pl-9" placeholder="템플릿 검색..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Button variant="primary" onClick={handleCreate}>
                    <Plus className="h-4 w-4" /> 새 템플릿
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-[#F8DCE2] bg-white p-0 md:p-0">
                <table className="hidden w-full text-left text-sm md:table">
                    <thead className="bg-[#FCF7F8] text-[#5C2A35]">
                        <tr>
                            <th className="px-6 py-3 font-medium">이름</th>
                            <th className="px-6 py-3 font-medium">채널</th>
                            <th className="px-6 py-3 font-medium">카테고리</th>
                            <th className="px-6 py-3 font-medium">내용(미리보기)</th>
                            <th className="px-6 py-3 font-medium">상태/버전</th>
                            <th className="px-6 py-3 font-medium">사용</th>
                            <th className="px-6 py-3 text-right font-medium">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filtered.map((template) => {
                            const status = getTemplateStatus(template);
                            return (
                                <tr key={template.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-bold text-gray-800">{template.name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`rounded px-2 py-1 text-xs font-bold ${getChannelBadgeClass(template.channel)}`}>
                                            {getChannelLabel(template.channel)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{template.category}</td>
                                    <td className="max-w-xs truncate px-6 py-4 text-gray-500">{template.content}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TEMPLATE_STATUS_STYLE[status]}`}>
                                                {TEMPLATE_STATUS_LABEL[status]}
                                            </span>
                                            <span className="text-xs text-gray-400">v{template.version ?? 0}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <Switch checked={template.enabled} onCheckedChange={(v) => handleToggleEnabled(template, v)} />
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => handleCopy(template)} className="p-1 text-gray-400 hover:text-blue-600">
                                                <Copy className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => setEditingId(template.id)} className="p-1 text-gray-400 hover:text-blue-600">
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => deleteTemplate(template.id)} className="p-1 text-gray-400 hover:text-red-600">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="divide-y divide-gray-100 md:hidden">
                    {filtered.map((template) => {
                        const status = getTemplateStatus(template);
                        return (
                            <div key={template.id} className="flex flex-col gap-3 p-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h4 className="font-bold text-gray-900">{template.name}</h4>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${getChannelBadgeClass(template.channel)}`}>
                                                {getChannelLabel(template.channel)}
                                            </span>
                                            <span className="text-xs text-gray-500">{template.category}</span>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TEMPLATE_STATUS_STYLE[status]}`}>
                                                {TEMPLATE_STATUS_LABEL[status]} v{template.version ?? 0}
                                            </span>
                                        </div>
                                    </div>
                                    <Switch checked={template.enabled} onCheckedChange={(v) => handleToggleEnabled(template, v)} />
                                </div>

                                <div className="line-clamp-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-600">{template.content}</div>

                                <div className="mt-1 flex justify-end gap-4 border-t border-gray-50 pt-1">
                                    <button onClick={() => handleCopy(template)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
                                        <Copy className="h-3 w-3" /> 복사
                                    </button>
                                    <button onClick={() => setEditingId(template.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
                                        <Edit2 className="h-3 w-3" /> 수정
                                    </button>
                                    <button onClick={() => deleteTemplate(template.id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                                        <Trash2 className="h-3 w-3" /> 삭제
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {editingId && <TemplateEditModal templateId={editingId} testPatients={testPatients} onClose={() => setEditingId(null)} />}
        </div>
    );
}

function TemplateEditModal({ templateId, testPatients, onClose }: { templateId: string; testPatients: CrmTestPatient[]; onClose: () => void }) {
    const { templates, updateTemplate, addOutboxItem, patientCommPrefs } = useCrmMessagesStore();
    const template = templates.find((item) => item.id === templateId);
    const [data, setData] = useState<MessageTemplate | undefined>(template);
    const [testPhoneInput, setTestPhoneInput] = useState<string>("");
    const contentInputRef = useRef<HTMLTextAreaElement | null>(null);

    if (!data) return null;

    const normalizedContent = useMemo(() => normalizeTemplateContentSyntax(data.content), [data.content]);
    const variableTokens = useMemo(() => extractTemplateVariableTokens(normalizedContent), [normalizedContent]);
    const unknownVariableKeys = useMemo(() => getUnknownVariableKeys(normalizedContent), [normalizedContent]);
    const previewContent = useMemo(() => renderTemplate(normalizedContent, SAMPLE_TEMPLATE_CONTEXT), [normalizedContent]);
    const smsByteLength = useMemo(() => getByteLength(normalizedContent), [normalizedContent]);
    const contentLineCount = useMemo(() => Math.max(1, normalizedContent.split(/\r?\n/).length), [normalizedContent]);

    const status = getTemplateStatus(data);
    const channelOptions: PremiumSelectOption[] = useMemo(
        () => [
            { value: "kakao", label: "알림톡", description: "카카오 채널 발송" },
            { value: "sms", label: "SMS/LMS", description: "문자/장문 발송" },
        ],
        []
    );
    const normalizedTestPhone = useMemo(() => normalizePhoneDigits(testPhoneInput), [testPhoneInput]);
    const matchedTestPatient = useMemo(
        () => testPatients.find((patient) => normalizePhoneDigits(patient.phone) === normalizedTestPhone),
        [normalizedTestPhone, testPatients]
    );

    const errors = useMemo(() => {
        const result: string[] = [];
        if (!data.name.trim()) result.push("템플릿 이름은 필수입니다.");
        if ((status === "published" || data.enabled) && !normalizedContent.trim()) {
            result.push("배포/사용 상태 템플릿은 본문이 비어 있을 수 없습니다.");
        }
        if (unknownVariableKeys.length > 0) {
            result.push(`알 수 없는 변수: ${unknownVariableKeys.join(", ")}`);
        }
        if (data.channel === "sms" && smsByteLength > SMS_HARD_LIMIT) {
            result.push(`SMS/LMS 최대 ${SMS_HARD_LIMIT}byte를 초과했습니다.`);
        }
        return result;
    }, [data, normalizedContent, smsByteLength, status, unknownVariableKeys]);

    const warnings = useMemo(() => {
        const result: string[] = [];
        if (data.channel === "sms" && smsByteLength > SMS_SOFT_LIMIT) {
            result.push(`현재 ${smsByteLength}byte로 SMS(90byte)를 초과했습니다. LMS로 발송됩니다.`);
        }
        return result;
    }, [data.channel, smsByteLength]);

    const insertAtCursor = useCallback(
        (snippet: string, options?: { withSpace?: boolean }) => {
            const input = contentInputRef.current;
            const currentContent = data.content || "";

            if (!input) {
                const spacer = options?.withSpace && currentContent && !/\s$/.test(currentContent) ? " " : "";
                setData({ ...data, content: `${currentContent}${spacer}${snippet}` });
                return;
            }

            const start = input.selectionStart ?? currentContent.length;
            const end = input.selectionEnd ?? currentContent.length;
            const before = currentContent.slice(0, start);
            const after = currentContent.slice(end);
            const prependSpace = options?.withSpace && before && !/\s$/.test(before);
            const appendSpace = options?.withSpace && after && !/^\s/.test(after);
            const inserted = `${prependSpace ? " " : ""}${snippet}${appendSpace ? " " : ""}`;
            const nextContent = `${before}${inserted}${after}`;
            const caret = before.length + inserted.length;

            setData({ ...data, content: nextContent });
            requestAnimationFrame(() => {
                input.focus();
                input.setSelectionRange(caret, caret);
            });
        },
        [data]
    );

    const insertVariable = (key: string) => {
        insertAtCursor(`{{${key}}}`, { withSpace: true });
    };

    const insertSnippet = (snippet: string) => {
        const prefix = data.content.trim().length > 0 ? "\n" : "";
        insertAtCursor(`${prefix}${snippet}`);
    };

    const handlePublish = () => {
        setData({
            ...data,
            status: "published",
            enabled: true,
            version: Math.max(1, (data.version ?? 0) + 1),
            publishedAt: createNowIso(),
        });
    };

    const handleSave = () => {
        if (errors.length > 0) {
            alert(`저장할 수 없습니다.\n${errors.map((error) => `- ${error}`).join("\n")}`);
            return;
        }

        let nextStatus = getTemplateStatus(data);
        let nextEnabled = data.enabled;
        let nextVersion = data.version ?? 0;
        let nextPublishedAt = data.publishedAt;

        if (nextStatus === "archived") nextEnabled = false;
        if (nextEnabled && nextStatus !== "published") nextStatus = "published";
        if (!nextEnabled && nextStatus === "published") nextStatus = "draft";
        if (nextStatus === "published") {
            nextVersion = Math.max(1, nextVersion);
            nextPublishedAt = nextPublishedAt || createNowIso();
        }

        updateTemplate(templateId, {
            ...data,
            category: (data.category ?? "").trim() || "기타",
            content: normalizedContent,
            variables: variableTokens,
            status: nextStatus,
            enabled: nextEnabled,
            version: nextVersion,
            publishedAt: nextPublishedAt,
        });
        onClose();
    };

    const handleTestSend = () => {
        if (!normalizedTestPhone) {
            alert("테스트 수신 번호를 입력해주세요.");
            return;
        }

        if (errors.length > 0) {
            alert("먼저 템플릿 오류를 수정해주세요.");
            return;
        }

        const patient = matchedTestPatient;
        const pref = patient ? patientCommPrefs[patient.id] : undefined;
        const isOptOut = pref && (pref.optOutAll || (data.channel === "sms" ? pref.optOutSms : pref.optOutKakao));
        const contentRendered = renderTemplate(
            normalizedContent,
            buildTemplateContext({
                name: patient?.name || "테스트 환자",
            })
        );
        const targetPhone = formatPhoneNumber(normalizedTestPhone);

        const outboxItem: OutboxItem = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            createdAt: createNowIso(),
            channel: data.channel,
            status: isOptOut ? "skipped" : "queued",
            reason: isOptOut ? "optout" : undefined,
            patientId: patient ? String(patient.id) : `manual_${normalizedTestPhone}`,
            patientName: patient?.name || "수동 입력",
            phoneMasked: createMaskedPhone(targetPhone),
            templateId: data.id,
            templateName: data.name,
            contentRendered,
        };

        addOutboxItem(outboxItem);
        alert(
            isOptOut
                ? "수신거부 상태로 스킵 항목이 발송 내역에 생성되었습니다."
                : patient
                    ? "테스트 발송 항목이 발송 내역에 생성되었습니다."
                    : "등록 환자 매칭 없이 테스트 발송 항목이 생성되었습니다."
        );
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
            <div className="mx-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-[#F8DCE2] bg-[#FCF7F8] px-6 py-4">
                    <div>
                        <h3 className="text-lg font-bold">템플릿 편집</h3>
                        <div className="mt-1 flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TEMPLATE_STATUS_STYLE[status]}`}>
                                {TEMPLATE_STATUS_LABEL[status]}
                            </span>
                            <span className="text-xs text-gray-400">v{data.version ?? 0}</span>
                            <span className="text-xs text-gray-400">최근 배포: {toDateOnly(data.publishedAt)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handlePublish}>
                            배포(v+1)
                        </Button>
                        <Button variant="outline" onClick={onClose}>
                            취소
                        </Button>
                        <Button variant="primary" onClick={handleSave}>
                            저장
                        </Button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[420px_1fr]">
                    <div className="border-b border-gray-200 bg-gray-50 p-5 md:border-b-0 md:border-r">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="mb-1 block text-xs font-bold text-gray-500">템플릿 명</label>
                                <Input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-gray-500">채널</label>
                                <PremiumSelect
                                    value={data.channel}
                                    options={channelOptions}
                                    onChange={(value) => setData({ ...data, channel: value as MessageChannel })}
                                />
                            </div>
                            <div className="col-span-2 flex items-center gap-2 pt-1">
                                <Switch
                                    checked={data.enabled}
                                    onCheckedChange={(enabled) => {
                                        if (enabled) {
                                            setData({ ...data, enabled: true, status: "published", version: Math.max(1, data.version ?? 0) });
                                            return;
                                        }
                                        setData({ ...data, enabled: false, status: status === "published" ? "draft" : status });
                                    }}
                                />
                                <span className="pb-1 text-sm font-bold text-gray-700">사용 여부</span>
                            </div>
                        </div>

                        <div className="mt-5 rounded-xl border border-[#F8DCE2] bg-white p-4">
                            <div className="text-sm font-bold text-gray-800">변수 삽입</div>
                            <div className="mt-1 text-xs text-gray-500">문법은 <code>{"{{key}}"}</code>를 사용합니다.</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {TEMPLATE_VARIABLES.map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => insertVariable(item.key)}
                                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                        type="button"
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 rounded-xl border border-[#F8DCE2] bg-white p-4">
                            <div className="text-sm font-bold text-gray-800">채널 검증</div>
                            <div className="mt-2 text-xs text-gray-500">
                                SMS/LMS 길이: <span className="font-bold text-gray-700">{smsByteLength} byte</span>
                            </div>
                            {warnings.length > 0 && (
                                <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                                    {warnings.map((warning) => (
                                        <div key={warning}>- {warning}</div>
                                    ))}
                                </div>
                            )}
                            {errors.length > 0 && (
                                <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                                    {errors.map((error) => (
                                        <div key={error}>- {error}</div>
                                    ))}
                                </div>
                            )}
                            {errors.length === 0 && warnings.length === 0 && <div className="mt-2 text-xs text-emerald-700">검증 통과</div>}
                        </div>

                        <div className="mt-5 rounded-xl border border-[#F8DCE2] bg-white p-4">
                            <div className="text-sm font-bold text-gray-800">테스트 발송</div>
                            <div className="mt-2 flex items-center gap-2">
                                <Input
                                    className="h-10"
                                    value={testPhoneInput}
                                    onChange={(e) => setTestPhoneInput(e.target.value)}
                                    placeholder="테스트 수신 번호 입력 (예: 010-1234-5678)"
                                />
                                <Button variant="outline" size="sm" onClick={handleTestSend} disabled={!normalizedTestPhone}>
                                    <Send className="mr-1 h-3 w-3" /> 테스트
                                </Button>
                            </div>
                            <div className="mt-2 text-xs text-gray-500">
                                {normalizedTestPhone.length === 0 && "번호를 입력하면 등록 환자와 자동 매칭합니다."}
                                {normalizedTestPhone.length > 0 && matchedTestPatient && (
                                    <span>
                                        매칭 환자: <span className="font-semibold text-gray-700">{matchedTestPatient.name}</span> ({formatPhoneNumber(matchedTestPatient.phone)})
                                        · 수신거부 환자는 자동으로 `skipped` 상태로 기록됩니다.
                                    </span>
                                )}
                                {normalizedTestPhone.length > 0 && !matchedTestPatient && "등록 환자와 일치하지 않아 수신거부 체크 없이 테스트 기록만 생성됩니다."}
                            </div>
                        </div>
                    </div>

                    <div className="p-5">
                        <label className="mb-2 block text-xs font-bold text-gray-500">내용</label>
                        <div className="rounded-xl border border-gray-200 bg-white">
                            <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => insertAtCursor("\n")}
                                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                                    >
                                        줄바꿈
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => insertAtCursor("- ")}
                                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                                    >
                                        리스트
                                    </button>
                                    {TEMPLATE_VARIABLES.map((item) => (
                                        <button
                                            key={`inline-var-${item.key}`}
                                            type="button"
                                            onClick={() => insertVariable(item.key)}
                                            className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-semibold text-gray-500">빠른 문구</span>
                                    {QUICK_CONTENT_SNIPPETS.map((snippet) => (
                                        <button
                                            key={snippet.id}
                                            type="button"
                                            onClick={() => insertSnippet(snippet.content)}
                                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                        >
                                            {snippet.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <textarea
                                ref={contentInputRef}
                                className="h-[34vh] min-h-[240px] w-full resize-y border-0 p-3 text-sm leading-6 outline-none focus:ring-0"
                                value={data.content}
                                onChange={(e) => setData({ ...data, content: e.target.value })}
                                placeholder="메시지 내용을 입력하세요..."
                            />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span>변수 감지: {variableTokens.length > 0 ? variableTokens.join(", ") : "없음"}</span>
                            <span>줄 수: {contentLineCount}</span>
                            <span>바이트: {smsByteLength}</span>
                        </div>

                        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <div className="mb-2 text-sm font-bold text-gray-800">실시간 미리보기</div>
                            <div className="max-h-[280px] min-h-[180px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                                {previewContent || <span className="text-gray-400">미리보기 내용이 없습니다.</span>}
                            </div>
                            <div className="mt-2 text-xs text-gray-500">
                                미리보기 샘플값: {TEMPLATE_VARIABLES.map((item) => `${item.key}=${item.sample}`).join(", ")}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AutomationsTab({ testPatients }: { testPatients: CrmTestPatient[] }) {
    const { automations, addAutomation, updateAutomation, deleteAutomation, templates, addOutboxItem, patientCommPrefs } = useCrmMessagesStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const availableTemplates = useMemo(
        () => templates.filter((t) => t.enabled && getTemplateStatus(t) === "published"),
        [templates]
    );

    const handleCreate = () => {
        const newItem: AutomationRule = {
            id: `auto_${Date.now()}`,
            name: "새 자동발송",
            enabled: true,
            trigger: "manual",
            schedule: { type: "immediate" },
            templateId: availableTemplates[0]?.id || templates[0]?.id || "",
            filters: { branchScope: "all", excludeOptOut: true },
        };
        addAutomation(newItem);
        setEditingId(newItem.id);
    };

    const handleSimulate = (rule: AutomationRule) => {
        const template = templates.find((t) => t.id === rule.templateId);
        if (!template) {
            alert("템플릿이 존재하지 않습니다.");
            return;
        }
        if (!template.enabled || getTemplateStatus(template) !== "published") {
            alert("배포 + 사용 상태 템플릿만 테스트 발송할 수 있습니다.");
            return;
        }
        if (testPatients.length === 0) {
            alert("테스트 대상 환자가 없습니다.");
            return;
        }

        let count = 0;
        testPatients.forEach((patient) => {
            const pref = patientCommPrefs[String(patient.id)];
            const isOptOut = pref && (pref.optOutAll || (template.channel === "sms" ? pref.optOutSms : pref.optOutKakao));
            const content = renderTemplate(template.content, buildTemplateContext(patient));

            const outboxItem: OutboxItem = {
                id: `msg_${Date.now()}_${patient.id}_${Math.random().toString(36).slice(2, 7)}`,
                createdAt: createNowIso(),
                channel: template.channel,
                status: isOptOut ? "skipped" : "queued",
                reason: isOptOut ? "optout" : undefined,
                patientId: String(patient.id),
                patientName: patient.name,
                phoneMasked: createMaskedPhone(patient.phone),
                templateId: template.id,
                templateName: template.name,
                contentRendered: content,
            };
            addOutboxItem(outboxItem);
            count++;
        });

        alert(`${count}건의 테스트 메시지가 발송 내역에 생성되었습니다.`);
    };

    return (
        <div className="flex h-full flex-col gap-4">
            <div className="rounded-xl border border-[#F8DCE2] bg-white p-4">
                <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                        자동발송 규칙은 <span className="font-bold text-gray-700">배포 + 사용</span> 템플릿만 연결하는 것을 권장합니다.
                    </div>
                    <Button variant="primary" onClick={handleCreate}>
                        + 새 규칙
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-[#F8DCE2] bg-white p-0 md:p-0">
                <table className="hidden w-full text-left text-sm md:table">
                    <thead className="bg-[#FCF7F8] text-[#5C2A35]">
                        <tr>
                            <th className="px-6 py-3 font-medium">규칙명</th>
                            <th className="px-6 py-3 font-medium">트리거</th>
                            <th className="px-6 py-3 font-medium">발송시점</th>
                            <th className="px-6 py-3 font-medium">템플릿</th>
                            <th className="px-6 py-3 font-medium">상태</th>
                            <th className="px-6 py-3 text-right font-medium">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {automations.map((automation) => (
                            <tr key={automation.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-bold">{automation.name}</td>
                                <td className="px-6 py-4 text-blue-600">{automation.trigger}</td>
                                <td className="px-6 py-4">
                                    {automation.schedule.type === "immediate"
                                        ? "즉시"
                                        : `${automation.schedule.type === "before" ? "전" : "후"} ${automation.schedule.days || 0}일 ${automation.schedule.hours || 0}시간`}
                                </td>
                                <td className="px-6 py-4 text-gray-600">{templates.find((t) => t.id === automation.templateId)?.name || "삭제됨"}</td>
                                <td className="px-6 py-4">
                                    <Switch checked={automation.enabled} onCheckedChange={(v) => updateAutomation(automation.id, { enabled: v })} />
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => handleSimulate(automation)}>
                                            <Play className="mr-1 h-3 w-3" /> 테스트
                                        </Button>
                                        <button onClick={() => setEditingId(automation.id)} className="p-1 text-gray-400 hover:text-blue-600">
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => deleteAutomation(automation.id)} className="p-1 text-gray-400 hover:text-red-600">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="divide-y divide-gray-100 md:hidden">
                    {automations.map((automation) => (
                        <div key={automation.id} className="flex flex-col gap-3 p-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h4 className="font-bold text-gray-900">{automation.name}</h4>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600">{automation.trigger}</span>
                                        <span className="text-xs text-gray-500">
                                            {automation.schedule.type === "immediate"
                                                ? "즉시"
                                                : `${automation.schedule.days || 0}일 ${automation.schedule.hours || 0}시간 ${automation.schedule.type === "before" ? "전" : "후"}`}
                                        </span>
                                    </div>
                                </div>
                                <Switch checked={automation.enabled} onCheckedChange={(v) => updateAutomation(automation.id, { enabled: v })} />
                            </div>

                            <div className="text-sm text-gray-600">
                                <span className="mr-2 text-xs text-gray-400">템플릿:</span>
                                {templates.find((t) => t.id === automation.templateId)?.name || "삭제됨"}
                            </div>

                            <div className="mt-1 flex justify-end gap-4 border-t border-gray-50 pt-1">
                                <button onClick={() => handleSimulate(automation)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
                                    <Play className="h-3 w-3" /> 테스트
                                </button>
                                <button onClick={() => setEditingId(automation.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
                                    <Edit2 className="h-3 w-3" /> 수정
                                </button>
                                <button onClick={() => deleteAutomation(automation.id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                                    <Trash2 className="h-3 w-3" /> 삭제
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {editingId && <AutomationEditModal id={editingId} onClose={() => setEditingId(null)} />}
        </div>
    );
}

function AutomationEditModal({ id, onClose }: { id: string; onClose: () => void }) {
    const { automations, updateAutomation, templates } = useCrmMessagesStore();
    const [data, setData] = useState(automations.find((item) => item.id === id));

    if (!data) return null;

    const templateOptions = templates.filter(
        (template) => template.id === data.templateId || (template.enabled && getTemplateStatus(template) === "published")
    );

    const handleSave = () => {
        updateAutomation(id, data);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="mb-4 text-lg font-bold">자동발송 규칙 편집</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500">규칙명</label>
                        <Input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500">트리거</label>
                            <Select value={data.trigger} onChange={(e) => setData({ ...data, trigger: e.target.value as AutomationRule["trigger"] })}>
                                <option value="reservationCreated">예약 생성 시</option>
                                <option value="reservationReminder">예약 리마인드</option>
                                <option value="visitCompleted">내원(수납) 완료</option>
                                <option value="ticketUsed">티켓 소진 시</option>
                                <option value="manual">수동 실행</option>
                            </Select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500">템플릿</label>
                            <Select value={data.templateId} onChange={(e) => setData({ ...data, templateId: e.target.value })}>
                                {templateOptions.map((template) => (
                                    <option key={template.id} value={template.id}>
                                        {template.name}
                                    </option>
                                ))}
                            </Select>
                            {templateOptions.length === 0 && <div className="mt-1 text-xs text-red-500">사용 가능한 배포 템플릿이 없습니다.</div>}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 items-end gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500">시점 타입</label>
                            <Select
                                value={data.schedule.type}
                                onChange={(e) =>
                                    setData({
                                        ...data,
                                        schedule: { ...data.schedule, type: e.target.value as AutomationRule["schedule"]["type"] },
                                    })
                                }
                            >
                                <option value="immediate">즉시</option>
                                <option value="before">기준시간 전</option>
                                <option value="after">기준시간 후</option>
                            </Select>
                        </div>
                        {data.schedule.type !== "immediate" && (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500">일(Days)</label>
                                    <Input
                                        type="number"
                                        value={data.schedule.days || 0}
                                        onChange={(e) => setData({ ...data, schedule: { ...data.schedule, days: Number(e.target.value) } })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500">시간(Hours)</label>
                                    <Input
                                        type="number"
                                        value={data.schedule.hours || 0}
                                        onChange={(e) => setData({ ...data, schedule: { ...data.schedule, hours: Number(e.target.value) } })}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center gap-2">
                            <Switch checked={data.filters.excludeOptOut} onCheckedChange={(v) => setData({ ...data, filters: { ...data.filters, excludeOptOut: v } })} />
                            <span className="text-sm">수신거부 환자 제외 (권장)</span>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                        취소
                    </Button>
                    <Button variant="primary" onClick={handleSave}>
                        저장
                    </Button>
                </div>
            </div>
        </div>
    );
}

function OutboxTab() {
    const { outbox, updateOutboxItem } = useCrmMessagesStore();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<OutboxItem["status"] | "all">("all");
    const [channelFilter, setChannelFilter] = useState<MessageChannel | "all">("all");

    const filtered = useMemo(() => {
        const keyword = search.trim();
        return [...outbox]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .filter((item) => {
                if (statusFilter !== "all" && item.status !== statusFilter) return false;
                if (channelFilter !== "all" && item.channel !== channelFilter) return false;
                if (!keyword) return true;
                return (
                    item.patientName.includes(keyword) ||
                    item.templateName.includes(keyword) ||
                    item.contentRendered.includes(keyword)
                );
            });
    }, [channelFilter, outbox, search, statusFilter]);

    const counts = useMemo(() => {
        const summary: Record<OutboxItem["status"], number> = {
            queued: 0,
            sent: 0,
            failed: 0,
            skipped: 0,
        };
        outbox.forEach((item) => {
            summary[item.status] += 1;
        });
        return summary;
    }, [outbox]);

    const statusLabel: Record<OutboxItem["status"], string> = {
        queued: "대기",
        sent: "발송완료",
        failed: "실패",
        skipped: "제외",
    };

    const statusClass: Record<OutboxItem["status"], string> = {
        queued: "bg-slate-100 text-slate-700",
        sent: "bg-emerald-100 text-emerald-700",
        failed: "bg-rose-100 text-rose-700",
        skipped: "bg-amber-100 text-amber-700",
    };

    const retryFailed = (id: string) => {
        updateOutboxItem(id, { status: "queued", reason: undefined });
    };

    const retryAllFailed = () => {
        outbox.filter((item) => item.status === "failed").forEach((item) => retryFailed(item.id));
    };

    return (
        <div className="flex h-full flex-col gap-4">
            <div className="rounded-xl border border-[#F8DCE2] bg-white p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input
                            className="pl-9"
                            placeholder="환자명/템플릿/내용 검색"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as MessageChannel | "all")}>
                        <option value="all">전체 채널</option>
                        <option value="kakao">알림톡</option>
                        <option value="sms">SMS</option>
                    </Select>
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OutboxItem["status"] | "all")}>
                        <option value="all">전체 상태</option>
                        <option value="queued">대기</option>
                        <option value="sent">발송완료</option>
                        <option value="failed">실패</option>
                        <option value="skipped">제외</option>
                    </Select>
                    <Button variant="outline" onClick={retryAllFailed}>
                        실패건 재시도
                    </Button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4 md:gap-3 md:text-sm">
                    <div className="rounded-lg bg-gray-50 px-3 py-2">대기 {counts.queued}건</div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">완료 {counts.sent}건</div>
                    <div className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">실패 {counts.failed}건</div>
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">제외 {counts.skipped}건</div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="hidden w-full text-left text-sm md:table">
                    <thead className="bg-[#FCF7F8] text-[#5C2A35]">
                        <tr>
                            <th className="px-6 py-3 font-medium">일시</th>
                            <th className="px-6 py-3 font-medium">환자</th>
                            <th className="px-6 py-3 font-medium">채널</th>
                            <th className="px-6 py-3 font-medium">템플릿</th>
                            <th className="px-6 py-3 font-medium">발송 내용</th>
                            <th className="px-6 py-3 font-medium">상태</th>
                            <th className="px-6 py-3 font-medium">사유</th>
                            <th className="px-6 py-3 text-right font-medium">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filtered.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="whitespace-nowrap px-6 py-4 text-gray-500">{format(new Date(item.createdAt), "yyyy.MM.dd HH:mm")}</td>
                                <td className="px-6 py-4">
                                    <div className="font-semibold text-gray-800">{item.patientName}</div>
                                    <div className="text-xs text-gray-500">{item.phoneMasked}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`rounded px-2 py-1 text-xs font-bold ${getChannelBadgeClass(item.channel)}`}>
                                        {getChannelLabel(item.channel)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-700">{item.templateName}</td>
                                <td className="max-w-sm truncate px-6 py-4 text-gray-500">{item.contentRendered}</td>
                                <td className="px-6 py-4">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusClass[item.status]}`}>
                                        {statusLabel[item.status]}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-xs text-gray-500">{item.reason || "-"}</td>
                                <td className="px-6 py-4 text-right">
                                    {item.status === "failed" && (
                                        <Button variant="outline" size="sm" onClick={() => retryFailed(item.id)}>
                                            재시도
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="divide-y divide-gray-100 md:hidden">
                    {filtered.map((item) => (
                        <div key={item.id} className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="text-sm font-bold text-gray-900">{item.patientName}</div>
                                    <div className="text-xs text-gray-500">{item.phoneMasked}</div>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass[item.status]}`}>
                                    {statusLabel[item.status]}
                                </span>
                            </div>
                            <div className="mt-2 text-xs text-gray-500">{format(new Date(item.createdAt), "yyyy.MM.dd HH:mm")}</div>
                            <div className="mt-2 flex items-center gap-2">
                                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${getChannelBadgeClass(item.channel)}`}>
                                    {getChannelLabel(item.channel)}
                                </span>
                                <span className="text-xs text-gray-600">{item.templateName}</span>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">{item.contentRendered}</div>
                            {item.reason && <div className="mt-2 text-xs text-amber-700">사유: {item.reason}</div>}
                            {item.status === "failed" && (
                                <div className="mt-3 flex justify-end">
                                    <Button variant="outline" size="sm" onClick={() => retryFailed(item.id)}>
                                        재시도
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {filtered.length === 0 && (
                    <div className="flex h-48 items-center justify-center text-sm text-gray-500">조건에 맞는 발송 내역이 없습니다.</div>
                )}
            </div>
        </div>
    );
}

function OptOutTab() {
    const { setPatientPref } = useCrmMessagesStore();
    const [search, setSearch] = useState("");
    const [rows, setRows] = useState<CommunicationPreferenceRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [savingByPatient, setSavingByPatient] = useState<Record<number, boolean>>({});

    const setSavingState = useCallback((patientId: number, isSaving: boolean) => {
        setSavingByPatient((prev) => {
            const next = { ...prev };
            if (isSaving) next[patientId] = true;
            else delete next[patientId];
            return next;
        });
    }, [setPatientPref]);

    const loadRows = useCallback(async (keyword: string) => {
        setIsLoading(true);
        setErrorMessage(null);
        try {
            const data = await crmCommunicationService.getCommunicationPreferences(keyword);
            setRows(data);
            data.forEach((row) => {
                setPatientPref(String(row.patientId), {
                    patientId: String(row.patientId),
                    optOutAll: row.optOutAll,
                    optOutSms: row.optOutSms,
                    optOutKakao: row.optOutKakao,
                    updatedAt: row.updatedAt,
                });
            });
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                error?.message ||
                "수신거부 목록을 불러오지 못했습니다.";
            setRows([]);
            setErrorMessage(String(message));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            void loadRows(search);
        }, 250);
        return () => clearTimeout(timer);
    }, [loadRows, search]);

    const summary = useMemo(() => {
        let all = 0;
        let sms = 0;
        let kakao = 0;
        rows.forEach((row) => {
            if (row.optOutAll) all += 1;
            if (row.optOutSms) sms += 1;
            if (row.optOutKakao) kakao += 1;
        });
        return { all, sms, kakao };
    }, [rows]);

    const updatePreference = useCallback(async (
        patientId: number,
        patch: Partial<Pick<CommunicationPreferenceRow, "optOutAll" | "optOutSms" | "optOutKakao">>
    ) => {
        if (savingByPatient[patientId]) return;

        setSavingState(patientId, true);
        setErrorMessage(null);
        try {
            const updated = await crmCommunicationService.updateCommunicationPreference(patientId, patch);
            setRows((prev) => prev.map((row) => (row.patientId === patientId ? updated : row)));
            setPatientPref(String(updated.patientId), {
                patientId: String(updated.patientId),
                optOutAll: updated.optOutAll,
                optOutSms: updated.optOutSms,
                optOutKakao: updated.optOutKakao,
                updatedAt: updated.updatedAt,
            });
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                error?.message ||
                "수신거부 설정 저장에 실패했습니다.";
            setErrorMessage(String(message));
        } finally {
            setSavingState(patientId, false);
        }
    }, [savingByPatient, setPatientPref, setSavingState]);

    const setAll = (patientId: number, next: boolean) => {
        if (savingByPatient[patientId]) {
            return;
        }
        void updatePreference(patientId, { optOutAll: next });
    };

    const setChannel = (patientId: number, channel: "sms" | "kakao", next: boolean) => {
        if (savingByPatient[patientId]) return;

        const current = rows.find((row) => row.patientId === patientId);
        if (!current) return;

        const nextSms = channel === "sms" ? next : current.optOutSms;
        const nextKakao = channel === "kakao" ? next : current.optOutKakao;
        void updatePreference(patientId, { optOutSms: nextSms, optOutKakao: nextKakao });
    };

    return (
        <div className="flex h-full flex-col gap-4">
            <div className="rounded-xl border border-[#F8DCE2] bg-white p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input
                            className="pl-9"
                            placeholder="환자명/전화번호 검색"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 md:text-sm">전체거부 {summary.all}명</div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 md:text-sm">SMS 거부 {summary.sms}명</div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 md:text-sm">알림톡 거부 {summary.kakao}명</div>
                </div>
                {errorMessage && (
                    <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 md:text-sm">
                        {errorMessage}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="hidden w-full text-left text-sm md:table">
                    <thead className="bg-[#FCF7F8] text-[#5C2A35]">
                        <tr>
                            <th className="px-6 py-3 font-medium">환자</th>
                            <th className="px-6 py-3 font-medium">전화번호</th>
                            <th className="px-6 py-3 font-medium">전체 거부</th>
                            <th className="px-6 py-3 font-medium">SMS 거부</th>
                            <th className="px-6 py-3 font-medium">알림톡 거부</th>
                            <th className="px-6 py-3 font-medium">업데이트</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row) => {
                            const isSaving = Boolean(savingByPatient[row.patientId]);
                            return (
                            <tr key={row.patientId} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-bold text-gray-800">{row.patientName}</td>
                                <td className="px-6 py-4 text-gray-500">{row.phone || "-"}</td>
                                <td className="px-6 py-4">
                                    <Switch
                                        checked={row.optOutAll}
                                        disabled={isSaving}
                                        onCheckedChange={(v) => setAll(row.patientId, v)}
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Switch
                                        checked={row.optOutSms}
                                        disabled={isSaving}
                                        onCheckedChange={(v) => setChannel(row.patientId, "sms", v)}
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Switch
                                        checked={row.optOutKakao}
                                        disabled={isSaving}
                                        onCheckedChange={(v) => setChannel(row.patientId, "kakao", v)}
                                    />
                                </td>
                                <td className="px-6 py-4 text-xs text-gray-500">{toDateOnly(row.updatedAt)}</td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="divide-y divide-gray-100 md:hidden">
                    {rows.map((row) => {
                        const isSaving = Boolean(savingByPatient[row.patientId]);
                        return (
                        <div key={row.patientId} className="p-4">
                            <div className="text-sm font-bold text-gray-900">{row.patientName}</div>
                            <div className="text-xs text-gray-500">{row.phone || "-"}</div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <div className="mb-1 text-gray-500">전체</div>
                                    <Switch
                                        checked={row.optOutAll}
                                        disabled={isSaving}
                                        onCheckedChange={(v) => setAll(row.patientId, v)}
                                    />
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <div className="mb-1 text-gray-500">SMS</div>
                                    <Switch
                                        checked={row.optOutSms}
                                        disabled={isSaving}
                                        onCheckedChange={(v) => setChannel(row.patientId, "sms", v)}
                                    />
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <div className="mb-1 text-gray-500">알림톡</div>
                                    <Switch
                                        checked={row.optOutKakao}
                                        disabled={isSaving}
                                        onCheckedChange={(v) => setChannel(row.patientId, "kakao", v)}
                                    />
                                </div>
                            </div>
                            <div className="mt-2 text-xs text-gray-400">업데이트: {toDateOnly(row.updatedAt)}</div>
                        </div>
                        );
                    })}
                </div>

                {!isLoading && rows.length === 0 && (
                    <div className="flex h-48 items-center justify-center text-sm text-gray-500">검색 결과가 없습니다.</div>
                )}
                {isLoading && (
                    <div className="flex h-48 items-center justify-center text-sm text-gray-500">불러오는 중...</div>
                )}
            </div>
        </div>
    );
}

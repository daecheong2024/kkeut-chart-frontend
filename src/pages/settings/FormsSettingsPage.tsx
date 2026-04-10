import React, { useCallback, useMemo, useState } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Switch } from "../../components/ui/Switch";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { Plus, Search, FileText, Loader2 } from "lucide-react";
import { RichTextEditor } from "../../components/common/RichTextEditor";
import {
  documentationService,
  type DocumentationResponse,
  type CreateDocumentationRequest,
  type UpdateDocumentationRequest,
  type DocumentationStructureType,
} from "../../services/documentationService";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";
import { DocumentationBuilder } from "../../components/documentBuilder/DocumentationBuilder";
import { DocumentationPreviewModal } from "../../components/documentBuilder/DocumentationPreviewModal";
import {
  type DocumentationStructured,
  createEmptyStructured,
  parseStructured,
  serializeStructured,
} from "../../types/documentationBuilder";

type PreviewMode = "desktop" | "mobile";

const VARIABLE_TOKENS = [
  { token: "{{patient_name}}", label: "환자명", sample: "홍길동" },
  { token: "{{patient_birth_date}}", label: "생년월일", sample: "1991-12-14" },
  { token: "{{patient_phone}}", label: "연락처", sample: "010-1234-5678" },
  { token: "{{branch_name}}", label: "지점명", sample: "구로" },
  { token: "{{doctor_name}}", label: "담당자", sample: "김원장" },
  { token: "{{today}}", label: "오늘 날짜", sample: "2026-02-25" },
];

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyVariableSamples(text: string) {
  return VARIABLE_TOKENS.reduce((acc, item) => acc.split(item.token).join(item.sample), text);
}

function renderPreviewHtml(body: string) {
  const replaced = applyVariableSamples(body || "");
  if (!replaced.trim()) return "";
  if (replaced.includes("<")) return replaced;
  return `<p>${escapeHtml(replaced).replace(/\n/g, "<br/>")}</p>`;
}

function ConsentDocumentPreview({
  title,
  bodyHtml,
  requireSignature,
  mode,
}: {
  title: string;
  bodyHtml: string;
  requireSignature: boolean;
  mode: PreviewMode;
}) {
  const isMobile = mode === "mobile";
  return (
    <div className={isMobile ? "mx-auto w-[320px]" : "mx-auto w-full max-w-[860px]"}>
      <div className="min-h-[560px] rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-300 bg-slate-50 px-5 py-5 text-center">
          <div className="text-[10px] font-bold tracking-[0.2em] text-slate-500">INFORMED CONSENT</div>
          <h3 className="mt-1 text-lg font-extrabold text-slate-900">{title || "동의서"}</h3>
          <p className="mt-1 text-[11px] text-slate-500">진료/시술 안내 및 동의 문서</p>
        </div>

        <div className={`${isMobile ? "px-3 py-3" : "px-5 py-5"}`}>
          <div className={`grid grid-cols-2 border border-slate-200 text-slate-700 ${isMobile ? "text-[10px]" : "text-[11px]"}`}>
            <div className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1 font-bold">환자명</div>
            <div className="border-b border-slate-200 px-2 py-1">홍길동</div>
            <div className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1 font-bold">생년월일</div>
            <div className="border-b border-slate-200 px-2 py-1">1991-12-14</div>
            <div className="border-r border-slate-200 bg-slate-50 px-2 py-1 font-bold">연락처</div>
            <div className="px-2 py-1">010-1234-5678</div>
          </div>

          <div className={`mt-3 rounded-xl border border-slate-200 bg-white ${isMobile ? "p-3" : "p-4"}`}>
            {bodyHtml ? (
              <div
                className={`prose max-w-none text-slate-800 ${isMobile ? "prose-sm leading-relaxed" : "prose-base leading-relaxed"}`}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            ) : (
              <p className="text-sm text-gray-400">동의서 본문을 입력하면 여기에 표시됩니다.</p>
            )}
          </div>

          <div className={`mt-3 rounded-xl border border-slate-200 bg-slate-50 ${isMobile ? "p-3" : "p-4"}`}>
            <div className="text-xs font-bold text-slate-800">확인 및 동의</div>
            <ul className={`mt-2 space-y-1 text-slate-700 ${isMobile ? "text-[10px]" : "text-[11px]"}`}>
              <li>□ 시술 목적, 기대 효과, 부작용, 주의사항에 대해 충분히 설명을 들었습니다.</li>
              <li>□ 본인은 자발적인 의사로 동의하며, 궁금한 사항을 질문할 기회를 보장받았습니다.</li>
              <li>□ 본 동의서 사본을 요청할 수 있음을 안내받았습니다.</li>
            </ul>
          </div>

          <div className={`mt-3 rounded-xl border border-slate-300 ${isMobile ? "p-3" : "p-4"}`}>
            <div className="text-xs font-bold text-slate-800">서명 및 확인</div>
            {requireSignature ? (
              <div className={`mt-2 grid grid-cols-1 gap-2 ${isMobile ? "text-[10px]" : "text-[11px]"}`}>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="font-semibold text-slate-600">환자 성명</span>
                  <span className="text-slate-900">홍길동 (서명)</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="font-semibold text-slate-600">법정대리인</span>
                  <span className="text-slate-400">해당 시 서명</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="font-semibold text-slate-600">작성일</span>
                  <span className="text-slate-900">2026-03-05</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-600">본 서식은 서명 없이 확인용으로 사용됩니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FormsSettingsPage() {
  const { settings } = useSettingsStore();
  const activeBranchId = settings.activeBranchId;
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(activeBranchId);
  if (permLoaded && !permissions["settings.forms"]) return <NoPermissionOverlay />;

  const [items, setItems] = useState<DocumentationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editIsSignature, setEditIsSignature] = useState(true);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editStructureType, setEditStructureType] = useState<DocumentationStructureType>("structured");
  const [editStructured, setEditStructured] = useState<DocumentationStructured>(() => createEmptyStructured());
  const [showPreview, setShowPreview] = useState(false);

  const loadItems = useCallback(async () => {
    if (!activeBranchId) return;
    try {
      setLoading(true);
      const result = await documentationService.getAll(undefined, 1, 200);
      setItems(result.items);
    } catch (e) {
      console.error("Failed to load documentations", e);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  const editingItem = items.find((i) => i.id === editingId);

  const openEditor = (item: DocumentationResponse) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditRemarks(item.remarks ?? "");
    setEditContent(item.content ?? "");
    setEditIsSignature(item.isSignature);
    setEditIsActive(item.isActive);
    const structureType = (item.structureType ?? "html") as DocumentationStructureType;
    setEditStructureType(structureType);
    if (structureType === "structured") {
      setEditStructured(parseStructured(item.content));
    } else {
      setEditStructured(createEmptyStructured());
    }
  };

  const closeEditor = () => {
    if (editingId === -1 && (editTitle.trim() || editContent.trim() || editRemarks.trim())) {
      if (!confirm("작성 중인 내용이 저장되지 않습니다. 닫으시겠습니까?")) return;
    }
    setEditingId(null);
  };

  // ID === -1 means "draft" — not yet persisted to server
  // 신규 동의서는 항상 structured 모드로 시작
  const handleCreate = () => {
    setEditingId(-1);
    setEditTitle("");
    setEditRemarks("");
    setEditContent("");
    setEditIsSignature(true);
    setEditIsActive(false);
    setEditStructureType("structured");
    setEditStructured(createEmptyStructured());
  };

  const handleSave = async () => {
    if (editingId == null) return;
    if (!editTitle.trim()) {
      alert("제목을 입력해 주세요.");
      return;
    }
    try {
      setSaving(true);
      // structured 모드일 때 Content 는 JSON 직렬화
      const contentToSave = editStructureType === "structured"
        ? serializeStructured(editStructured)
        : (editContent || null);

      if (editingId === -1) {
        // Draft → create
        const request: CreateDocumentationRequest = {
          title: editTitle,
          remarks: editRemarks || null,
          content: contentToSave,
          contentType: "html",
          structureType: editStructureType,
          isSignature: editIsSignature,
          isActive: editIsActive,
        };
        const created = await documentationService.create(request);
        setItems((prev) => [created, ...prev]);
        setEditingId(created.id);
        alert("등록되었습니다.");
      } else {
        // Existing → update
        const request: UpdateDocumentationRequest = {
          title: editTitle,
          remarks: editRemarks || null,
          content: contentToSave,
          structureType: editStructureType,
          isSignature: editIsSignature,
          isActive: editIsActive,
        };
        const updated = await documentationService.update(editingId, request);
        setItems((prev) => prev.map((it) => (it.id === editingId ? updated : it)));
        alert("저장되었습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await documentationService.remove(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (editingId === id) closeEditor();
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  };

  const handleToggleActive = async (item: DocumentationResponse) => {
    try {
      const updated = await documentationService.update(item.id, { isActive: !item.isActive });
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
    } catch (e) {
      console.error(e);
    }
  };

  const insertVariable = (token: string) => {
    const spacer = editContent && !editContent.endsWith(" ") ? " " : "";
    setEditContent(`${editContent}${spacer}${token}`);
  };

  const filtered = items.filter((i) => {
    const keyword = search.trim();
    if (!keyword) return true;
    return i.title.includes(keyword) || (i.remarks ?? "").includes(keyword);
  });

  const previewHtml = useMemo(() => renderPreviewHtml(editContent), [editContent]);
  const previewTitle = useMemo(() => applyVariableSamples(editTitle || "동의서"), [editTitle]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return dateStr.split("T")[0] ?? dateStr;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="설정 > 서식" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold">서식/동의서 관리</div>
            <div className="mt-1 text-sm text-gray-600">환자에게 받을 동의서 및 서식 템플릿을 관리합니다.</div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="w-[300px] pl-9"
              placeholder="서식명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} 서식 추가
          </Button>
        </div>

        {loading && <div className="mt-4 text-sm text-gray-500">서식 설정을 불러오는 중...</div>}

        {!loading && filtered.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            등록된 서식이 없습니다. 우측 상단의 `서식 추가`로 새 템플릿을 만들어주세요.
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div key={item.id} className="group relative rounded-2xl border border-[rgb(var(--kkeut-border))] bg-white p-4 transition hover:shadow-md">
              <div className="absolute right-4 top-4 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => openEditor(item)} className="rounded p-1 text-xs font-bold text-blue-600 hover:bg-gray-100">
                  수정
                </button>
                <button onClick={() => handleDelete(item.id)} className="rounded p-1 text-xs font-bold text-red-600 hover:bg-gray-100">
                  삭제
                </button>
              </div>

              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="line-clamp-1 text-sm font-bold text-gray-900">{item.title}</div>
                  {item.remarks && <div className="text-xs text-gray-500">{item.remarks}</div>}
                  <div className="mt-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>
                      {item.isActive ? "사용중" : "미사용"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>서명 필수</span>
                  <span className={item.isSignature ? "font-bold text-blue-600" : "text-gray-400"}>
                    {item.isSignature ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>사용 여부</span>
                  <Switch
                    checked={item.isActive}
                    onCheckedChange={() => handleToggleActive(item)}
                  />
                </div>
                <div className="mt-2 flex justify-between border-t border-gray-100 pt-2">
                  <span>수정일</span>
                  <span>{formatDate(item.modifyTime)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingId != null && (editingId === -1 || editingItem) && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white animate-in slide-in-from-bottom-10 duration-200">
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
            <div>
              <h2 className="text-xl font-bold">{editingId === -1 ? "서식 등록" : "서식 편집"}</h2>
              <p className="text-sm text-gray-500">{editingId === -1 ? "새 동의서를 작성하고 저장하세요." : "동의서 내용을 작성하고 저장하세요."}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${editStructureType === "structured" ? "bg-[#FCEBEF] text-[#8B3F50]" : "bg-amber-100 text-amber-700"}`}>
                {editStructureType === "structured" ? "블록 빌더" : "HTML (legacy)"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${editIsActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>
                {editIsActive ? "사용중" : "미사용"}
              </span>
              {editStructureType === "structured" && (
                <Button variant="outline" onClick={() => setShowPreview(true)}>
                  미리보기
                </Button>
              )}
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
              <Button variant="outline" onClick={closeEditor}>
                닫기
              </Button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="w-[320px] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-6">
              <div className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">서식 제목</label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">비고</label>
                  <Input value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} />
                </div>

                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">서명 필수</span>
                    <Switch checked={editIsSignature} onCheckedChange={setEditIsSignature} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">사용 여부</span>
                    <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
                  </div>
                </div>

                {editStructureType === "html" ? (
                  <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
                    <div className="text-sm font-bold text-gray-800">변수 삽입</div>
                    <div className="text-xs text-gray-500">클릭하면 본문 끝에 토큰이 추가됩니다.</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {VARIABLE_TOKENS.map((item) => (
                        <button
                          key={item.token}
                          type="button"
                          onClick={() => insertVariable(item.token)}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          title={`${item.label} (${item.token})`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-xl border border-[#F8DCE2] bg-[#FCF7F8] p-4">
                    <div className="text-sm font-bold text-[#5C2A35]">📋 블록 빌더 안내</div>
                    <div className="text-[11px] text-[#8B5A66] leading-relaxed">
                      각 섹션 하단의 <b>"+ 필드 추가"</b> 영역에서 블록을 추가해 동의서를 구성하세요. 환자 정보(이름·생년월일·연락처 등)는 <b>환자가 서명할 때 자동으로 채워집니다</b> — 별도 변수 삽입이 필요 없습니다.
                    </div>
                    <div className="mt-2 pt-2 border-t border-[#F8DCE2] text-[10px] text-[#8B5A66] space-y-0.5">
                      <div>· <b>날짜 입력란</b> — 환자가 서명 시 입력</div>
                      <div>· <b>서술형 작성란</b> — 차트에서 직원이 입력</div>
                      <div>· <b>서술형 내용</b> — 고정 안내문 (변수 X)</div>
                      <div>· <b>선택형 내용</b> — 단일/복수 선택지</div>
                    </div>
                  </div>
                )}

                {editingItem && (
                  <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
                    <div>작성자: {editingItem.creator}</div>
                    <div>작성일: {formatDate(editingItem.createTime)}</div>
                    <div>수정자: {editingItem.modifier}</div>
                    <div>수정일: {formatDate(editingItem.modifyTime)}</div>
                  </div>
                )}
              </div>
            </div>

            {editStructureType === "structured" ? (
              /* Block-based builder mode (new) */
              <div className="flex min-h-0 flex-1 overflow-y-auto bg-[#FCF7F8]/30 px-6 py-6">
                <div className="mx-auto w-full max-w-[820px]">
                  <DocumentationBuilder
                    value={editStructured}
                    onChange={setEditStructured}
                  />
                </div>
              </div>
            ) : (
              /* Legacy HTML mode */
              <div className="flex min-h-0 flex-1 gap-4 p-6">
                <div className="flex min-h-0 flex-1 flex-col">
                  <label className="mb-2 text-sm font-bold text-gray-700">본문 내용</label>
                  <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-300">
                    <RichTextEditor
                      content={editContent}
                      onChange={(html) => setEditContent(html)}
                      placeholder="동의서 내용을 입력하세요..."
                    />
                  </div>
                </div>

                <div className="flex min-h-0 w-[420px] flex-shrink-0 flex-col rounded-xl border border-gray-300 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div className="text-sm font-bold text-gray-800">미리보기</div>
                    <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
                      <button
                        type="button"
                        onClick={() => setPreviewMode("desktop")}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${previewMode === "desktop" ? "bg-white text-gray-900" : "text-gray-500"}`}
                      >
                        PC
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode("mobile")}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${previewMode === "mobile" ? "bg-white text-gray-900" : "text-gray-500"}`}
                      >
                        모바일
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto bg-gray-100 p-4">
                    <ConsentDocumentPreview
                      title={previewTitle}
                      bodyHtml={previewHtml}
                      requireSignature={editIsSignature}
                      mode={previewMode}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Structured 동의서 미리보기 모달 */}
      <DocumentationPreviewModal
        open={showPreview}
        title={editTitle}
        structured={editStructured}
        onClose={() => setShowPreview(false)}
      />
    </div>
  );
}

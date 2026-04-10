import React, { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Building2, Megaphone, Pencil, X } from "lucide-react";
import { noticeService, NoticeItem } from "../../services/noticeService";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";

type TabKey = "BRANCH" | "HQ";

const TABS: { key: TabKey; label: string }[] = [
  { key: "BRANCH", label: "병원공지" },
  { key: "HQ", label: "본사공지" },
];

function normalizeActorName(value?: string) {
  const name = (value || "").trim();
  if (!name) return "미지정";
  const lowered = name.toLowerCase();
  if (lowered === "system" || lowered === "user" || lowered === "관리자") return "관리자";
  return name;
}

function formatTimeAgo(isoDate?: string) {
  if (!isoDate) return "-";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true, locale: ko });
}

function isEditedNotice(notice: NoticeItem) {
  const created = new Date(notice.createdAt).getTime();
  const modified = new Date(notice.modifiedAt || notice.createdAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(modified)) return false;

  const creator = normalizeActorName(notice.creatorName);
  const modifier = normalizeActorName(notice.modifierName);
  return modifier !== creator || Math.abs(modified - created) > 60_000;
}

export function NoticeSection() {
  const { settings } = useSettingsStore();
  const currentUserName = useAuthStore((state) => state.userName);
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(settings.activeBranchId);

  const [activeTab, setActiveTab] = useState<TabKey>("BRANCH");
  const [branchNotices, setBranchNotices] = useState<NoticeItem[]>([]);
  const [hqNotices, setHqNotices] = useState<NoticeItem[]>([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isImportant, setIsImportant] = useState(false);

  const [editingNotice, setEditingNotice] = useState<NoticeItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editImportant, setEditImportant] = useState(false);

  const actorName = useMemo(() => {
    const name = (currentUserName || "").trim();
    return name || undefined;
  }, [currentUserName]);

  const canEditBranch = !permLoaded || !!permissions["dashboard.edit_notice"];
  const canEditHq = permLoaded && !!permissions["dashboard.edit_hq_notice"];
  const canEditCurrent = activeTab === "BRANCH" ? canEditBranch : canEditHq;

  const notices = activeTab === "BRANCH" ? branchNotices : hqNotices;

  const loadBranchNotices = async () => {
    if (!settings.activeBranchId) return;
    try {
      const data = await noticeService.getNotices(settings.activeBranchId);
      setBranchNotices(data);
    } catch (e) {
      console.error("Failed to load branch notices", e);
    }
  };

  const loadHqNotices = async () => {
    try {
      const data = await noticeService.getHqNotices();
      setHqNotices(data);
    } catch (e) {
      console.error("Failed to load HQ notices", e);
    }
  };

  useEffect(() => {
    void loadBranchNotices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.activeBranchId]);

  useEffect(() => {
    void loadHqNotices();
  }, []);

  const openAddModal = () => {
    setNewTitle("");
    setNewContent("");
    setIsImportant(false);
    setIsAddModalOpen(true);
  };

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !settings.activeBranchId) return;

    const type = activeTab === "HQ" ? "HQ" : "BRANCH";

    try {
      await noticeService.createNotice(
        settings.activeBranchId,
        newTitle,
        newContent,
        type,
        isImportant,
        actorName
      );
      if (activeTab === "HQ") {
        await loadHqNotices();
      } else {
        await loadBranchNotices();
      }
      setIsAddModalOpen(false);
    } catch (e) {
      console.error("Failed to save notice", e);
      alert("공지 등록에 실패했습니다.");
    }
  };

  const openEditModal = (notice: NoticeItem) => {
    setEditingNotice(notice);
    setEditTitle(notice.title || "");
    setEditContent(notice.content || "");
    setEditImportant(!!notice.isImportant);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNotice || !editTitle.trim()) return;

    try {
      const updated = await noticeService.updateNotice(editingNotice.id, {
        title: editTitle,
        content: editContent,
        isImportant: editImportant,
        actor: actorName,
      });
      if (activeTab === "HQ") {
        setHqNotices((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else {
        setBranchNotices((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
      setEditingNotice(null);
    } catch (e) {
      console.error("Failed to update notice", e);
      alert("공지 수정에 실패했습니다.");
    }
  };

  const deleteNotice = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      await noticeService.deleteNotice(id);
      if (activeTab === "HQ") {
        setHqNotices((prev) => prev.filter((n) => n.id !== id));
      } else {
        setBranchNotices((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete notice", error);
      if (activeTab === "HQ") {
        await loadHqNotices();
      } else {
        await loadBranchNotices();
      }
    }
  };

  const addModalTitle = activeTab === "HQ" ? "새 본사공지 등록" : "새 병원공지 등록";
  const addButtonLabel = activeTab === "HQ" ? "본사공지 등록" : "병원공지 등록";
  const AddButtonIcon = activeTab === "HQ" ? Building2 : Megaphone;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[16px] border border-[#F8DCE2] bg-white text-sm">
      <div className="flex items-center justify-between border-b border-[#F8DCE2] bg-[#FCF7F8] px-6 py-4">
        <h2 className="text-base font-semibold text-[#5C2A35]">공지사항</h2>
        {canEditCurrent && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 rounded-[8px] bg-[#D27A8C] px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-[#8B3F50]"
          >
            <AddButtonIcon size={16} className={activeTab === "BRANCH" ? "fill-white" : ""} />
            {addButtonLabel}
          </button>
        )}
      </div>

      <div className="flex border-b border-[#F8DCE2] bg-white px-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-all duration-200 ease-in-out ${
              activeTab === tab.key
                ? "border-[#D27A8C] text-[#D27A8C]"
                : "border-transparent text-[#616161] hover:text-[#242424]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {notices.length === 0 && (
            <div className="py-10 text-center text-[#616161]">
              {activeTab === "HQ" ? "등록된 본사공지가 없습니다." : "등록된 병원공지가 없습니다."}
            </div>
          )}
          {notices.map((notice) => {
            const edited = isEditedNotice(notice);
            return (
              <div
                key={notice.id}
                className="group relative rounded-[12px] border border-[#F8DCE2] p-4 transition-all duration-200 ease-in-out hover:shadow-[0_4px_12px_rgba(226,107,124,0.08)]"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {notice.isImportant && (
                      <span className="rounded-[8px] bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                        중요
                      </span>
                    )}
                    <span className="rounded-[8px] bg-[#FCEBEF] px-2 py-0.5 text-xs font-medium text-[#D27A8C]">
                      {notice.type === "HQ" ? "본사" : "병원"}
                    </span>
                    <span className="text-xs text-[#616161]">{formatTimeAgo(notice.createdAt)}</span>
                  </div>
                  {canEditCurrent && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(notice)}
                        className="p-1 text-[#616161] opacity-0 transition-all duration-200 ease-in-out hover:text-[#D27A8C] group-hover:opacity-100"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => deleteNotice(e, notice.id)}
                        className="p-1 text-[#616161] opacity-0 transition-all duration-200 ease-in-out hover:text-red-500 group-hover:opacity-100"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <h3 className="mb-1.5 text-[15px] font-semibold text-[#242424]">{notice.title}</h3>
                {notice.content && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#616161]">
                    {notice.content}
                  </p>
                )}
                <div className="mt-3 space-y-1 text-xs text-[#616161]">
                  <div>
                    작성: {normalizeActorName(notice.creatorName)} · {formatTimeAgo(notice.createdAt)}
                  </div>
                  {edited && (
                    <div>
                      수정: {normalizeActorName(notice.modifierName)} · {formatTimeAgo(notice.modifiedAt)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isAddModalOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 p-4">
          <form
            onSubmit={handleSaveNotice}
            className="flex w-full max-w-sm flex-col gap-4 rounded-[16px] border border-[#F8DCE2] bg-white p-6 shadow-[0_4px_12px_rgba(226,107,124,0.08)]"
          >
            <div className="text-base font-semibold text-[#5C2A35]">{addModalTitle}</div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#616161]">제목</label>
              <input
                className="w-full rounded-t-[8px] border-0 border-b-2 border-b-[#F8DCE2] bg-[#FCEBEF] px-3 py-2.5 text-sm text-[#242424] placeholder:text-[#616161] transition-all duration-200 ease-in-out focus:border-b-[#F49EAF] focus:outline-none"
                placeholder="공지 제목을 입력하세요"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#616161]">내용</label>
              <textarea
                className="h-36 w-full resize-none rounded-t-[8px] border-0 border-b-2 border-b-[#F8DCE2] bg-[#FCEBEF] p-3 text-sm text-[#242424] placeholder:text-[#616161] transition-all duration-200 ease-in-out focus:border-b-[#F49EAF] focus:outline-none"
                placeholder="공지 내용을 입력하세요"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isImportantCreate"
                checked={isImportant}
                onChange={(e) => setIsImportant(e.target.checked)}
                className="h-4 w-4 rounded border-[#F8DCE2] text-[#D27A8C] focus:ring-[#F49EAF]"
              />
              <label htmlFor="isImportantCreate" className="text-xs font-medium text-[#242424]">
                중요 공지로 등록
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="flex-1 rounded-[8px] border border-[#F8DCE2] bg-white py-2.5 text-sm font-medium text-[#616161] transition-all duration-200 ease-in-out hover:bg-[#FCEBEF]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="flex-1 rounded-[8px] bg-[#D27A8C] py-2.5 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-[#8B3F50] disabled:opacity-50"
              >
                등록
              </button>
            </div>
          </form>
        </div>
      )}

      {editingNotice && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="flex w-full max-w-sm flex-col gap-4 rounded-[16px] border border-[#F8DCE2] bg-white p-6 shadow-[0_4px_12px_rgba(226,107,124,0.08)]"
          >
            <div className="text-base font-semibold text-[#5C2A35]">공지사항 수정</div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#616161]">제목</label>
              <input
                className="w-full rounded-t-[8px] border-0 border-b-2 border-b-[#F8DCE2] bg-[#FCEBEF] px-3 py-2.5 text-sm text-[#242424] placeholder:text-[#616161] transition-all duration-200 ease-in-out focus:border-b-[#F49EAF] focus:outline-none"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#616161]">내용</label>
              <textarea
                className="h-36 w-full resize-none rounded-t-[8px] border-0 border-b-2 border-b-[#F8DCE2] bg-[#FCEBEF] p-3 text-sm text-[#242424] placeholder:text-[#616161] transition-all duration-200 ease-in-out focus:border-b-[#F49EAF] focus:outline-none"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isImportantEdit"
                checked={editImportant}
                onChange={(e) => setEditImportant(e.target.checked)}
                className="h-4 w-4 rounded border-[#F8DCE2] text-[#D27A8C] focus:ring-[#F49EAF]"
              />
              <label htmlFor="isImportantEdit" className="text-xs font-medium text-[#242424]">
                중요 공지로 등록
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingNotice(null)}
                className="flex-1 rounded-[8px] border border-[#F8DCE2] bg-white py-2.5 text-sm font-medium text-[#616161] transition-all duration-200 ease-in-out hover:bg-[#FCEBEF]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!editTitle.trim()}
                className="flex-1 rounded-[8px] bg-[#D27A8C] py-2.5 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-[#8B3F50] disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { addDays, format, formatDistanceToNow, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Pencil, Plus, X } from "lucide-react";
import { todoService, TodoItem } from "../../services/todoService";
import { useAuthStore } from "../../stores/useAuthStore";
import { resolveActiveBranchId } from "../../utils/branch";

function normalizeActorName(value?: string) {
  const name = (value || "").trim();
  if (!name) return "미지정";
  const lowered = name.toLowerCase();
  if (lowered === "system" || lowered === "user") return "관리자";
  return name;
}

function timeAgo(isoDate?: string) {
  if (!isoDate) return "-";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true, locale: ko });
}

function isEditedTask(task: TodoItem) {
  const created = new Date(task.createdAt || "").getTime();
  const modified = new Date(task.modifiedAt || task.createdAt || "").getTime();
  if (!Number.isFinite(created) || !Number.isFinite(modified)) return false;

  const creator = normalizeActorName(task.creator);
  const modifier = normalizeActorName(task.modifier);
  return modifier !== creator || Math.abs(modified - created) > 60_000;
}

export function HospitalTaskSection() {
  const resolvedBranchId = resolveActiveBranchId("");
  const currentUserName = useAuthStore((state) => state.userName);
  const [date, setDate] = useState(new Date());
  const [tasks, setTasks] = useState<TodoItem[]>([]);
  const [newTaskContent, setNewTaskContent] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TodoItem | null>(null);
  const [editContent, setEditContent] = useState("");

  const actorName = useMemo(() => (currentUserName || "").trim() || undefined, [currentUserName]);

  const loadTasks = async () => {
    if (!resolvedBranchId) return;
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const data = await todoService.getTodos(resolvedBranchId, dateStr);
      setTasks(data.filter((task) => !task.customerId && !task.visitId));
    } catch (error) {
      console.error("Failed to load hospital tasks", error);
    }
  };

  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedBranchId, date]);

  const openAddModal = () => {
    setNewTaskContent("");
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
  };

  const handleSaveTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resolvedBranchId) return;

    const content = newTaskContent.trim();
    if (!content) return;

    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const added = await todoService.createTodo(
        resolvedBranchId,
        content,
        dateStr,
        undefined,
        undefined,
        undefined,
        undefined,
        actorName,
        { sourceType: "hospital_task" }
      );
      if (!added.customerId && !added.visitId) {
        setTasks((prev) => [...prev, added]);
      }
      setNewTaskContent("");
      closeAddModal();
    } catch (error) {
      console.error("Failed to save hospital task", error);
      alert("업무 등록에 실패했습니다.");
    }
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTask || !editContent.trim()) return;

    try {
      await todoService.updateTodoContent(editingTask.id, editContent, actorName);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === editingTask.id
            ? {
                ...task,
                content: editContent,
                modifier: actorName || task.modifier,
                modifiedAt: new Date().toISOString(),
              }
            : task
        )
      );
      setEditingTask(null);
      setEditContent("");
    } catch (error) {
      console.error("Failed to update hospital task", error);
      alert("업무 수정에 실패했습니다.");
    }
  };

  const toggleTask = async (id: number, currentCompleted: boolean) => {
    try {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id
            ? {
                ...task,
                isCompleted: !currentCompleted,
                modifier: actorName || task.modifier,
                modifiedAt: new Date().toISOString(),
              }
            : task
        )
      );
      await todoService.toggleTodo(id, actorName);
    } catch (error) {
      console.error("Failed to toggle hospital task", error);
      await loadTasks();
    }
  };

  const deleteTask = async (id: number) => {
    if (!confirm("정말 이 업무를 삭제하시겠습니까?")) return;
    try {
      setTasks((prev) => prev.filter((task) => task.id !== id));
      await todoService.deleteTodo(id);
    } catch (error) {
      console.error("Failed to delete hospital task", error);
      await loadTasks();
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[16px] border border-[#C5CAE9] bg-white">
      <div className="flex items-center justify-between border-b border-[#C5CAE9] bg-[#F8F9FD] px-6 py-4">
        <h2 className="text-base font-semibold text-[#1A237E]">병원업무</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate((value) => subDays(value, 1))}
            className="rounded-[8px] p-1.5 text-[#616161] transition-all duration-200 ease-in-out hover:bg-[#E8EAF6]"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-[120px] text-center text-sm font-medium text-[#242424]">
            {format(date, "yyyy-MM-dd eeee", { locale: ko })}
          </div>
          <button
            onClick={() => setDate((value) => addDays(value, 1))}
            className="rounded-[8px] p-1.5 text-[#616161] transition-all duration-200 ease-in-out hover:bg-[#E8EAF6]"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setDate(new Date())}
            className="rounded-[8px] border border-[#C5CAE9] bg-white px-3 py-1.5 text-xs font-medium text-[#616161] transition-all duration-200 ease-in-out hover:bg-[#E8EAF6]"
          >
            오늘
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {tasks.length === 0 && <div className="py-10 text-center text-sm text-[#616161]">등록된 업무가 없습니다.</div>}
        {tasks.map((task) => {
          const edited = isEditedTask(task);
          return (
            <div
              key={task.id}
              className={`group flex items-start gap-3 rounded-[12px] border border-[#C5CAE9] p-3 transition-all duration-200 ease-in-out hover:shadow-[0_4px_12px_rgba(63,81,181,0.08)] ${
                task.isCompleted ? "bg-[#F5F7FA]" : "bg-white"
              }`}
            >
              <button
                onClick={() => toggleTask(task.id, task.isCompleted)}
                className={`mt-0.5 shrink-0 transition-all duration-200 ease-in-out ${task.isCompleted ? "text-[#616161]" : "text-[#3F51B5]"}`}
              >
                {task.isCompleted ? <CheckCircle2 size={20} className="fill-[#E8EAF6]" /> : <Circle size={20} />}
              </button>

              <div className="min-w-0 flex-1">
                <div
                  className={`whitespace-pre-wrap text-sm font-medium leading-relaxed ${
                    task.isCompleted ? "text-[#616161] line-through decoration-[#9E9E9E]" : "text-[#242424]"
                  }`}
                >
                  {task.content}
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-[#616161]">
                  <div>
                    작성: {normalizeActorName(task.creator)} · {timeAgo(task.createdAt)}
                  </div>
                  {task.isCompleted && task.completedBy && (
                    <div className="text-emerald-600">
                      완료: {normalizeActorName(task.completedBy)} · {timeAgo(task.completedAt)}
                    </div>
                  )}
                  {!task.isCompleted && edited && (
                    <div>
                      수정: {normalizeActorName(task.modifier)} · {timeAgo(task.modifiedAt)}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  setEditingTask(task);
                  setEditContent(task.content || "");
                }}
                className="text-[#616161] opacity-0 transition-all duration-200 ease-in-out hover:text-[#3F51B5] group-hover:opacity-100"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => deleteTask(task.id)}
                className="text-[#616161] opacity-0 transition-all duration-200 ease-in-out hover:text-red-500 group-hover:opacity-100"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#C5CAE9] bg-[#F8F9FD] px-6 py-4">
        <button
          onClick={openAddModal}
          className="ml-auto flex items-center gap-1.5 rounded-[8px] bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-[#303F9F]"
        >
          <Plus size={16} />
          병원 업무 등록
        </button>
      </div>

      {isAddModalOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 p-4">
          <form onSubmit={handleSaveTask} className="w-full max-w-md rounded-[16px] border border-[#C5CAE9] bg-white p-6 shadow-[0_4px_12px_rgba(63,81,181,0.08)]">
            <div className="mb-4 text-base font-semibold text-[#1A237E]">병원업무 입력</div>
            <textarea
              autoFocus
              className="h-28 w-full resize-none rounded-t-[8px] border-0 border-b-2 border-b-[#C5CAE9] bg-[#E8EAF6] p-3 text-sm text-[#242424] placeholder:text-[#616161] transition-all duration-200 ease-in-out focus:border-b-[#536DFE] focus:outline-none"
              placeholder="업무 내용을 입력해 주세요."
              value={newTaskContent}
              onChange={(event) => setNewTaskContent(event.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeAddModal}
                className="flex-1 rounded-[8px] border border-[#C5CAE9] bg-white py-2.5 text-sm font-medium text-[#616161] transition-all duration-200 ease-in-out hover:bg-[#E8EAF6]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!newTaskContent.trim()}
                className="flex-1 rounded-[8px] bg-[#3F51B5] py-2.5 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-[#303F9F] disabled:opacity-50"
              >
                등록
              </button>
            </div>
          </form>
        </div>
      )}

      {editingTask && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 p-4">
          <form onSubmit={handleSaveEdit} className="w-full max-w-md rounded-[16px] border border-[#C5CAE9] bg-white p-6 shadow-[0_4px_12px_rgba(63,81,181,0.08)]">
            <div className="mb-4 text-base font-semibold text-[#1A237E]">업무 수정</div>
            <textarea
              autoFocus
              className="h-28 w-full resize-none rounded-t-[8px] border-0 border-b-2 border-b-[#C5CAE9] bg-[#E8EAF6] p-3 text-sm text-[#242424] placeholder:text-[#616161] transition-all duration-200 ease-in-out focus:border-b-[#536DFE] focus:outline-none"
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="flex-1 rounded-[8px] border border-[#C5CAE9] bg-white py-2.5 text-sm font-medium text-[#616161] transition-all duration-200 ease-in-out hover:bg-[#E8EAF6]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!editContent.trim()}
                className="flex-1 rounded-[8px] bg-[#3F51B5] py-2.5 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-[#303F9F] disabled:opacity-50"
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

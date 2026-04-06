import { create } from "zustand";
import { todoService } from "../services/todoService";
import { useSettingsStore } from "./useSettingsStore";
import { useAuthStore } from "./useAuthStore";
import { resolveActiveBranchId } from "../utils/branch";

// Re-export domain type for backward compatibility
export type { TaskItem } from "../types/chart";
import type { TaskItem } from "../types/chart";

interface HospitalTaskStore {
    tasks: TaskItem[];
    loading: boolean;
    fetchTasks: (date: string) => Promise<void>;
    addTask: (task: Omit<TaskItem, "id" | "author"> & { author?: string }, date: string) => Promise<void>;
    updateTask: (id: string, updates: Partial<TaskItem>) => Promise<void>;
    toggleTask: (id: string) => Promise<void>;
    deleteTask: (id: string) => Promise<void>;
}

const normalizeAuthor = (value?: string, fallback = "미지정") => {
    const normalized = (value || "").trim();
    if (!normalized) return fallback;
    if (normalized.toLowerCase() === "user") return fallback;
    if (normalized.toLowerCase() === "system") return fallback;
    return normalized;
};

export const useHospitalTaskStore = create<HospitalTaskStore>((set, get) => ({
    tasks: [],
    loading: false,

    fetchTasks: async (date) => {
        set({ loading: true });
        try {
            const branchId = resolveActiveBranchId();
            if (!branchId) return;
            const data = await todoService.getTodos(branchId, date);
            const hospitalOnly = data.filter((d) => !d.customerId && !d.visitId);

            const mapped: TaskItem[] = hospitalOnly.map((d) => ({
                id: String(d.id),
                content: d.content,
                subContent: undefined,
                completed: d.isCompleted,
                author: normalizeAuthor(d.creator),
            }));
            set({ tasks: mapped });
        } catch (error) {
            console.error("Failed to fetch tasks:", error);
        } finally {
            set({ loading: false });
        }
    },

    addTask: async (task, date) => {
        try {
            const branchId = resolveActiveBranchId();
            if (!branchId) return;
            const defaultCreator = (task.author || useAuthStore.getState().userName || "").trim();
            const created = await todoService.createTodo(
                branchId,
                task.content,
                date,
                undefined,
                undefined,
                undefined,
                undefined,
                defaultCreator || undefined,
                { sourceType: "hospital_task" }
            );

            if (!created.customerId && !created.visitId) {
                const mapped: TaskItem = {
                    id: String(created.id),
                    content: created.content,
                    subContent: undefined,
                    completed: created.isCompleted,
                    author: normalizeAuthor(created.creator || defaultCreator),
                };
                set((state) => ({ tasks: [...state.tasks, mapped] }));
            }
        } catch (e) {
            console.error(e);
        }
    },

    updateTask: async (id, updates) => {
        try {
            set((state) => ({
                tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
            }));
            if (updates.completed !== undefined) {
                const actor = (useAuthStore.getState().userName || "").trim() || undefined;
                await todoService.toggleTodo(Number(id), actor);
            }
        } catch (e) {
            console.error(e);
        }
    },

    toggleTask: async (id) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;

        const newState = !task.completed;
        set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? { ...t, completed: newState } : t)),
        }));

        try {
            const actor = (useAuthStore.getState().userName || "").trim() || undefined;
            await todoService.toggleTodo(Number(id), actor);
        } catch (e) {
            console.error(e);
            set((state) => ({
                tasks: state.tasks.map((t) => (t.id === id ? { ...t, completed: !newState } : t)),
            }));
        }
    },

    deleteTask: async (id) => {
        const oldTasks = get().tasks;
        set((state) => ({
            tasks: state.tasks.filter((t) => t.id !== id),
        }));

        try {
            await todoService.deleteTodo(Number(id));
        } catch (e) {
            console.error(e);
            set({ tasks: oldTasks });
        }
    },
}));



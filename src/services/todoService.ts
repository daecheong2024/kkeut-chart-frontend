import apiClient from "./apiClient";

export interface TodoItem {
    id: number;
    customerId?: number;
    visitId?: number;
    content: string;
    sourceType?: string;
    sourceTicketId?: string;
    procedureKey?: string;
    procedureName?: string;
    isCompleted: boolean;
    status?: "todo" | "doing" | "done";
    startedAt?: string;
    startedBy?: string;
    completedAt?: string;
    completedBy?: string;
    assigneeUserId?: number;
    assignee?: string;
    sortOrder?: number;
    targetDate?: string;
    createdAt: string;
    creator?: string;
    modifiedAt?: string;
    modifier?: string;
}

export interface TodoCreateMeta {
    sourceType?: string;
    sourceTicketId?: string;
    procedureKey?: string;
    procedureName?: string;
}

export const todoService = {
    async getTodos(branchId: string, date?: string, patientId?: number, visitId?: number): Promise<TodoItem[]> {
        // date format: YYYY-MM-DD
        let url = `/todos?branchId=${branchId}`;
        if (date) url += `&date=${date}`;
        if (patientId) url += `&patientId=${patientId}`;
        if (visitId) url += `&visitId=${visitId}`;

        const response = await apiClient.get(url);
        return response.data;
    },

    async createTodo(
        branchId: string,
        content: string,
        targetDate?: string,
        patientId?: number,
        visitId?: number,
        assigneeUserId?: number,
        assignee?: string,
        creator?: string,
        meta?: TodoCreateMeta
    ): Promise<TodoItem> {
        // targetDate format: YYYY-MM-DD
        const response = await apiClient.post("/todos", {
            branchId,
            content,
            targetDate,
            customerId: patientId,
            visitId,
            assigneeUserId,
            assignee,
            creator,
            sourceType: meta?.sourceType,
            sourceTicketId: meta?.sourceTicketId,
            procedureKey: meta?.procedureKey,
            procedureName: meta?.procedureName
        });
        return response.data;
    },

    async toggleTodo(id: number, actor?: string): Promise<void> {
        await apiClient.patch(`/todos/${id}/toggle`, null, {
            params: actor ? { actor } : undefined
        });
    },

    async setTodoStatus(id: number, status: "todo" | "doing" | "done", actor?: string): Promise<void> {
        await apiClient.patch(`/todos/${id}/status`, { status, actor });
    },

    async setTodoAssignee(id: number, assigneeUserId?: number, assignee?: string, actor?: string): Promise<void> {
        await apiClient.patch(`/todos/${id}/assignee`, { assigneeUserId, assignee, actor });
    },

    async updateTodoContent(id: number, content: string, actor?: string): Promise<void> {
        await apiClient.patch(`/todos/${id}/content`, { content, actor });
    },

    async reorderTodos(
        branchId: string,
        orderedTodoIds: number[],
        targetDate?: string,
        patientId?: number,
        visitId?: number
    ): Promise<void> {
        await apiClient.patch("/todos/reorder", {
            branchId,
            orderedTodoIds,
            targetDate,
            customerId: patientId,
            visitId
        });
    },

    async deleteTodo(id: number): Promise<void> {
        await apiClient.delete(`/todos/${id}`);
    }
};

import apiClient from "./apiClient";
import type { ProcedureTodoStatsDashboard, ProcedureTodoStatsQuery } from "../types/procedureTodoStats";

const emptyDashboard = (q: ProcedureTodoStatsQuery): ProcedureTodoStatsDashboard => ({
  branchId: q.branchId,
  fromDate: q.fromDateISO,
  toDate: q.toDateISO,
  summary: { totalTodos: 0, assignedTodos: 0, unassignedTodos: 0, todoCount: 0, doingCount: 0, doneCount: 0 },
  byStaff: [],
  byStaffProcedure: [],
  byJob: [],
  byProcedure: [],
  byDate: [],
});

export const procedureTodoStatsService = {
  async getDashboard(query: ProcedureTodoStatsQuery): Promise<ProcedureTodoStatsDashboard> {
    try {
      const response = await apiClient.get<ProcedureTodoStatsDashboard>("/charts/procedures/stats", {
        params: {
          branchId: query.branchId,
          fromDate: query.fromDateISO,
          toDate: query.toDateISO,
        },
      });
      return response.data;
    } catch {
      return emptyDashboard(query);
    }
  },
};

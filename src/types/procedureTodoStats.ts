export interface ProcedureTodoStatsSummary {
  totalTodos: number;
  assignedTodos: number;
  unassignedTodos: number;
  todoCount: number;
  doingCount: number;
  doneCount: number;
}

export interface ProcedureTodoStaffStats {
  staffId: string;
  staffName: string;
  jobTitleId: string;
  jobTitleName: string;
  assignedCount: number;
  todoCount: number;
  doingCount: number;
  doneCount: number;
  startedCount: number;
  completedCount: number;
  workSamples: number;
  totalWorkMinutes: number;
  averageWorkMinutes: number;
  completionRate: number;
}

export interface ProcedureTodoJobStats {
  jobTitleId: string;
  jobTitleName: string;
  assignedCount: number;
  todoCount: number;
  doingCount: number;
  doneCount: number;
  startedCount: number;
  completedCount: number;
  workSamples: number;
  totalWorkMinutes: number;
  averageWorkMinutes: number;
  completionRate: number;
}

export interface ProcedureTodoStaffProcedureStats {
  staffId: string;
  staffName: string;
  jobTitleId: string;
  jobTitleName: string;
  procedureKey: string;
  procedureName: string;
  totalCount: number;
  todoCount: number;
  doingCount: number;
  doneCount: number;
  workSamples: number;
  totalWorkMinutes: number;
  averageWorkMinutes: number;
  completionRate: number;
}

export interface ProcedureTodoProcedureStats {
  procedureKey: string;
  procedureName: string;
  totalCount: number;
  assignedCount: number;
  todoCount: number;
  doingCount: number;
  doneCount: number;
  workSamples: number;
  totalWorkMinutes: number;
  averageWorkMinutes: number;
  completionRate: number;
}

export interface ProcedureTodoDateStats {
  date: string;
  totalCount: number;
  todoCount: number;
  doingCount: number;
  doneCount: number;
  assignedCount: number;
  unassignedCount: number;
  completionRate: number;
}

export interface ProcedureTodoStatsDashboard {
  branchId: string;
  fromDate: string;
  toDate: string;
  summary: ProcedureTodoStatsSummary;
  byStaff: ProcedureTodoStaffStats[];
  byStaffProcedure: ProcedureTodoStaffProcedureStats[];
  byJob: ProcedureTodoJobStats[];
  byProcedure: ProcedureTodoProcedureStats[];
  byDate: ProcedureTodoDateStats[];
}

export interface ProcedureTodoStatsQuery {
  branchId: string;
  fromDateISO: string;
  toDateISO: string;
}

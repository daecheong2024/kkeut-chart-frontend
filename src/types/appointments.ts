import type { AppointmentStatusKey } from "./settings";

export interface PatientSummary {
  id: string;
  name: string;
  sex?: "M" | "F";
  age?: number;
  phoneMasked?: string; // ***-****-1234
}

export interface AppointmentItem {
  id: string;
  patient: PatientSummary;

  status: AppointmentStatusKey;
  branchId: string;

  startAt: string; // ISO
  createdAt: string; // ISO

  labels: string[]; // ex) ["제모", "초진"]
  note?: string;

  // 시술/권종/포인트: 추후 API 연결
  serviceNames?: string[];
  remainingTickets?: Record<string, number>; // serviceId -> remaining
  remainingPoints?: number;

  // 상태 타임라인(접수/완료 시간 등) - 추후 고도화
  checkedInAt?: string;
  completedAt?: string;
}

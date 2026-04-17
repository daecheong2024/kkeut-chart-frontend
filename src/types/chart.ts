export interface Patient {
    id: number;
    patientId?: number;
    residentNumber?: string;
    address?: string;
    name: string;
    chartNo: string;
    gender: string;
    age: number;
    birthDate?: string;
    phone?: string;
    location: string;
    status: string;
    statusAlertMinutes?: number;
    subStatus?: string;
    time: string;
    visitDate: string;
    checkInAt?: string;
    checkInTime?: string;
    isWalkIn?: boolean;
    lastMovedAt?: Date;
    tags: string[];
    history?: string;
    memo?: string;
    receptionMemo?: string;
    plannedTicketIds?: string[];
    plannedTicketNames?: string[];
    plannedTreatments?: string[];
    isNew?: boolean;
    colorClass?: string;
    treatments?: Treatment[];
    counselor?: string;
    doctor?: string;
    reservCategoryName?: string;
    completedAt?: string;
    isTemporary?: boolean;
    todoItems?: PatientTodoSummary[];
    isLocked?: boolean;
    lockingUserId?: number;
    lockingUserName?: string;
}

export interface Treatment {
    id: string;
    name: string;
    status: 'pending' | 'process' | 'completed';
    assignee?: string;
    assigneeId?: string;
    time?: number;
    startTime?: string;
    endTime?: string;
    memo?: string;
}

export interface PatientTodoSummary {
    id: number;
    content: string;
    status: "todo" | "doing" | "done";
    startedAt?: string;
    startedBy?: string;
    completedAt?: string;
    completedBy?: string;
    createdAt?: string;
}

export interface TaskItem {
    id: string;
    content: string;
    subContent?: string;
    completed: boolean;
    author: string;
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
    'wait': { label: '대기', color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-200' },
    'won_wait': { label: '원상대기', color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
    'consult_wait': { label: '상담대기', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
    'consult_done': { label: '상담완료', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
    'charting': { label: '차팅중', color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
    'won_proc': { label: '원상중', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
    'consult_proc': { label: '상담중', color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200' },
    'hair_wait': { label: '제모대기', color: 'text-pink-600', bgColor: 'bg-pink-50', borderColor: 'border-pink-200' },
    'anesthesia': { label: '마취중', color: 'text-teal-600', bgColor: 'bg-teal-50', borderColor: 'border-teal-200' },
    'proc': { label: '진행중', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
    'done': { label: '시술 완료', color: 'text-gray-500', bgColor: 'bg-gray-100', borderColor: 'border-gray-200' },
};

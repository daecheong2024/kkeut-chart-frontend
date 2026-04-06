import { create } from 'zustand';
import { visitService } from '../services/visitService';
import { reservCategoryService } from '../services/reservCategoryService';

import type { ProcedureCategory } from '../types/settings';
import type { Patient, Treatment } from '../types/chart';
import { mapVisitToPatient, mapReservationToPatient } from '../mappers/patientMapper';

// Re-export domain types for backward compatibility
export type { Patient, Treatment, PatientTodoSummary } from '../types/chart';
export { STATUS_CONFIG } from '../types/chart';

interface ChartState {
    patients: Patient[];
    movePatient: (patientId: number, matchLocationId: string, updates?: Partial<Patient>) => void;
    updatePatientStatus: (patientId: number, status: string, options?: { statusAlertMinutes?: number }) => void;
    // Helper to initialize or reset data if needed
    setPatients: (patients: Patient[]) => void;
    deleteTreatment: (patientId: number, treatmentId: string) => void;

    // Data Fetching
    fetchPatients: (dateISO: string, branchId: string, completionStatusIds?: Set<string>) => Promise<void>;

    // Procedure Categories
    procedureCategories: ProcedureCategory[];
    addCategory: (category: ProcedureCategory) => void;
    updateCategory: (id: string, updates: Partial<ProcedureCategory>) => void;
    reorderCategories: (categories: ProcedureCategory[]) => void;
    deleteCategory: (id: string) => Promise<void>;
    fetchProcedureCategories: () => Promise<void>;
}

const INITIAL_PROCEDURE_CATEGORIES: ProcedureCategory[] = [];

function toDisplayTime(value?: string): string | undefined {
    if (!value) return undefined;
    const raw = String(value).trim();
    if (!raw) return undefined;
    const normalized = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}Z`;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const INITIAL_PATIENTS: Patient[] = [];

export const useChartStore = create<ChartState>((set, get) => ({
    patients: INITIAL_PATIENTS,
    movePatient: (patientId, targetLocationId, updates) => set((state) => {
        const updatedPatients = state.patients.map(p => {
            if (p.id === patientId) {
                const hasExplicitStatus = typeof updates?.status === "string" && updates.status.trim().length > 0;
                let newStatus = hasExplicitStatus ? String(updates?.status) : 'wait';
                let completedAt = p.completedAt;

                if (!hasExplicitStatus && targetLocationId === 'done') {
                    newStatus = 'done';
                    if (!completedAt) {
                        const now = new Date();
                        completedAt = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                    }
                } else if (!hasExplicitStatus && targetLocationId === 'reservation') {
                    newStatus = 'scheduled';
                }

                return {
                    ...p,
                    ...updates, // Apply updates if provided
                    location: targetLocationId,
                    status: newStatus,
                    completedAt: (targetLocationId === 'done' || updates?.completedAt) ? (updates?.completedAt ?? completedAt) : undefined,
                    lastMovedAt: new Date(),
                    visitDate: p.visitDate, // Preserve existing date unless overridden by updates
                    checkInAt: updates?.checkInAt ?? p.checkInAt,
                    checkInTime: updates?.checkInTime ?? toDisplayTime(updates?.checkInAt) ?? p.checkInTime,
                };
            }
            return p;
        });
        return { patients: updatedPatients };
    }),
    setPatients: (patients: Patient[]) => set({ patients }),
    fetchPatients: async (dateISO, branchId, completionStatusIds) => {
        console.log(`[useChartStore] fetchPatients: date=${dateISO}, branch=${branchId}`);
        try {
            const [receptionData, reservationData] = await Promise.all([
                visitService.getVisitsByDate(dateISO, branchId),
                visitService.getReservationsByDate(dateISO, branchId),
            ]);

            const activeReceptions = receptionData.filter((appt: any) => appt.status !== 'cancelled');
            const receptionPatients = activeReceptions.map((appt: any) => mapVisitToPatient(appt, dateISO, completionStatusIds));

            const reservationOnlyPatients = reservationData
                .filter((r: any) => !r.isNoShow && !r.cancelReason && !r.isCheckedIn && !r.isCancelled)
                .map((r: any) => mapReservationToPatient(r, dateISO));

            const allPatients = [...receptionPatients, ...reservationOnlyPatients];
            console.log(`[useChartStore] Receptions: ${receptionPatients.length}, Reservations: ${reservationOnlyPatients.length}, Total: ${allPatients.length}`);
            set({ patients: allPatients });
        } catch (error) {
            console.error("Failed to load appointments:", error);
        }
    },
    updatePatientStatus: (patientId: number, status: string, options?: { statusAlertMinutes?: number }) => set((state) => ({
        patients: state.patients.map(p => p.id === patientId ? {
            ...p,
            status,
            statusAlertMinutes: options?.statusAlertMinutes,
            lastMovedAt: new Date() // [UPDATED] Reset timer on status change
        } : p)
    })),
    toggleTreatment: (patientId: number, treatmentId: string) => set((state) => ({
        patients: state.patients.map(p => {
            if (p.id === patientId && p.treatments) {
                return {
                    ...p,
                    treatments: p.treatments.map(t => {
                        if (t.id === treatmentId) {
                            const nextStatus = t.status === 'pending' ? 'process' :
                                t.status === 'process' ? 'completed' : 'pending';
                            return { ...t, status: nextStatus };
                        }
                        return t;
                    })
                };
            }
            return p;
        })
    })),
    updateTreatment: (patientId: number, treatmentId: string, updates: Partial<Treatment>) => set((state) => ({
        patients: state.patients.map(p => {
            if (p.id === patientId && p.treatments) {
                return {
                    ...p,
                    treatments: p.treatments.map(t => t.id === treatmentId ? { ...t, ...updates } : t)
                };
            }
            return p;
        })
    })),
    deleteTreatment: (patientId: number, treatmentId: string) => set((state) => ({
        patients: state.patients.map(p => {
            if (p.id === patientId && p.treatments) {
                return {
                    ...p,
                    treatments: p.treatments.filter(t => t.id !== treatmentId)
                };
            }
            return p;
        })
    })),

    // --- Procedure Category Actions ---
    procedureCategories: INITIAL_PROCEDURE_CATEGORIES,
    fetchProcedureCategories: async () => {
        try {
            const categories = await reservCategoryService.getAll();
            set({ procedureCategories: categories });
        } catch (error) {
            console.error('Failed to fetch procedure categories:', error);
        }
    },
    addCategory: async (category) => {
        try {
            const created = await reservCategoryService.create(category);
            set({ procedureCategories: [...get().procedureCategories, created] });
        } catch (error) {
            console.error('Failed to save category:', error);
        }
    },
    updateCategory: async (id, updates) => {
        try {
            const merged = { ...get().procedureCategories.find(c => c.id === id), ...updates } as ProcedureCategory;
            const updated = await reservCategoryService.update(id, merged);
            set({ procedureCategories: get().procedureCategories.map(c => c.id === id ? updated : c) });
        } catch (error) {
            console.error('Failed to save category update:', error);
        }
    },
    reorderCategories: async (categories) => {
        const normalized = (categories || []).map((c, idx) => ({ ...c, order: idx + 1 }));
        set({ procedureCategories: normalized });
    },
    deleteCategory: async (id) => {
        try {
            await reservCategoryService.delete(id);
            set({ procedureCategories: get().procedureCategories.filter(c => c.id !== id) });
        } catch (error) {
            console.error('Failed to delete category:', error);
        }
    },
}));

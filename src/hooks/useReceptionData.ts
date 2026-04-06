import { useState, useEffect } from 'react';
import { patientService, PatientDetail } from '../services/patientService';
import { visitService } from '../services/visitService';
import { patientRecordService } from '../services/patientRecordService';
import { paymentService } from '../services/paymentService';
import { memberConfigService } from '../services/memberConfigService';

interface UseReceptionDataOptions {
    patientId: number;
    customerId: number;
    branchId: string;
    receptionDoctorJobTitleIds?: string[];
}

export function useReceptionData(options: UseReceptionDataOptions) {
    const { patientId, customerId, branchId, receptionDoctorJobTitleIds } = options;

    const [patientDetail, setPatientDetail] = useState<PatientDetail | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [upcoming, setUpcoming] = useState<any[]>([]);
    const [currentVisit, setCurrentVisit] = useState<any | null>(null);
    const [keyRecords, setKeyRecords] = useState<any[]>([]);
    const [totalPayment, setTotalPayment] = useState(0);
    const [doctorCandidates, setDoctorCandidates] = useState<Array<{ id: string; name: string; jobTitleName?: string }>>([]);

    // Load doctors
    useEffect(() => {
        const branchIdNum = Number(branchId);
        if (!Number.isFinite(branchIdNum) || branchIdNum <= 0) {
            setDoctorCandidates([]);
            return;
        }

        const load = async () => {
            try {
                const [members, jobTitles] = await Promise.all([
                    memberConfigService.getMembers(branchIdNum),
                    memberConfigService.getJobTitles(),
                ]);

                const jobTitleMap = new Map<string, string>(
                    (jobTitles || []).map((job: any) => [String(job.id), String(job.name || "")])
                );
                const allowedJobIds = receptionDoctorJobTitleIds || [];
                const filtered = (members || []).filter((member: any) => {
                    if (member?.isApproved === false) return false;
                    const jobId = String(member?.jobTitleId || "");
                    if (allowedJobIds.length > 0) return jobId && allowedJobIds.includes(jobId);
                    return true;
                });

                setDoctorCandidates(filtered.map((member: any) => {
                    const jobId = String(member?.jobTitleId || "");
                    return {
                        id: String(member.id),
                        name: String(member.name || ""),
                        jobTitleName: jobTitleMap.get(jobId) || undefined,
                    };
                }));
            } catch (error) {
                console.error("Failed to load reception doctors", error);
                setDoctorCandidates([]);
            }
        };

        void load();
    }, [branchId, receptionDoctorJobTitleIds]);

    // Load patient data
    useEffect(() => {
        if (!Number.isFinite(customerId) || customerId <= 0) return;

        patientService.getById(customerId)
            .then(detail => { if (detail) setPatientDetail(detail); })
            .catch(err => console.error("Failed to fetch patient detail", err));

        visitService.getByPatientId(customerId)
            .then(data => {
                if (!data || !Array.isArray(data)) {
                    setHistory([]);
                    setUpcoming([]);
                    setCurrentVisit(null);
                    return;
                }
                const now = new Date();
                const past: any[] = [];
                const future: any[] = [];
                const resolveDate = (v: any) => v.scheduledAt || v.reservationDateTime || v.registerTime;
                data.forEach(v => {
                    const raw = resolveDate(v);
                    const vDate = raw ? new Date(raw) : new Date(0);
                    if (Number.isNaN(vDate.getTime())) return;
                    (vDate < now ? past : future).push({ ...v, scheduledAt: raw });
                });
                setHistory(past.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()));
                setUpcoming(future.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()));
                setCurrentVisit(data.find((v: any) => Number(v.id) === patientId) || null);
            });

        patientRecordService.getByPatientId(customerId)
            .then(data => {
                if (!data || !Array.isArray(data)) { setKeyRecords([]); return; }
                const records = [...data]
                    .filter((r: any) => String(r?.content || "").trim().length > 0)
                    .sort((a: any, b: any) => {
                        const pinDiff = Number(Boolean(b?.isPinned)) - Number(Boolean(a?.isPinned));
                        if (pinDiff !== 0) return pinDiff;
                        return new Date(String(b?.createdAt || 0)).getTime() - new Date(String(a?.createdAt || 0)).getTime();
                    })
                    .slice(0, 12);
                setKeyRecords(records);
            })
            .catch(err => console.error("Failed to load patient records", err));

        paymentService.listByPatient(customerId)
            .then((rows) => {
                const totalPaid = (rows || []).reduce((sum, row: any) => {
                    const status = String(row?.status ?? "paid").trim().toLowerCase();
                    if (status === "refunded" || status === "cancelled") return sum;
                    return sum + Number(row?.amount || 0);
                }, 0);
                setTotalPayment(totalPaid);
            })
            .catch(() => setTotalPayment(0));
    }, [patientId, customerId]);

    return {
        patientDetail,
        history,
        upcoming,
        currentVisit,
        keyRecords,
        totalPayment,
        doctorCandidates,
    };
}

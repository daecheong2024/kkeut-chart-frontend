import { differenceInYears } from 'date-fns';
import type { Patient } from '../types/chart';

function normalizeCheckInAt(value?: string): string | undefined {
    if (!value) return undefined;
    const raw = String(value).trim();
    if (!raw) return undefined;
    return raw;
}

function toDisplayTime(value?: string): string | undefined {
    const normalized = normalizeCheckInAt(value);
    if (!normalized) return undefined;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function resolveLastMovedAt(appt: any): Date {
    const minValid = new Date('2024-01-01').getTime();
    const candidates = [
        appt.lastStatusChangedTime,
        appt.statusUpdatedAt,
        appt.modifiedAt,
        appt.modifyTime,
        appt.createdAt,
        appt.createTime,
        appt.registerTime,
    ];
    for (const raw of candidates) {
        if (!raw) continue;
        const ts = new Date(raw).getTime();
        if (ts > minValid) return new Date(ts);
    }
    return new Date();
}

function calcAge(birthDate?: string): number {
    if (!birthDate) return 0;
    try {
        const dt = new Date(birthDate);
        if (isNaN(dt.getTime())) return 0;
        return differenceInYears(new Date(), dt);
    } catch {
        return 0;
    }
}

export function mapVisitToPatient(appt: any, dateISO: string, completionStatusIds?: Set<string>): Patient {
    const checkInAtRaw = appt.checkInAt || appt.checkedInAt || appt.registerTime || undefined;
    const checkInAtNormalized = normalizeCheckInAt(checkInAtRaw);

    let timeStr: string | undefined;
    const scheduledRaw = appt.reservationDateTime || appt.scheduledAt;
    if (scheduledRaw) {
        const dt = new Date(scheduledRaw);
        if (!isNaN(dt.getTime())) {
            timeStr = dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
    }

    const status = String(appt.currentStatusId || appt.currentStatusName || appt.status || 'wait');
    const normalizedStatus = status.toLowerCase();
    const inferredLocation = appt.currentLocationId
        || appt.room
        || (normalizedStatus === 'reserved' || normalizedStatus === 'scheduled' || normalizedStatus === 'reservation'
            ? 'reservation'
            : 'reception');

    return {
        id: appt.id,
        patientId: appt.customerId,
        name: appt.customerName || appt.name || '이름없음',
        chartNo: appt.chartNumber || `${appt.customerId}`,
        gender: appt.customerGender || appt.gender || 'M',
        age: calcAge(appt.customerBirthDate || appt.birthDate),
        birthDate: appt.customerBirthDate || appt.birthDate || undefined,
        phone: appt.customerTelNo || appt.phone,
        location: inferredLocation,
        status,
        statusAlertMinutes: typeof appt.statusAlertMinutes === "number" ? appt.statusAlertMinutes : undefined,
        time: timeStr,
        visitDate: dateISO,
        checkInAt: checkInAtNormalized,
        checkInTime: toDisplayTime(checkInAtNormalized),
        isWalkIn: typeof appt.isWalkIn === "boolean" ? appt.isWalkIn : undefined,
        lastMovedAt: resolveLastMovedAt(appt),
        tags: appt.tags || appt.labels || [],
        memo: appt.customerMemos || appt.memo,
        receptionMemo: appt.memo,
        plannedTicketIds: Array.isArray(appt.plannedTicketIds) ? appt.plannedTicketIds.map(String) : undefined,
        plannedTicketNames: Array.isArray(appt.plannedTicketNames) ? appt.plannedTicketNames.map(String) : undefined,
        plannedTreatments: Array.isArray(appt.plannedTreatments) ? appt.plannedTreatments.map(String) : undefined,
        doctor: appt.doctorName || appt.doctor || appt.consultation?.doctor,
        counselor: appt.counselorName || appt.consultation?.counselor,
        reservCategoryName: appt.reservCategoryName || appt.categoryName,
        completedAt: (normalizedStatus === 'done' || normalizedStatus === 'completed' || completionStatusIds?.has(status)) ? toDisplayTime(appt.lastStatusChangedTime) : undefined,
        isLocked: !!appt.isLocked,
        lockingUserId: appt.lockingUserId ?? undefined,
        lockingUserName: appt.lockingUserName ?? undefined,
    };
}

export function mapReservationToPatient(resv: any, dateISO: string): Patient {
    let timeStr = '09:00';
    if (resv.reservDateTime) {
        const dt = new Date(resv.reservDateTime);
        if (!isNaN(dt.getTime())) {
            timeStr = dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
    }

    return {
        id: resv.id,
        patientId: resv.customerId,
        name: resv.customerName || '이름없음',
        chartNo: resv.chartNumber || `${resv.customerId}`,
        gender: resv.customerGender || 'M',
        age: calcAge(resv.customerBirthDate),
        phone: resv.customerTelNo,
        location: 'reservation',
        status: 'reserved',
        time: timeStr,
        visitDate: dateISO,
        lastMovedAt: resv.modifyTime ? new Date(resv.modifyTime) : resv.createTime ? new Date(resv.createTime) : new Date(),
        tags: resv.tags || [],
        memo: resv.reservationMemo,
        reservCategoryName: resv.reservCategoryName,
        plannedTicketIds: Array.isArray(resv.plannedTickets)
            ? resv.plannedTickets.map((pt: any) => String(pt.ticketId))
            : undefined,
        plannedTicketNames: Array.isArray(resv.plannedTickets)
            ? resv.plannedTickets.map((pt: any) => String(pt.ticketName))
            : undefined,
    };
}

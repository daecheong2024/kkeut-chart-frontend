export const SIGNALR_EVENTS = {
    NOTICE: 'notice',
    TODAYWORK: 'todaywork',
    RESERVATION: 'reservation',
    RECEPTION: 'reception',
    PATIENT_LOCATION: 'patient_location',
    PATIENT_STATUS: 'patient_status',
    ALARM: 'alarm',
    PROCEDURE_STATUS: 'procedure_status',
    CHART_LOCK: 'chart_lock',
    NOTICE_PERSONAL: 'notice_personal',
    PAYMENT: 'payment',
    STATISTICS: 'statistics',
    CHART_SETTING: 'chart_setting',
    AUTHORITY_UPDATE: 'authority_update',
} as const;

export type SignalREventName = (typeof SIGNALR_EVENTS)[keyof typeof SIGNALR_EVENTS];

export const VIEW_EVENT_MAP: Record<string, SignalREventName[]> = {
    chart: [
        SIGNALR_EVENTS.RECEPTION,
        SIGNALR_EVENTS.RESERVATION,
        SIGNALR_EVENTS.PATIENT_LOCATION,
        SIGNALR_EVENTS.PATIENT_STATUS,
        SIGNALR_EVENTS.CHART_LOCK,
        SIGNALR_EVENTS.PAYMENT,
        SIGNALR_EVENTS.TODAYWORK,
        SIGNALR_EVENTS.PROCEDURE_STATUS,
        SIGNALR_EVENTS.CHART_SETTING,
        SIGNALR_EVENTS.AUTHORITY_UPDATE,
    ],
    board: [
        SIGNALR_EVENTS.RECEPTION,
        SIGNALR_EVENTS.PATIENT_LOCATION,
        SIGNALR_EVENTS.PATIENT_STATUS,
        SIGNALR_EVENTS.CHART_SETTING,
        SIGNALR_EVENTS.AUTHORITY_UPDATE,
    ],
    reservation: [
        SIGNALR_EVENTS.RESERVATION,
        SIGNALR_EVENTS.CHART_SETTING,
        SIGNALR_EVENTS.AUTHORITY_UPDATE,
    ],
    procedure: [
        SIGNALR_EVENTS.PROCEDURE_STATUS,
        SIGNALR_EVENTS.PATIENT_LOCATION,
        SIGNALR_EVENTS.PATIENT_STATUS,
        SIGNALR_EVENTS.STATISTICS,
        SIGNALR_EVENTS.CHART_SETTING,
        SIGNALR_EVENTS.AUTHORITY_UPDATE,
    ],
};

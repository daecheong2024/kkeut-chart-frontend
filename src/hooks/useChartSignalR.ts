import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { getAuthToken, getActiveBranchId } from '../lib/storage';
import type { SignalREventName } from '../config/signalrEvents';
import { chartConfigService } from '../services/chartConfigService';
import { useSettingsStore } from '../stores/useSettingsStore';
import { usePermissionStore } from '../stores/usePermissionStore';

function getCurrentUserIdFromToken(): number | null {
    const token = getAuthToken();
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        const raw = payload.nameid
            ?? payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
            ?? payload.sub;
        if (raw == null) return null;
        const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function extractInvokerUserId(data: any): number | null {
    if (data == null) return null;
    const raw = data.InvokerUserId ?? data.invokerUserId;
    if (raw == null) return null;
    const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
    return Number.isFinite(n) ? n : null;
}

function isSelfEcho(data: any): boolean {
    const invoker = extractInvokerUserId(data);
    if (invoker == null) return false;
    const self = getCurrentUserIdFromToken();
    if (self == null) return false;
    return invoker === self;
}

function resolveHubUrl(): string {
    const explicitHubUrl = (import.meta.env.VITE_SIGNALR_HUB_URL as string | undefined)?.trim();
    if (explicitHubUrl) {
        return explicitHubUrl;
    }

    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
    if (apiBaseUrl) {
        const normalized = apiBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
        return `${normalized}/signalr/crm`;
    }

    return '/signalr/crm';
}

const HUB_URL = resolveHubUrl();

interface VisitUpdatedEvent {
    visitId: number;
    status?: string;
    room?: string;
    updatedAt: string;
}

interface VisitDeletedEvent {
    visitId: number;
}

export interface SignalREventData {
    chartId?: number;
    customerId?: number;
    eventType?: string;
    mode?: string;
    chartIds?: number[];
    userId?: number;
    userName?: string;
    isLocked?: boolean;
    actionType?: string;
    ticketId?: number;
    membershipId?: number;
    cartItemId?: number;
    memoId?: number;
}

interface UseChartSignalROptions {
    onVisitCreated?: (visit: any) => void;
    onVisitUpdated?: (event: VisitUpdatedEvent) => void;
    onVisitDeleted?: (event: VisitDeletedEvent) => void;
    onRefreshRequired?: () => void;
    onEventData?: (data: SignalREventData) => void;
    enabled?: boolean;
    events?: SignalREventName[];
}

type HandlerSet = Required<Pick<UseChartSignalROptions, 'onVisitCreated' | 'onVisitUpdated' | 'onVisitDeleted' | 'onRefreshRequired' | 'onEventData'>>;

let sharedConnection: signalR.HubConnection | null = null;
let subscriberCount = 0;
let connectingPromise: Promise<void> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<React.MutableRefObject<HandlerSet>>();
let currentJoinedEvents: SignalREventName[] = [];

let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function notifyAll(method: keyof HandlerSet, ...args: any[]) {
    const refreshMethods: (keyof HandlerSet)[] = ['onRefreshRequired', 'onVisitCreated', 'onVisitUpdated', 'onVisitDeleted'];
    if (refreshMethods.includes(method)) {
        if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
        refreshDebounceTimer = setTimeout(() => {
            refreshDebounceTimer = null;
            subscribers.forEach(ref => {
                const handler = ref.current[method];
                if (handler) (handler as Function)(...args);
            });
        }, 300);
        return;
    }
    subscribers.forEach(ref => {
        const handler = ref.current[method];
        if (handler) (handler as Function)(...args);
    });
}

async function invokeJoinEvents(connection: signalR.HubConnection, events: string[]) {
    if (connection.state !== signalR.HubConnectionState.Connected || events.length === 0) return;
    try {
        await connection.invoke('JoinEvents', events);
        console.log('[SignalR] JoinEvents:', events);
    } catch (err) {
        console.warn('[SignalR] JoinEvents failed:', err);
    }
}

async function invokeLeaveEvents(connection: signalR.HubConnection, events: string[]) {
    if (connection.state !== signalR.HubConnectionState.Connected || events.length === 0) return;
    try {
        await connection.invoke('LeaveEvents', events);
        console.log('[SignalR] LeaveEvents:', events);
    } catch (err) {
        console.warn('[SignalR] LeaveEvents failed:', err);
    }
}

function buildConnection(): signalR.HubConnection {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL, {
            accessTokenFactory: () => getAuthToken() || '',
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

    connection.on('VisitCreated', (visit) => notifyAll('onVisitCreated', visit));
    connection.on('VisitUpdated', (event: VisitUpdatedEvent) => notifyAll('onVisitUpdated', event));
    connection.on('VisitDeleted', (event: VisitDeletedEvent) => notifyAll('onVisitDeleted', event));
    connection.on('RefreshRequired', () => notifyAll('onRefreshRequired'));

    connection.on('ReceivePersonalNotification', () => {});
    connection.on('ReceiveBranchNotice', () => notifyAll('onRefreshRequired'));
    connection.on('ReceiveReservationUpdate', () => notifyAll('onRefreshRequired'));

    connection.on('ReceiveReceptionCreated', (_message: string, data: any) => {
        notifyAll('onVisitCreated', data);
        if (data?.ChartId || data?.chartId) notifyAll('onEventData', { chartId: data.ChartId ?? data.chartId, customerId: data.CustomerId ?? data.customerId, eventType: 'reception_created' });
    });

    connection.on('ReceiveReceptionDeleted', (_message: string, data: any) => {
        notifyAll('onVisitDeleted', data);
        if (data?.ChartId || data?.chartId) notifyAll('onEventData', { chartId: data.ChartId ?? data.chartId, customerId: data.CustomerId ?? data.customerId, eventType: 'reception_deleted' });
    });

    connection.on('ReceiveTodoUpdate', (_message: string, data: any) => {
        notifyAll('onRefreshRequired');
        if (data?.ChartId || data?.chartId) notifyAll('onEventData', { chartId: data.ChartId ?? data.chartId, eventType: 'todo_update' });
    });
    connection.on('ReceiveChartLockChanged', (_message: string, data: any) => {
        notifyAll('onRefreshRequired');
        notifyAll('onEventData', {
            eventType: 'chart_lock',
            customerId: data?.CustomerId ?? data?.customerId,
            chartIds: data?.ChartIds ?? data?.chartIds,
            mode: data?.Mode ?? data?.mode,
            userId: data?.UserId ?? data?.userId,
            userName: data?.UserName ?? data?.userName,
            isLocked: data?.IsLocked ?? data?.isLocked,
        });
    });
    connection.on('ReceiveProcedureStatusChanged', (_message: string, data: any) => {
        notifyAll('onEventData', {
            eventType: 'procedure_status',
            chartId: data?.ChartId ?? data?.chartId,
            customerId: data?.CustomerId ?? data?.customerId,
            procedureId: data?.ProcedureId ?? data?.procedureId,
            status: data?.Status ?? data?.status,
            startTime: data?.StartTime ?? data?.startTime,
            endTime: data?.EndTime ?? data?.endTime,
            managedByUserId: data?.ManagedByUserId ?? data?.managedByUserId,
            managedByUserName: data?.ManagedByUserName ?? data?.managedByUserName,
        });
    });
    connection.on('ReceiveStatisticsUpdate', (_message: string, data: any) => {
        notifyAll('onEventData', {
            eventType: 'statistics',
            summary: data?.Summary ?? data?.summary,
        });
    });
    connection.on('ReceiveCustomerStatusChanged', (_message: string, data: any) => {
        notifyAll('onRefreshRequired');
        if (data?.ChartId || data?.chartId) notifyAll('onEventData', { chartId: data.ChartId ?? data.chartId, customerId: data.CustomerId ?? data.customerId, eventType: 'status_changed' });
    });
    connection.on('ReceiveCustomerLocationChanged', (_message: string, data: any) => {
        notifyAll('onRefreshRequired');
        if (data?.ChartId || data?.chartId) notifyAll('onEventData', { chartId: data.ChartId ?? data.chartId, customerId: data.CustomerId ?? data.customerId, eventType: 'location_changed' });
    });
    connection.on('ReceivePaymentCompleted', (_message: string, data: any) => {
        if (isSelfEcho(data)) return;
        notifyAll('onRefreshRequired');
        const actionType = data?.ActionType ?? data?.actionType ?? 'PaymentCompleted';
        notifyAll('onEventData', {
            chartId: data?.ChartId ?? data?.chartId,
            customerId: data?.CustomerId ?? data?.customerId,
            eventType: 'payment_completed',
            actionType,
        } as any);
    });

    connection.on('ReceiveTicketUsed', (_message: string, data: any) => {
        if (isSelfEcho(data)) return;
        notifyAll('onRefreshRequired');
        notifyAll('onEventData', {
            eventType: 'ticket_used',
            customerId: data?.CustomerId ?? data?.customerId,
            ticketId: data?.TicketId ?? data?.ticketId,
            membershipId: data?.MembershipId ?? data?.membershipId,
            actionType: data?.ActionType ?? data?.actionType,
        } as any);
    });

    connection.on('ReceiveCartUpdated', (_message: string, data: any) => {
        if (isSelfEcho(data)) return;
        notifyAll('onRefreshRequired');
        notifyAll('onEventData', {
            eventType: 'cart_updated',
            customerId: data?.CustomerId ?? data?.customerId,
            chartId: data?.VisitId ?? data?.visitId,
            cartItemId: data?.CartItemId ?? data?.cartItemId,
            actionType: data?.ActionType ?? data?.actionType,
        } as any);
    });

    connection.on('ReceiveCustomerUpdated', (_message: string, data: any) => {
        if (isSelfEcho(data)) return;
        notifyAll('onRefreshRequired');
        notifyAll('onEventData', {
            eventType: 'customer_updated',
            customerId: data?.CustomerId ?? data?.customerId,
            actionType: data?.ActionType ?? data?.actionType,
        } as any);
    });

    connection.on('ReceiveMemoUpdated', (_message: string, data: any) => {
        if (isSelfEcho(data)) return;
        notifyAll('onRefreshRequired');
        notifyAll('onEventData', {
            eventType: 'memo_updated',
            customerId: data?.CustomerId ?? data?.customerId,
            memoId: data?.MemoId ?? data?.memoId,
            actionType: data?.ActionType ?? data?.actionType,
        } as any);
    });

    connection.on('ReceiveChartUpdated', (_message: string, data: any) => {
        if (isSelfEcho(data)) return;
        notifyAll('onRefreshRequired');
        notifyAll('onEventData', {
            eventType: 'chart_updated',
            customerId: data?.CustomerId ?? data?.customerId,
            chartId: data?.ChartId ?? data?.chartId,
            actionType: data?.ActionType ?? data?.actionType,
        } as any);
    });
    connection.on('ReceiveChartSettingUpdate', () => {
        notifyAll('onEventData', { eventType: 'chart_setting_updated' });
        const branchId = getActiveBranchId();
        chartConfigService.get(branchId).then((config) => {
            if (config) {
                useSettingsStore.getState().updateSettings({ chartConfig: config as any });
            }
        }).catch(() => {});
        notifyAll('onRefreshRequired');
    });
    connection.on('ReceiveAuthorityUpdate', () => {
        notifyAll('onEventData', { eventType: 'authority_updated' });
        usePermissionStore.getState().clearPermissions();
        const branchId = getActiveBranchId();
        const authRaw = sessionStorage.getItem('kkeut_chart_auth_v1');
        const email = authRaw ? (JSON.parse(authRaw)?.userEmail || '') : '';
        if (branchId && email) {
            usePermissionStore.getState().loadPermissions(branchId, email);
        }
    });

    connection.onclose(() => {
        console.warn('[SignalR] Connection closed');
        currentJoinedEvents = [];
    });

    connection.onreconnecting((error) => {
        console.warn('[SignalR] Reconnecting...', error);
    });

    connection.onreconnected(async (connectionId) => {
        console.log('[SignalR] Reconnected with ID:', connectionId);
        if (currentJoinedEvents.length > 0) {
            await invokeJoinEvents(connection, currentJoinedEvents);
        }
        notifyAll('onRefreshRequired');
    });

    return connection;
}

async function acquireConnection(): Promise<void> {
    subscriberCount++;

    if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
    }

    if (sharedConnection?.state === signalR.HubConnectionState.Connected) {
        return;
    }

    if (connectingPromise) {
        return connectingPromise;
    }

    connectingPromise = (async () => {
        try {
            if (sharedConnection) {
                await sharedConnection.stop().catch(() => {});
            }

            sharedConnection = buildConnection();
            await sharedConnection.start();
            console.log('[SignalR] Connected to ChartHub');
        } catch (error) {
            console.error('[SignalR] Connection failed:', error);
            sharedConnection = null;
        } finally {
            connectingPromise = null;
        }
    })();

    return connectingPromise;
}

function releaseConnection(): void {
    subscriberCount = Math.max(0, subscriberCount - 1);

    if (subscriberCount === 0) {
        releaseTimer = setTimeout(async () => {
            releaseTimer = null;
            if (subscriberCount === 0 && sharedConnection) {
                const conn = sharedConnection;
                sharedConnection = null;
                connectingPromise = null;
                currentJoinedEvents = [];
                await conn.stop().catch(() => {});
                console.log('[SignalR] Disconnected (no subscribers)');
            }
        }, 200);
    }
}

const noop = () => {};

export function useChartSignalR(options: UseChartSignalROptions) {
    const {
        onVisitCreated,
        onVisitUpdated,
        onVisitDeleted,
        onRefreshRequired,
        onEventData,
        enabled = true,
        events,
    } = options;

    const handlersRef = useRef<HandlerSet>({
        onVisitCreated: onVisitCreated || noop,
        onVisitUpdated: onVisitUpdated || noop,
        onVisitDeleted: onVisitDeleted || noop,
        onRefreshRequired: onRefreshRequired || noop,
        onEventData: onEventData || noop,
    });

    const eventsKey = events?.slice().sort().join(',') ?? '';

    useEffect(() => {
        handlersRef.current = {
            onVisitCreated: onVisitCreated || noop,
            onVisitUpdated: onVisitUpdated || noop,
            onVisitDeleted: onVisitDeleted || noop,
            onRefreshRequired: onRefreshRequired || noop,
            onEventData: onEventData || noop,
        };
    }, [onVisitCreated, onVisitUpdated, onVisitDeleted, onRefreshRequired, onEventData]);

    useEffect(() => {
        if (!enabled) return;

        subscribers.add(handlersRef);
        acquireConnection().then(() => {
            if (events && events.length > 0 && sharedConnection) {
                const toJoin = events.filter(e => !currentJoinedEvents.includes(e));
                if (toJoin.length > 0) {
                    currentJoinedEvents = [...new Set([...currentJoinedEvents, ...events])];
                    invokeJoinEvents(sharedConnection, toJoin);
                }
            }
        });

        return () => {
            subscribers.delete(handlersRef);
            if (events && events.length > 0 && sharedConnection) {
                const toLeave = events.filter(e => currentJoinedEvents.includes(e));
                currentJoinedEvents = currentJoinedEvents.filter(e => !toLeave.includes(e));
                if (toLeave.length > 0) {
                    invokeLeaveEvents(sharedConnection, toLeave);
                }
            }
            releaseConnection();
        };
    }, [enabled, eventsKey]);

    return {
        isConnected: sharedConnection?.state === signalR.HubConnectionState.Connected,
        connection: sharedConnection
    };
}

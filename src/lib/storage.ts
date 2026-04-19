const KEYS = {
  AUTH: 'kkeut_chart_auth_v1',
  AUTH_TOKEN: 'auth_token',
  SETTINGS: 'kkeut_chart_settings_v2',
  PAYMENT_OPERATIONS: 'kkeut_chart_payment_operations_v1',
} as const;

export interface StoredPaymentOperationContext {
  operationKey: string;
  operationType: string;
  patientId?: number;
  paymentMasterId?: number;
  originPaymentDetailId?: number;
  membershipRootId?: number;
  status?: string;
  nextAction?: string;
  summaryMessage?: string;
  updatedAt: string;
}

// --- Auth ---

export function getAuthToken(): string | null {
  return sessionStorage.getItem(KEYS.AUTH_TOKEN);
}

export function getRefreshToken(): string | null {
  try {
    const raw = sessionStorage.getItem(KEYS.AUTH);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.refreshToken || null;
  } catch {
    return null;
  }
}

export function getAuthData(): {
  userEmail: string;
  userName: string;
  userRole: string;
  branchId: string;
  token: string;
  refreshToken: string;
} | null {
  try {
    const raw = sessionStorage.getItem(KEYS.AUTH);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuthData(data: {
  userEmail: string;
  userName: string;
  userRole: string;
  branchId: string;
  token: string;
  refreshToken: string;
}): void {
  sessionStorage.setItem(KEYS.AUTH, JSON.stringify(data));
  sessionStorage.setItem(KEYS.AUTH_TOKEN, data.token);
}

export function clearAuthData(): void {
  sessionStorage.removeItem(KEYS.AUTH);
  sessionStorage.removeItem(KEYS.AUTH_TOKEN);
}

// --- Settings ---

export function getActiveBranchId(): string {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    if (!raw) return '1';
    const parsed = JSON.parse(raw);
    return parsed.activeBranchId || '1';
  } catch {
    return '1';
  }
}

export function getSettingsRaw<T = any>(): T | null {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setSettingsRaw(data: any): void {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data));
}

function readPaymentOperationContexts(): StoredPaymentOperationContext[] {
  try {
    const raw = sessionStorage.getItem(KEYS.PAYMENT_OPERATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePaymentOperationContexts(items: StoredPaymentOperationContext[]): void {
  sessionStorage.setItem(KEYS.PAYMENT_OPERATIONS, JSON.stringify(items));
}

export function upsertPaymentOperationContext(context: Omit<StoredPaymentOperationContext, "updatedAt"> & { updatedAt?: string }): void {
  const items = readPaymentOperationContexts().filter((item) => item.operationKey !== context.operationKey);
  items.unshift({
    ...context,
    updatedAt: context.updatedAt || new Date().toISOString(),
  });
  writePaymentOperationContexts(items.slice(0, 20));
}

export function removePaymentOperationContext(operationKey: string): void {
  if (!operationKey) return;
  const items = readPaymentOperationContexts().filter((item) => item.operationKey !== operationKey);
  writePaymentOperationContexts(items);
}

export function getPaymentOperationContext(operationKey: string): StoredPaymentOperationContext | null {
  if (!operationKey) return null;
  return readPaymentOperationContexts().find((item) => item.operationKey === operationKey) || null;
}

export function findPaymentOperationContextByMaster(paymentMasterId: number, operationType?: string): StoredPaymentOperationContext | null {
  if (!Number.isFinite(paymentMasterId) || paymentMasterId <= 0) return null;
  return readPaymentOperationContexts().find((item) =>
    item.paymentMasterId === paymentMasterId
    && (!operationType || item.operationType === operationType)
  ) || null;
}

export function findPaymentOperationContextsByPatient(patientId: number, operationType?: string): StoredPaymentOperationContext[] {
  if (!Number.isFinite(patientId) || patientId <= 0) return [];
  return readPaymentOperationContexts().filter((item) =>
    item.patientId === patientId
    && (!operationType || item.operationType === operationType)
  );
}

export const STORAGE_KEYS = KEYS;

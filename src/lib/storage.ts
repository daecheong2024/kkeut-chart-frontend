const KEYS = {
  AUTH: 'kkeut_chart_auth_v1',
  AUTH_TOKEN: 'auth_token',
  SETTINGS: 'kkeut_chart_settings_v2',
} as const;

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

export const STORAGE_KEYS = KEYS;

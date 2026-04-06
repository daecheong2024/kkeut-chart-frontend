import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAuthToken, getActiveBranchId, getRefreshToken, setAuthData, getAuthData, clearAuthData } from '../lib/storage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const branchId = getActiveBranchId();
    if (branchId) {
      config.headers['X-Branch-Id'] = branchId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

let _isRefreshing = false;
let _failedQueue: { resolve: (token: string) => void; reject: (err: any) => void }[] = [];

const processQueue = (error: any, token: string | null) => {
  _failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  _failedQueue = [];
};

const SKIP_REFRESH_URLS = ['/auth/login', '/auth/refresh', '/auth/logout'];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isSkipUrl = SKIP_REFRESH_URLS.some(url => originalRequest?.url?.includes(url));
    if (error.response?.status !== 401 || isSkipUrl || originalRequest?._retry) {
      return Promise.reject(error);
    }

    const refreshToken = getRefreshToken();
    const accessToken = getAuthToken();

    if (!refreshToken || !accessToken) {
      await forceLogout();
      return Promise.reject(error);
    }

    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _failedQueue.push({
          resolve: (newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    _isRefreshing = true;

    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        accessToken,
        refreshToken,
      });

      const authData = getAuthData();
      const newAuthData = {
        userEmail: authData?.userEmail || '',
        userName: data.name || authData?.userName || '',
        userRole: data.role || authData?.userRole || '',
        branchId: data.branchId ? String(data.branchId) : (authData?.branchId || ''),
        token: data.accessToken,
        refreshToken: data.refreshToken,
      };
      setAuthData(newAuthData);

      const { useAuthStore } = await import('../stores/useAuthStore');
      useAuthStore.setState({
        token: data.accessToken,
        refreshToken: data.refreshToken,
      });

      processQueue(null, data.accessToken);

      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await forceLogout();
      return Promise.reject(refreshError);
    } finally {
      _isRefreshing = false;
    }
  }
);

async function forceLogout() {
  try {
    const { useAuthStore } = await import('../stores/useAuthStore');
    await useAuthStore.getState().logout();
  } catch {
    clearAuthData();
  }
  window.location.href = '/login';
}

export default apiClient;

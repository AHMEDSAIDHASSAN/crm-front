import axios from "axios";
import Store from "../redux/Store";
import { logout } from "../redux/UserSlice";
import type { LoginRequest } from "../Interfaces/auth";
import type { createAnnouncementI, updateAnnouncementI } from "../Interfaces/announcement";
import type { createQuizI, updateQuizI } from "../Interfaces/quiz";

/**
 * - Dev: prefer VITE_API_URL=/api so Vite proxies to Nest (see vite.config.ts). Avoids calling an old remote API by mistake.
 * - Prod (Vercel): VITE_API_URL=/api → rewrites to your VPS; deploy the matching backend build there.
 */
export const baseUrl =
  (import.meta as any)?.env?.VITE_API_URL ||
  "/api";
const LOGIN_REDIRECT_PATH = '/login?reset=true';

const parseJwtPayload = (token: string): Record<string, any> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

export const isJwtExpired = (token?: string | null): boolean => {
  if (!token) return true;
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp)) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec >= exp;
};

/** True while a logout redirect is in progress — pages use this to suppress error toasts. */
let _loggingOut = false;
export const isLoggingOut = () => _loggingOut;

export const forceClientLogout = () => {
  _loggingOut = true;
  Store.dispatch(logout());
  if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
    window.location.href = LOGIN_REDIRECT_PATH;
  }
};

// Create a configured axios instance
const api = axios.create({
  baseURL: baseUrl,
  withCredentials: true,
  paramsSerializer: {
    indexes: null,
  },
});

// Add a request interceptor to attach the JWT token
api.interceptors.request.use(
  (config) => {
    const rawUrl = String(config.url ?? "");
    const method = String(config.method ?? "get").toLowerCase();
    const isLoginCall = method === "post" && rawUrl.includes("/auth/login");
    const isRegisterCall = method === "post" && rawUrl.includes("/auth/register");
    const isAuthFreeCall = isLoginCall || isRegisterCall;
    const token = localStorage.getItem("token");
    if (!isAuthFreeCall && isJwtExpired(token)) {
      console.warn('[API REQUEST] Session expired before request. Forcing logout...');
      forceClientLogout();
      return Promise.reject(new Error('SESSION_EXPIRED'));
    }
    if (!isAuthFreeCall && token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.url}`, config.params || '');
    return config;
  },
  (error) => {
    console.error('[API REQUEST ERROR]', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    console.log(`[API RESPONSE] ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const rawUrl = String(error.config?.url ?? "");
    const method = String(error.config?.method ?? "get").toLowerCase();
    /** Wrong password on login — not a destroyed session; avoid clearing state / hard redirect. */
    const isLoginFailure = status === 401 && method === "post" && rawUrl.includes("/auth/login");
    /** Signing out may 401 on some setups; client cleanup runs in UI — do not treat as session expiry. */
    const isLogoutCall = method === "post" && rawUrl.includes("/auth/logout");

    if (status === 401 && !isLoginFailure && !isLogoutCall) {
      console.warn('[API 401] Token expired or invalid. Logging out...');
      forceClientLogout();
    }

    console.error(`[API RESPONSE ERROR] ${error.response?.status} ${error.config?.url}`, error.response?.data);
    return Promise.reject(error);
  }
);

export const Login = async (body: LoginRequest) => {
  const { data } = await api.post(`/auth/login`, body);
  if (data.access_token) {
    localStorage.setItem("token", data.access_token);
  }
  return data;
}

export const getProfile = async () => {
  const { data } = await api.get('/auth/profile');
  return data;
};

/** Notify server only; clears `localStorage` via `dispatch(logout())` so Redux and token stay in sync (avoids stray 401 toasts mid-sign-out). */
export const Logout = async () => {
  try {
    const { data } = await api.post(`/auth/logout`, {});
    return data;
  } catch {
    return null;
  }
};

export const getAllAnnouncement = async () => {
  const { data } = await api.get(`/announcement`);
  return data;
}

export const createAnnouncement = async (body: createAnnouncementI) => {
  const { data } = await api.post(`/announcement`, body, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
};

export const updateAnnouncement = async (id: string, body: updateAnnouncementI) => {
  const { data } = await api.put(`/announcement/${id}`, body, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
};

export const deleteAnnouncement = async (id: string) => {
  const { data } = await api.delete(`/announcement/${id}`);
  return data;
};

export const getAllQuiz = async () => {
  const { data } = await api.get(`/quiz`);
  return data;
};

export const createQuiz = async (body: createQuizI) => {
  const { data } = await api.post(`/quiz`, body);
  return data;
};

export const updateQuiz = async (id: string, body: updateQuizI) => {
  const { data } = await api.put(`/quiz/${id}`, body);
  return data;
};

export const deleteQuiz = async (id: string) => {
  const { data } = await api.delete(`/quiz/${id}`);
  return data;
};

// --- Users ---

export const getAllUsers = async (params: any = {}) => {
  const { data } = await api.get(`/users`, { params });
  return data;
};

export const getUser = async (id: string | number) => {
  const { data } = await api.get(`/users/${id}`);
  return data;
};

export type ProfileOverviewLeadPages = {
  currentPage?: number;
  priorPage?: number;
  limitCurrent?: number;
  limitPrior?: number;
};

/**
 * Same path as getProfile (?memberSalesUserId=) so /api proxies always match.
 * Pass `leadPages` to append `profileLeads: { currentAssigned, previouslyAssigned }` in one round-trip.
 */
export const getUserSalesOverview = async (
  id: string | number,
  leadPages?: ProfileOverviewLeadPages | null,
  performanceRange?: 'all' | 'week' | 'month' | 'year',
) => {
  const params: Record<string, string | number> = { memberSalesUserId: String(id) };
  if (performanceRange) params.performanceRange = performanceRange;
  if (leadPages != null) {
    params.withProfileLeads = '1';
    if (leadPages.currentPage != null) params.leadsCurrentPage = leadPages.currentPage;
    if (leadPages.priorPage != null) params.leadsPriorPage = leadPages.priorPage;
    if (leadPages.limitCurrent != null) params.leadsLimitCurrent = leadPages.limitCurrent;
    if (leadPages.limitPrior != null) params.leadsLimitPrior = leadPages.limitPrior;
  }
  const { data } = await api.get(`/auth/profile`, { params });
  return data;
};

export const getUsersByRole = async (roleName: string) => {
  if (!roleName || roleName === 'undefined') {
    console.warn('getUsersByRole: roleName is undefined or invalid, skipping request.');
    return [];
  }
  const { data } = await api.get(`/users/role/${roleName}`);
  return Array.isArray(data) ? data : (data?.data ?? []);
};

/** Tech leads and sales visible to the current user (hierarchy-scoped for TL / SM / OM). */
export const getAccountsForTeams = async () => {
  const { data } = await api.get(`/users/scoped/team-assignees`);
  return {
    techLeads: Array.isArray(data?.techLeads) ? data.techLeads : [],
    sales: Array.isArray(data?.sales) ? data.sales : [],
  };
};

export const getPerformanceOverview = async () => {
  const { data } = await api.get(`/performance/overview`);
  return data;
};

export const createUser = async (body: any) => {
  const { data } = await api.post(`/users`, body);
  return data;
};

export const updateUser = async (id: string | number, body: any) => {
  const { data } = await api.patch(`/users/${id}`, body);
  return data;
};

export const deleteUser = async (id: string | number) => {
  const { data, status } = await api.delete(`/users/${id}`);
  // 204 No Content has no body; treat as success
  return status === 204 ? { deleted: true } : data;
};

// --- Teams ---

export const getAllTeams = async () => {
  const { data } = await api.get(`/teams`);
  return data;
};

export const getTeam = async (id: string | number) => {
  const { data } = await api.get(`/teams/${id}`);
  return data;
};

export const createTeam = async (body: any) => {
  const { data } = await api.post(`/teams`, body);
  return data;
};

export const updateTeam = async (id: string | number, body: any) => {
  const { data } = await api.patch(`/teams/${id}`, body);
  return data;
};

export const deleteTeam = async (id: string | number) => {
  const { data } = await api.delete(`/teams/${id}`);
  return data;
};

// --- Roles ---

export const getAllRoles = async () => {
  const { data } = await api.get(`/roles`);
  return data;
};

// --- Campaigns ---

export const getAllCampaigns = async () => {
  const { data } = await api.get(`/campaigns`);
  return data;
};

export const createCampaign = async (body: any) => {
  const { data } = await api.post(`/campaigns`, body);
  return data;
};

export const updateCampaign = async (id: string | number, body: any) => {
  const { data } = await api.patch(`/campaigns/${id}`, body);
  return data;
};

export const deleteCampaign = async (id: string | number) => {
  const { data } = await api.delete(`/campaigns/${id}`);
  return data;
};

export const importCampaignsFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(`/campaigns/import`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
};

// --- Data Batches ---

export const getAllDataBatches = async () => {
  const { data } = await api.get(`/data-batches`);
  return data;
};

export const createDataBatch = async (body: any) => {
  const { data } = await api.post(`/data-batches`, body);
  return data;
};

export const updateDataBatch = async (id: string | number, body: any) => {
  const { data } = await api.patch(`/data-batches/${id}`, body);
  return data;
};

export const deleteDataBatch = async (id: string | number) => {
  const { data } = await api.delete(`/data-batches/${id}`);
  return data;
};

// --- Lead Uploads ---

export const getAllLeadUploads = async () => {
  const { data } = await api.get(`/lead-uploads`);
  return data;
};

export const createLeadUpload = async (body: any) => {
  const { data } = await api.post(`/lead-uploads`, body);
  return data;
};

export const importDataBatch = async (
  batchId: string | number,
  file: File,
  mapping?: any,
  dryRun: boolean = false,
  opts?: { inboundPlatform?: string },
) => {
  const formData = new FormData();
  formData.append('file', file);
  if (mapping) {
    formData.append('mapping', JSON.stringify(mapping));
  }
  const params = new URLSearchParams();
  if (dryRun) params.set('dryRun', 'true');
  if (opts?.inboundPlatform) params.set('inboundPlatform', opts.inboundPlatform);
  const qs = params.toString();
  const { data } = await api.post(`/leads/batch-import/${batchId}${qs ? `?${qs}` : ''}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
};

// --- Leads ---

export const getAllLeads = async (page: number = 1, limit: number = 20, params: any = {}) => {
  const { data } = await api.get(`/leads`, {
    params: { ...params, page, limit }
  });
  return data;
};

export const getLeadById = async (id: string | number) => {
  const { data } = await api.get(`/leads/${id}`);
  return data;
};

export const createLead = async (body: any) => {
  const { data } = await api.post(`/leads`, body);
  return data;
};

export const updateLead = async (id: string | number, body: any) => {
  const { data } = await api.patch(`/leads/${id}`, body);
  return data;
};

export const deleteLead = async (id: string | number) => {
  const { data } = await api.delete(`/leads/${id}`);
  return data;
};

export type BulkAssignLeadsBody = {
  leadIds: number[];
  assignedTo: number;
  assignmentMode?: string;
  /** Hours until temporary assignment ends; omit or 0 for no expiry */
  assignmentDurationHours?: number;
  /** When duration > 0: 'rotation' (pool) or 'backup_sales' */
  assignmentExpireAction?: 'rotation' | 'backup_sales';
  /** Required when assignmentExpireAction is backup_sales */
  backupAssignUserId?: number;
};

export const bulkAssignLeads = async (body: BulkAssignLeadsBody) => {
  const { data } = await api.patch(`/leads/bulk-assign`, body);
  return data;
};

export const bulkSendLeadsToRotation = async (body: { leadIds: number[]; force?: boolean }) => {
  const { data } = await api.patch(`/leads/bulk-rotation`, body);
  return data;
};

// ── WhatsApp Gateway settings ──────────────────────────────────────────────

export const getWhatsappConfig = async (): Promise<{ phoneNumberId: string | null; hasToken: boolean; configured: boolean }> => {
  const { data } = await api.get('/settings/whatsapp/config');
  return data;
};

export const saveWhatsappConfig = async (phoneNumberId: string, accessToken: string) => {
  const { data } = await api.post('/settings/whatsapp/config', { phoneNumberId, accessToken });
  return data as { success: boolean };
};

export const testWhatsappGateway = async (phone: string, message?: string) => {
  const { data } = await api.post('/settings/whatsapp/test', { phone, message });
  return data as { success: boolean };
};

export const uploadWhatsappMedia = async (file: File): Promise<{ success: boolean; mediaId?: string; reason?: string }> => {
  const form = new FormData();
  form.append('image', file);
  const { data } = await api.post(`/leads/whatsapp-upload-media`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const sendWhatsappToLead = async (leadId: number, message: string, mediaId?: string) => {
  const { data } = await api.post(`/leads/whatsapp-send`, { leadId, message, ...(mediaId ? { mediaId } : {}) });
  return data as { success: boolean; reason?: string };
};

/** Clear assignee only (not-assigned pool); does not set lead status to rotation. */
export const bulkClearAssignmentLeads = async (body: { leadIds: number[] }) => {
  const { data } = await api.patch(`/leads/bulk-unassign`, body);
  return data;
};

// --- Units (inventory) — link-based media; installment & delivery via API fields

export type UnitPayload = {
  /** Omit on create — server generates a unique code */
  code?: string;
  description: string;
  ownerName?: string | null;
  ownerPhone?: string | null;
  /** Short listing address (e.g. unit line inside compound) */
  address?: string | null;
  projectName?: string;
  location?: string;
  floor?: number | null;
  price?: number;
  monthlyInstallment?: number;
  deliveryDate?: string | null;
  /** Google Drive (or similar) share link */
  driveMediaLink?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  unitType?: string;
  amenities?: string[] | null;
  externalLinks?: string[] | null;
  status?: 'available' | 'reserved' | 'sold' | 'unavailable';
};

export const getUnits = async (params?: {
  q?: string;
  salesId?: number | string;
  teamId?: number | string;
  /** When true, backend returns only published units (inventory / catalog). */
  publishedOnly?: boolean;
}) => {
  const { data } = await api.get(`/units`, { params });
  return data;
};

export const getUnit = async (id: string | number) => {
  const { data } = await api.get(`/units/${id}`);
  return data;
};

export const getNextUnitCode = async (unitType?: string) => {
  const { data } = await api.get(`/units/next-code`, { params: { unitType } });
  return data as { code?: string };
};

export const createUnit = async (body: UnitPayload) => {
  const { data } = await api.post(`/units`, body);
  return data;
};

export const updateUnit = async (id: string | number, body: Partial<UnitPayload>) => {
  const { data } = await api.patch(`/units/${id}`, body);
  return data;
};

export const deleteUnit = async (id: string | number) => {
  const { data } = await api.delete(`/units/${id}`);
  return data;
};

export const publishUnit = async (
  id: string | number,
  body: { isPublished: boolean; publishedLink?: string },
) => {
  const { data } = await api.patch(`/units/${id}/publish`, body);
  return data;
};

export const reviewUnitApproval = async (
  id: string | number,
  body: { decision: 'approve' | 'reject'; note?: string },
) => {
  const { data } = await api.patch(`/units/${id}/approval`, body);
  return data;
};

// --- Unit Previews (showing requests) ---

export type PreviewPayload = {
  unitId: number;
  clientName: string;
  clientPhone?: string;
  scheduledAt: string;
  durationMin?: number;
  notes?: string;
};

export type PreviewRow = {
  id: string | number;
  unitId: string | number;
  requestedById: string | number;
  clientName: string;
  clientPhone?: string | null;
  scheduledAt: string;
  durationMin?: number | null;
  notes?: string | null;
  status: 'pending' | 'scheduled' | 'checked_in' | 'checked_out' | 'cancelled';
  checkInAt?: string | null;
  checkInLat?: number | string | null;
  checkInLng?: number | string | null;
  checkOutAt?: string | null;
  checkOutLat?: number | string | null;
  checkOutLng?: number | string | null;
  createdAt?: string;
  updatedAt?: string;
  unit?: {
    id: string | number;
    code: string;
    projectName?: string | null;
    location?: string | null;
    unitType?: string | null;
    address?: string | null;
    /** Listing owner — when this equals your user id, previews book as scheduled without approval */
    createdBy?: string | number | null;
    creator?: { firstName?: string | null; lastName?: string | null } | null;
  };
  requestedBy?: {
    id: string | number;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    role?: { name?: string; displayName?: string };
  };
};

export const getUnitPreviews = async (params?: {
  unitId?: number;
  status?: string;
  requestedById?: number;
  q?: string;
  salesId?: number | string;
  teamId?: number | string;
}) => {
  const { data } = await api.get(`/unit-previews`, { params });
  return data as PreviewRow[];
};

export type PreviewAvailability =
  | { available: true }
  | {
    available: false;
    conflict: {
      previewId: string;
      assignedToName: string;
      scheduledAt: string;
      endsAt: string;
      durationMin: number;
      status: string;
      clientName: string;
    };
  };

export const checkUnitPreviewAvailability = async (params: {
  unitId: number;
  scheduledAt: string;
  durationMin?: number;
  excludePreviewId?: number;
}) => {
  const { data } = await api.get(`/unit-previews/availability`, { params });
  return data as PreviewAvailability;
};

export const createUnitPreview = async (body: PreviewPayload) => {
  const { data } = await api.post(`/unit-previews`, body);
  return data;
};

export const getMyUnitsPreviewRequests = async (params?: {
  q?: string;
  salesId?: number | string;
  teamId?: number | string;
}) => {
  const { data } = await api.get('/unit-previews/my-units', { params });
  return data;
};

export const getUnitPreviewById = async (id: string | number) => {
  const { data } = await api.get(`/unit-previews/${id}`);
  return data as PreviewRow;
};

export const approveUnitPreview = async (id: string | number) => {
  const { data } = await api.patch(`/unit-previews/${id}/approve`);
  return data;
};

export const rejectUnitPreview = async (id: string | number) => {
  const { data } = await api.patch(`/unit-previews/${id}/reject`);
  return data;
};

export const checkInUnitPreview = async (id: string | number, lat?: number, lng?: number) => {
  const { data } = await api.patch(`/unit-previews/${id}/check-in`, { lat, lng });
  return data;
};

export const checkOutUnitPreview = async (id: string | number, lat?: number, lng?: number) => {
  const { data } = await api.patch(`/unit-previews/${id}/check-out`, { lat, lng });
  return data;
};

export const cancelUnitPreview = async (id: string | number) => {
  const { data } = await api.patch(`/unit-previews/${id}/cancel`);
  return data;
};

// --- Calculator ---

export const calculateInstallment = async (payload: Record<string, any>) => {
  const { data } = await api.post('/calculator/calculate', payload);
  return data;
};

// --- Dashboard ---

export const getDashboardStats = async () => {
  const { data } = await api.get(`/dashboard/stats`);
  return data;
};

// --- Meetings ---

export const getQualifiedLeads = async (page: number = 1, limit: number = 10) => {
  const { data } = await api.get(`/meetings/qualified-leads`, { params: { page, limit } });
  return data;
};

export const getMeetingStats = async () => {
  const { data } = await api.get(`/meetings/stats`);
  return data;
};

export const getMeetings = async (page: number = 1, limit: number = 10, params?: { userId?: string; teamId?: string }) => {
  const { data } = await api.get(`/meetings`, { params: { page, limit, ...params } });
  return data;
};

export const getMeeting = async (id: string | number) => {
  const { data } = await api.get(`/meetings/${id}`);
  return data;
};

export const createMeeting = async (body: {
  leadId: number;
  meetingDate: string;
  location?: string;
  meetingType: string;
  isPrivate?: boolean;
  notes?: string;
  scheduledBy?: number;
}) => {
  const { data } = await api.post(`/meetings`, body);
  return data;
};

export const updateMeeting = async (id: string | number, body: {
  startedAt?: string;
  endedAt?: string;
  currentLocation?: string;
  feedback?: string;
  status?: string;
  [k: string]: any;
}) => {
  const { data } = await api.patch(`/meetings/${id}`, body);
  return data;
};

export const deleteMeeting = async (id: string | number) => {
  const { data } = await api.delete(`/meetings/${id}`);
  return data;
};

// --- Lead Feedback ---


export const createLeadFeedback = async (body: {
  leadId: number;
  userId: number;
  feedbackType: string;
  description: string;
  nextAction?: string;
  nextActionDate?: string;
}) => {
  const { data } = await api.post(`/lead-feedback`, body);
  return data;
};

// --- HR Attendance ---
export const getAttendanceRecords = async (params: { date?: string; userId?: string | number; teamId?: string | number; page?: number; limit?: number; search?: string } = {}) => {
  const { data } = await api.get(`/attendance`, { params });
  return data;
};

export const getAttendanceRecord = async (id: string | number) => {
  const { data } = await api.get(`/attendance/${id}`);
  return data;
};

export const checkInAttendance = async (body: { checkInLocation?: string; checkInTime?: string }) => {
  const { data } = await api.post(`/attendance/sales/check-in`, body);
  return data;
};

export const checkOutAttendance = async (body: { checkOutLocation?: string; checkOutTime?: string }) => {
  const { data } = await api.post(`/attendance/sales/check-out`, body);
  return data;
};

export const getTodayAttendanceForUser = async (userId: number | string) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await api.get(`/attendance`, { params: { date: today, userId, limit: 10 } });
  const logs: any[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  return logs[0] ?? null;
};

export const getActiveHrPolicy = async () => {
  const { data } = await api.get(`/hr/policies`);
  const list: any[] = Array.isArray(data) ? data : (data?.data ?? []);
  return list.find((p: any) => p.isActive) ?? list[0] ?? null;
};

// --- HR Module ---

export const getHrEmployees = async (params: { page?: number; limit?: number; search?: string } = {}) => {
  const { data } = await api.get(`/hr/employees`, { params });
  return data;
};

export const setEmployeeSalary = async (userId: string | number, salary: number) => {
  const { data } = await api.patch(`/hr/employees/${userId}/salary`, { salary });
  return data;
};

export const getHrPolicies = async () => {
  const { data } = await api.get(`/hr/policies`);
  return data;
};

export const createHrPolicy = async (body: any) => {
  const { data } = await api.post(`/hr/policies`, body);
  return data;
};

export const updateHrPolicy = async (id: number, body: any) => {
  const { data } = await api.patch(`/hr/policies/${id}`, body);
  return data;
};

export const deleteHrPolicy = async (id: number) => {
  const { data } = await api.delete(`/hr/policies/${id}`);
  return data;
};

export const getHrPayroll = async () => {
  const { data } = await api.get(`/hr/payroll`);
  return data;
};

export const getHrEmployeeProfile = async (userId: string | number) => {
  const { data } = await api.get(`/hr/employee-profile/${userId}`);
  return data;
};

// --- Finance (Super Admin + HR) — sales salaries, deductions, commissions ---

export const getFinanceSalesOverview = async () => {
  const { data } = await api.get(`/finance/sales-overview`);
  return data;
};

export const createFinanceDeduction = async (body: {
  userId: number;
  amount: number;
  reason: string;
}) => {
  const { data } = await api.post(`/finance/deductions`, body);
  return data;
};

export const createFinanceCommission = async (body: {
  userId: number;
  title: string;
  saleDate: string;
  dueNote?: string;
  amount?: number;
}) => {
  const { data } = await api.post(`/finance/commissions`, body);
  return data;
};

export const collectFinanceCommission = async (id: string | number) => {
  const { data } = await api.patch(`/finance/commissions/${id}/collect`);
  return data;
};

export const createCommissionFromRate = async (body: {
  userId: number;
  title: string;
  saleDate: string;
  unitPrice: number;
  commissionRateId?: number;
  companyRatePct: number;
  salesRatePct: number;
  taxRatePct?: number;
  dueNote?: string;
}) => {
  const { data } = await api.post(`/finance/commissions/from-rate`, body);
  return data;
};

// --- Commission Rates ---

export const listCommissionRates = async () => {
  const { data } = await api.get(`/finance/commission-rates`);
  return data as any[];
};

export const createCommissionRate = async (body: {
  developerName: string;
  companyRatePct: number;
  salesRatePct: number;
  taxRatePct?: number;
  notes?: string;
}) => {
  const { data } = await api.post(`/finance/commission-rates`, body);
  return data;
};

export const updateCommissionRate = async (id: number, body: Partial<{
  developerName: string;
  companyRatePct: number;
  salesRatePct: number;
  taxRatePct: number;
  isActive: boolean;
  notes: string;
}>) => {
  const { data } = await api.patch(`/finance/commission-rates/${id}`, body);
  return data;
};

export const deleteCommissionRate = async (id: number) => {
  const { data } = await api.delete(`/finance/commission-rates/${id}`);
  return data;
};

// --- Caller ID (multi-provider) ---
export const getCallerId = async (phone: string) => {
  const { data } = await api.get(`/leads/caller-id`, { params: { phone } });
  return data as {
    phone: string;
    topName: string | null;
    allNames: string[];
    providers: { name: string; callerName: string | null; count: number; error?: string }[];
    configured: boolean;
    fetched: string;
  };
};

// --- Phone Info Lookup ---
export const getPhoneInfo = async (phone: string) => {
  const { data } = await api.get(`/leads/phone-info`, { params: { phone } });
  return data as {
    raw: string; e164: string; local: string;
    country: string; countryAr: string; valid: boolean; lineType: string;
    carrier: { name: string; nameAr: string; color: string } | null;
    prefix: string | null;
    existingLeads: { id: any; name: string; status: string; assignedTo: string | null; createdAt: string }[];
    existingCount: number;
  };
};

// --- Finance — Payroll Runs ---

export const listPayrollRuns = async () => {
  const { data } = await api.get(`/finance/payroll`);
  return data;
};

export const getPayrollRun = async (month: string) => {
  const { data } = await api.get(`/finance/payroll/${month}`);
  return data;
};

export const closePayrollRun = async (month: string, notes?: string) => {
  const { data } = await api.post(`/finance/payroll/${month}/close`, { notes });
  return data;
};

export const markPayrollEntryPaid = async (entryId: number | string, isPaid: boolean) => {
  const { data } = await api.patch(`/finance/payroll/entries/${entryId}/pay`, { isPaid });
  return data;
};

// --- Finance — Transactions ---

export const listFinanceTransactions = async (month?: string, type?: string) => {
  const { data } = await api.get(`/finance/transactions`, { params: { month, type } });
  return data;
};

export const createFinanceTransaction = async (body: {
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  description?: string;
  date?: string;
  department?: string;
}) => {
  const { data } = await api.post(`/finance/transactions`, body);
  return data;
};

export const deleteFinanceTransaction = async (id: number | string) => {
  const { data } = await api.delete(`/finance/transactions/${id}`);
  return data;
};

// --- Finance — Fixed Bills ---

export const listFixedBills = async () => {
  const { data } = await api.get(`/finance/fixed-bills`);
  return data;
};

export const createFixedBill = async (body: {
  name: string;
  category: string;
  amount: number;
  dueDay?: number;
  notes?: string;
}) => {
  const { data } = await api.post(`/finance/fixed-bills`, body);
  return data;
};

export const updateFixedBill = async (id: number, body: Partial<{
  name: string;
  category: string;
  amount: number;
  dueDay: number;
  isActive: boolean;
  notes: string;
}>) => {
  const { data } = await api.patch(`/finance/fixed-bills/${id}`, body);
  return data;
};

export const deleteFixedBill = async (id: number) => {
  const { data } = await api.delete(`/finance/fixed-bills/${id}`);
  return data;
};

// --- Finance — Dashboard ---

export const getFinanceDashboard = async (month?: string) => {
  const { data } = await api.get(`/finance/dashboard`, { params: { month } });
  return data;
};

// --- Notifications ---

export const getNotificationsForUser = async (userId: string | number) => {
  const { data } = await api.get(`/notifications/user/${userId}`);
  return data;
};

export const getUnreadNotificationCount = async (userId: string | number) => {
  const { data } = await api.get(`/notifications/user/${userId}/unread-count`);
  return data as { count: number };
};

export const markNotificationRead = async (id: string | number) => {
  const { data } = await api.patch(`/notifications/${id}/read`);
  return data;
};

export const markAllNotificationsRead = async (userId: string | number) => {
  const { data } = await api.patch(`/notifications/user/${userId}/mark-all-read`);
  return data;
};

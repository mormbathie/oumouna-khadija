import axios, { AxiosError } from 'axios';
import { translateMessage } from '../i18n';
import { refreshAccessToken } from '../auth/session';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (!navigator.onLine && !['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
    return Promise.reject(new AxiosError(translateMessage('Connexion Internet nécessaire. Aucune opération n’a été envoyée au serveur.'), 'ERR_NETWORK', config));
  }
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.data?.message) {
      const message = error.response.data.message;
      error.response.data.message = Array.isArray(message) ? message.map(translateMessage) : translateMessage(message);
    }
    const original = error.config as typeof error.config & { _retried?: boolean };
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      try {
        original.headers.Authorization = `Bearer ${await refreshAccessToken()}`;
        return api(original);
      } catch {
        // Keep the original API error; refreshAccessToken clears only an expired session.
      }
    }
    return Promise.reject(error);
  },
);

export const usersApi = {
  twoFactorStatus: () => api.get('/users/me/two-factor').then(r => r.data),
  enableTwoFactor: () => api.post('/users/me/two-factor').then(r => r.data),
  getAll: () => api.get('/users').then((r) => r.data),
  create: (data: { username: string; email: string; firstName: string; lastName: string; password?: string; role: string }) =>
    api.post('/users', data).then((r) => r.data),
  setEnabled: (id: string, enabled: boolean) =>
    api.patch(`/users/${id}/status`, { enabled }).then((r) => r.data),
  delete: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
  resetPassword: (id: string, password: string) => api.post(`/users/${id}/reset-password`, { password }).then((r) => r.data),
  sendActivation: (id: string) => api.post(`/users/${id}/send-activation`).then((r) => r.data),
  sendPasswordReset: (id: string) => api.post(`/users/${id}/send-password-reset`).then((r) => r.data),
  changeOwnPassword: (currentPassword: string, newPassword: string, totp?: string) => api.post('/users/me/password', { currentPassword, newPassword, totp }).then((r) => r.data),
  update: (id: string, data: { email: string; firstName: string; lastName: string; role: string }) => api.patch(`/users/${id}`, data).then((r) => r.data),
  getDossier: () => api.get('/users/me/dossier').then(r => r.data),
  updateDossier: (data: Record<string, string>) => api.patch('/users/me/dossier', data).then(r => r.data),
  profilePhoto: () => api.get('/users/me/dossier/photo', { responseType: 'blob' }).then(r => r.data as Blob),
  uploadProfilePhoto: (file: File) => { const data = new FormData(); data.append('file', file); return api.post('/users/me/dossier/photo', data).then(r => r.data); },
  removeProfilePhoto: () => api.delete('/users/me/dossier/photo').then(r => r.data),
  getOwnProfile: () => api.get('/users/me').then((r) => r.data),
  updateOwnProfile: (data: { firstName: string; lastName: string; email: string; phone: string }) => api.patch('/users/me', data).then((r) => r.data),
  requestEmailVerification: () => api.post('/users/me/verify-email').then((r) => r.data),
};

export const staffAttendanceApi = {
  myCard: () => api.get('/staff-attendance/me/card').then((r) => r.data),
  myHistory: () => api.get('/staff-attendance/me').then((r) => r.data),
  scan: (code: string, action?: 'arrival'|'departure') => api.post('/staff-attendance/scan', { code, action }).then((r) => r.data),
  list: (date: string) => api.get('/staff-attendance', { params: { date } }).then((r) => r.data),
  finalize: (date: string) => api.post('/staff-attendance/finalize', { date }).then((r) => r.data),
  getCalendar: () => api.get('/staff-attendance/calendar').then((r) => r.data),
  updateCalendar: (data: { restDays: number[]; startTime: string; timeZone: string }) => api.patch('/staff-attendance/calendar', data).then((r) => r.data),
  addHoliday: (date: string, name: string) => api.post('/staff-attendance/calendar/holidays', { date, name }).then((r) => r.data),
  removeHoliday: (id: string) => api.delete(`/staff-attendance/calendar/holidays/${id}`).then((r) => r.data),
};

export const dataTransferApi = {
  exportModels: () => api.get<Array<{name:string;label:string;importable:boolean}>>('/data-transfer/export-models').then(r=>r.data),
  models: () => api.get<string[]>('/data-transfer/models').then((r) => r.data),
  export: (format: 'xlsx' | 'csv', model?: string) => api.get('/data-transfer/export', { params: { format, model }, responseType: 'blob' }).then((r) => r.data as Blob),
  preview: (file: File, model?: string) => {
    const form = new FormData(); form.append('file', file);
    return api.post('/data-transfer/preview', form, { params: { model } }).then((r) => r.data);
  },
  import: (file: File, model?: string) => {
    const form = new FormData(); form.append('file', file);
    return api.post('/data-transfer/import', form, { params: { model } }).then((r) => r.data);
  },
};

export const dashboardApi = {
  getSummary: (params?: {mode?:string;start?:string;end?:string}) => api.get('/dashboard/summary', {params}).then((r) => r.data),
};

export const studentsApi = {
  quote: (data: any) => api.post('/students/fee-quote', data).then(r=>r.data),
  getAll: (params?: { classId?: string; search?: string; status?: string; fullDay?: string }) =>
    api.get('/students', { params }).then((r) => r.data),
  getOne: (id: string) => api.get(`/students/${id}`).then((r) => r.data),
  getPhoto: (id: string) => api.get(`/students/${id}/photo`, { responseType: 'blob' }).then((r) => r.data),
  create: (data: any) => api.post('/students', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/students/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/students/${id}`).then((r) => r.data),
  uploadDocument: (id: string, category: string, file: File) => {
    const data = new FormData();
    data.append('file', file);
    return api.post(`/students/${id}/documents`, data, { params: { category } }).then((r) => r.data);
  },
  downloadDocument: (id: string, documentId: string) =>
    api.get(`/students/${id}/documents/${documentId}/file`, { responseType: 'blob' }).then((r) => r.data),
  deleteDocument: (id: string, documentId: string) =>
    api.delete(`/students/${id}/documents/${documentId}`).then((r) => r.data),
  enroll: (data: { studentId: string; classroomId: string; academicYearId: string }) =>
    api.post('/students/enroll', data).then((r) => r.data),
};

export const parentsApi = {
  getAll: (search?: string) => api.get('/parents', { params: { search } }).then((r) => r.data),
  getOne: (id: string) => api.get(`/parents/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/parents', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/parents/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/parents/${id}`).then((r) => r.data),
  uploadDocument: (id: string, category: string, file: File) => {
    const data = new FormData();
    data.append('file', file);
    return api.post(`/parents/${id}/documents`, data, { params: { category } }).then((r) => r.data);
  },
  downloadDocument: (id: string, documentId: string) =>
    api.get(`/parents/${id}/documents/${documentId}/file`, { responseType: 'blob' }).then((r) => r.data),
  deleteDocument: (id: string, documentId: string) =>
    api.delete(`/parents/${id}/documents/${documentId}`).then((r) => r.data),
};

export const classesApi = {
  getAll: () => api.get('/classes').then((r) => r.data),
  getOne: (id: string) => api.get(`/classes/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/classes', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/classes/${id}`, data).then((r) => r.data),
  getAcademicYears: () => api.get('/classes/academic-years').then((r) => r.data),
  getSubjects: () => api.get('/classes/subjects').then((r) => r.data),
  getTeachers: () => api.get('/classes/teachers').then((r) => r.data),
  createSubject: (data: any) => api.post('/classes/subjects', data).then((r) => r.data),
  updateSubject: (id: string, data: any) => api.put(`/classes/subjects/${id}`, data).then((r) => r.data),
};

export const financesApi = {
  activityInvoice: (data: any) => api.post('/finances/activities/invoices', data).then(r=>r.data),
  getStats: (academicYearId?: string) =>
    api.get('/finances/stats', { params: { academicYearId } }).then((r) => r.data),
  getInvoices: (params?: any) => api.get('/finances/invoices', { params }).then((r) => r.data),
  getInvoice: (id: string) => api.get(`/finances/invoices/${id}`).then((r) => r.data),
  createInvoice: (data: any) => api.post('/finances/invoices', data).then((r) => r.data),
  generateBatch: (data: any) => api.post('/finances/invoices/generate-batch', data).then((r) => r.data),
  correctPayment: (id: string, data: any) => api.post(`/finance-control/payments/${id}/correct`, data).then(r => r.data),
  correctionHistory: (id: string) => api.get(`/finance-control/invoices/${id}/corrections`).then(r => r.data),
  settleBatch: (data: any) => api.post('/finances/payments/settle-batch', data).then((r) => r.data),
  recordPayment: (data: any) => api.post('/finances/payments', data).then((r) => r.data),
  emailInvoice: (id: string) => api.post(`/finances/invoices/${id}/email`).then((r) => r.data),
  emailReceipt: (id: string) => api.post(`/finances/payments/${id}/email-receipt`).then((r) => r.data),
};

export const gradesApi = {
  getGrades: (params?: any) => api.get('/grades', { params }).then((r) => r.data),
  recordGrade: (data: any) => api.post('/grades', data).then((r) => r.data),
  recordBatch: (data: any) => api.post('/grades/batch', data).then((r) => r.data),
  generateReportCard: (data: any) =>
    api.post('/grades/report-cards/generate', data).then((r) => r.data),
  generateClassReportCards: (data: any) =>
    api.post('/grades/report-cards/generate-class', data).then((r) => r.data),
  getReportCardDetails: (params: { studentId: string; classroomId: string; term: string }) =>
    api.get('/grades/report-cards/details', { params }).then((r) => r.data),
  getClassReportCards: (params: { classroomId: string; term: string }) =>
    api.get('/grades/report-cards/class', { params }).then((r) => r.data),
};

export const attendanceApi = {
  getSheet: (classroomId: string, date?: string) =>
    api.get(`/attendance/sheet/${classroomId}`, { params: { date } }).then((r) => r.data),
  saveSheet: (data: any) => api.post('/attendance/sheet', data).then((r) => r.data),
  getStats: (params?: any) => api.get('/attendance/stats', { params }).then((r) => r.data),
  getScanRoster: (classroomId: string, date?: string) =>
    api.get(`/attendance/scan/roster/${classroomId}`, { params: { date } }).then((r) => r.data),
  scanStudent: (data: { qrCode: string }) =>
    api.post('/attendance/scan', data).then((r) => r.data),
  finalizeScan: (data: { classroomId: string; date?: string }) =>
    api.post('/attendance/scan/finalize', data).then((r) => r.data),
  finalizeAllScans: (date?: string) => api.post('/attendance/scan/finalize-all', { date }).then((r) => r.data),
};

export default api;

export const refundsApi = {
  list: () => api.get('/refunds').then(r => r.data),
  payments: (id: string) => api.get(`/refunds/payments/${id}`).then(r => r.data),
  create: (data: any) => api.post('/refunds', data).then(r => r.data),
  departures: () => api.get('/refunds/departures').then(r => r.data),
  depart: (id: string, data: any) => api.post(`/refunds/departures/${id}`, data).then(r => r.data),
};

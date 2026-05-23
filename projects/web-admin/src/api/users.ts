import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type MeDTO = {
  userId: string;
  userType: string;
  username?: string | null;
  nickname: string;
  avatarUrl: string;
  lastLoginAt?: string | null;
};

export async function getMe() {
  const r = await api.get<ApiResponse<MeDTO>>('/users/me');
  return unwrap(r.data);
}

export async function updateMyProfile(params: { nickname?: string; avatarUrl?: string }) {
  const r = await api.put<ApiResponse<{ token: string; user: MeDTO }>>('/users/me/profile', params);
  return unwrap(r.data);
}

export async function changeMyPassword(params: { oldPassword: string; newPassword: string }) {
  const r = await api.put<ApiResponse<{ userId: string }>>('/admin/me/password', params);
  return unwrap(r.data);
}

export type AdminUserDTO = {
  userId: string;
  userType: string;
  username?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  wechatOpenid?: string | null;
  wechatUnionid?: string | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};

export async function listUsers(params: { userType?: string; keyword?: string; page?: number; pageSize?: number }) {
  const r = await api.get<
    ApiResponse<{ list: AdminUserDTO[]; pagination: { page: number; pageSize: number; total: number } }>
  >('/admin/users', { params });
  return unwrap(r.data);
}

export async function createAdminUser(params: {
  username: string;
  password: string;
  nickname?: string;
  avatarUrl?: string;
}) {
  const r = await api.post<ApiResponse<AdminUserDTO>>('/admin/users', params);
  return unwrap(r.data);
}

export async function deleteAdminUser(userId: string) {
  const r = await api.delete<ApiResponse<{ userId: string }>>(`/admin/users/${encodeURIComponent(userId)}`);
  return unwrap(r.data);
}

export async function updateAdminUserProfile(
  userId: string,
  params: { nickname?: string | null; avatarUrl?: string | null },
) {
  const r = await api.put<ApiResponse<{ userId: string; nickname: string; avatarUrl: string }>>(
    `/admin/users/${encodeURIComponent(userId)}/profile`,
    params,
  );
  return unwrap(r.data);
}

export async function resetAdminUserPassword(userId: string, newPassword: string) {
  const r = await api.post<ApiResponse<{ userId: string }>>(
    `/admin/users/${encodeURIComponent(userId)}/reset-password`,
    { newPassword },
  );
  return unwrap(r.data);
}

export async function searchAdminUsers(params: { keyword?: string; page?: number; pageSize?: number }) {
  const r = await api.get<
    ApiResponse<{ list: AdminUserDTO[]; pagination: { page: number; pageSize: number; total: number } }>
  >('/admin/users/search', { params });
  return unwrap(r.data);
}

export async function checkAdminUsernameAvailable(username: string) {
  const r = await api.get<ApiResponse<{ username: string; available: boolean }>>('/admin/users/username-available', {
    params: { username },
  });
  return unwrap(r.data);
}

export type NotificationDTO = {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  orderId?: string | null;
  tableId?: string | null;
  tableCode?: string | null;
  status: 'UNREAD' | 'READ' | 'HANDLED';
  readAt?: string | null;
  handledAt?: string | null;
  createdAt?: string;
  payload?: unknown;
};

export async function listNotifications(params: { status?: string; page?: number; pageSize?: number }) {
  const r = await api.get<
    ApiResponse<{ list: NotificationDTO[]; pagination: { page: number; pageSize: number; total: number } }>
  >('/admin/notifications', { params });
  return unwrap(r.data);
}

export async function markNotificationRead(notificationId: string) {
  const r = await api.put<ApiResponse<{ notificationId: string; status: string }>>(
    `/admin/notifications/${encodeURIComponent(notificationId)}/read`,
  );
  return unwrap(r.data);
}

export async function markAllNotificationsRead() {
  const r = await api.put<ApiResponse<{ updated: number }>>('/admin/notifications/read-all');
  return unwrap(r.data);
}

export async function markNotificationHandled(notificationId: string) {
  const r = await api.put<ApiResponse<{ notificationId: string; status: string }>>(
    `/admin/notifications/${encodeURIComponent(notificationId)}/handled`,
  );
  return unwrap(r.data);
}

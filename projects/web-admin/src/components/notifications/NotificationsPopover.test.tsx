import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from '../snackbar/SnackbarProvider';
import { NotificationsPopover } from './NotificationsPopover';

type ListNotificationsParams = { status?: string; page?: number; pageSize?: number };

const listNotifications = vi.fn();
const markAllNotificationsRead = vi.fn();
const markNotificationRead = vi.fn();
const markNotificationHandled = vi.fn();

vi.mock('../../api/users', () => ({
  listNotifications: (params: ListNotificationsParams) => listNotifications(params),
  markAllNotificationsRead: () => markAllNotificationsRead(),
  markNotificationRead: (id: string) => markNotificationRead(id),
  markNotificationHandled: (id: string) => markNotificationHandled(id),
}));

describe('NotificationsPopover', () => {
  beforeEach(() => {
    listNotifications.mockReset();
    markAllNotificationsRead.mockReset();
    markNotificationRead.mockReset();
    markNotificationHandled.mockReset();

    listNotifications.mockImplementation(async (params: ListNotificationsParams) => {
      if (params.status === 'UNREAD') {
        return {
          list: [
            {
              notificationId: 'n1',
              type: 'ORDER_CREATED',
              title: 't',
              message: 'm',
              status: 'UNREAD',
              createdAt: new Date().toISOString(),
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 2 },
        };
      }
      return {
        list: [
          {
            notificationId: 'n1',
            type: 'ORDER_CREATED',
            title: 't',
            message: 'm',
            status: 'UNREAD',
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      };
    });
    markAllNotificationsRead.mockImplementation(async () => ({ updated: 2 }));
    markNotificationRead.mockImplementation(async (id: string) => ({ notificationId: id, status: 'READ' }));
    markNotificationHandled.mockImplementation(async (id: string) => ({ notificationId: id, status: 'HANDLED' }));
  });

  it('supports mark all as read', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <NotificationsPopover />
          </MemoryRouter>
        </QueryClientProvider>
      </SnackbarProvider>,
    );

    fireEvent.click(screen.getAllByRole('button')[0]);
    const btn = await screen.findByRole('button', { name: '全部已读' });
    fireEvent.click(btn);
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledTimes(1));
  });

  it('shows platform restore warnings in a details dialog', async () => {
    listNotifications.mockImplementation(async () => ({
      list: [
        {
          notificationId: 'n-restore',
          type: 'PLATFORM_RESTORE_SUCCEEDED',
          title: '平台数据恢复完成',
          message: '恢复成功，有 2 条警告，请查看详情',
          status: 'UNREAD',
          createdAt: new Date().toISOString(),
          payload: {
            restoredAt: '2026-04-22T04:10:10.393Z',
            warnings: [
              { kind: 'DROPPED_COLUMNS', table: 'goods', columns: ['imageUrl'] },
              { kind: 'MISSING_TABLE', table: 'notifications' },
            ],
          },
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1 },
    }));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <NotificationsPopover />
          </MemoryRouter>
        </QueryClientProvider>
      </SnackbarProvider>,
    );

    fireEvent.click(screen.getAllByRole('button')[0]);
    const detailsBtn = await screen.findByRole('button', { name: '查看详情' });
    fireEvent.click(detailsBtn);
    await screen.findByText('DROPPED_COLUMNS');
    expect(screen.getByText('MISSING_TABLE')).toBeTruthy();
    expect(screen.getByText(/丢弃列：imageUrl/)).toBeTruthy();
  });
});

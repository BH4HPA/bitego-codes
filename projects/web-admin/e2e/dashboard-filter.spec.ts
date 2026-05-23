import { test, expect } from '@playwright/test';

function ok<T>(data: T) {
  return { success: true, code: 0, message: 'Success', data };
}

test('login -> dashboard -> click table filters active orders', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    const req = route.request();
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    if (b?.username === 'admin' && b?.password === 'admin') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ token: 't_admin' })),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, code: 40100, message: 'Unauthorized', data: null }),
    });
  });

  await page.route('**/api/v1/users/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        ok({ userId: 'admin_1', role: 'ADMIN', username: 'admin', nickname: '管理员', avatarUrl: '' }),
      ),
    });
  });

  await page.route('**/api/v1/admin/me/scopes', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        ok({
          list: [
            {
              scopeId: 'sc_1',
              userId: 'admin_1',
              tenantId: 'store_default',
              storeId: 'store_default',
              role: 'STORE_ADMIN',
              status: 'ACTIVE',
              createdAt: '2026-03-24T00:00:00.000Z',
              updatedAt: '2026-03-24T00:00:00.000Z',
            },
          ],
        }),
      ),
    });
  });

  await page.route('**/api/v1/admin/notifications**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } })),
    });
  });

  await page.route('**/api/v1/dashboard/overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        ok({
          tables: [
            {
              tableId: 'tbl_1',
              code: 'A01',
              status: 'OCCUPIED',
              openedAt: null,
              cart: null,
              activeOrders: [
                { orderId: 'o1', orderNo: 'NO1', status: 'Paid', totalAmount: '1.00', remark: null, createdAt: '' },
              ],
              totalOrderCount: 1,
              totalAmountExRefunded: '100',
            },
            {
              tableId: 'tbl_2',
              code: 'A02',
              status: 'OCCUPIED',
              openedAt: null,
              cart: null,
              activeOrders: [
                { orderId: 'o2', orderNo: 'NO2', status: 'Paid', totalAmount: '2.00', remark: null, createdAt: '' },
              ],
              totalOrderCount: 1,
              totalAmountExRefunded: '200',
            },
          ],
          activeOrders: [
            { orderId: 'o1', orderNo: 'NO1', tableCode: 'A01', status: 'Paid', remark: null, pendingItems: [] },
            { orderId: 'o2', orderNo: 'NO2', tableCode: 'A02', status: 'Paid', remark: null, pendingItems: [] },
          ],
        }),
      ),
    });
  });

  await page.goto('/login');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码').fill('admin');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/store\/overview/);

  await expect(page.getByRole('heading', { name: '活跃订单' })).toBeVisible();
  await expect(page.getByText('A01 · NO1')).toBeVisible();
  await expect(page.getByText('A02 · NO2')).toBeVisible();

  await page.getByRole('row', { name: /A01\(tbl_1\)/ }).click();
  await expect(page.getByText('桌号：A01')).toBeVisible();
  await expect(page.getByText('A01 · NO1')).toBeVisible();
  await expect(page.getByText('A02 · NO2')).toHaveCount(0);

  await page.getByRole('row', { name: /A01\(tbl_1\)/ }).click();
  await expect(page.getByText('A02 · NO2')).toBeVisible();
});

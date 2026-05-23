import { expect, test } from "@playwright/test";

test("home to order-meal navigation", async ({ page }) => {
  await page.goto("/");
  const tableInput = page.locator('taro-input-core[placeholder="请输入 tableId"]').locator("input");
  await tableInput.fill("table_e2e");
  await page.locator("taro-button-core", { hasText: "进入点餐页" }).click();
  await expect(page).toHaveURL(/order-meal\/index.*tableId=table_e2e/);
  await page.locator("taro-button-core", { hasText: "本桌订单" }).click();
  await expect(page).toHaveURL(/pages\/table-orders\/index/);
});

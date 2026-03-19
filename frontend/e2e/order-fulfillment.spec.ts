/**
 * E2E: Order detail page and fulfillment actions (Cancelar compra en curso / Forzar compra).
 * Verifies that the order detail loads and fulfillment controls are present when applicable.
 *
 * Env:
 *   PLAYWRIGHT_BASE_URL or BASE_URL - frontend URL (default http://localhost:5173)
 *   E2E_LOGIN_USER - username for login
 *   E2E_LOGIN_PASSWORD - password for login
 *   E2E_ORDER_ID (optional) - specific order ID to open; otherwise opens first order from list
 *
 * Prerequisites: Frontend and backend running; at least one order in the system.
 */
import { test, expect } from '@playwright/test';

const LOGIN_USER = process.env.E2E_LOGIN_USER || process.env.AUTOPILOT_LOGIN_USER;
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD || process.env.AUTOPILOT_LOGIN_PASSWORD;
const ORDER_ID = process.env.E2E_ORDER_ID;

test.describe('Order fulfillment page', () => {
  test.beforeEach(async ({ page }) => {
    if (!LOGIN_USER || !LOGIN_PASSWORD) {
      test.skip();
      return;
    }
  });

  test('login, open orders, open an order and verify fulfillment UI', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Ivan Reseller/i })).toBeVisible();

    await page.getByLabel(/Username/i).fill(LOGIN_USER);
    await page.getByLabel(/Password/i).fill(LOGIN_PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|autopilot|\/)/);
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/orders/);

    if (ORDER_ID) {
      await page.goto(`/orders/${ORDER_ID}`);
    } else {
      const firstOrderLink = page.getByRole('link', { name: /cmm[a-z0-9]+/i }).first();
      const count = await firstOrderLink.count();
      if (count === 0) {
        test.skip();
        return;
      }
      await firstOrderLink.click();
    }

    await expect(page).toHaveURL(/\/orders\/[a-z0-9]+/i);

    const statusBadge = page.getByText(/Comprando|Fallido|Pagado|Comprado|PAID|PURCHASED|FAILED|PURCHASING/i).first();
    await expect(statusBadge).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByRole('button', { name: /Cancelar compra en curso|Forzar compra en AliExpress|Reintentar compra/i }).or(page.getByText(/Estado pago|Comprando|Fallido|Pagado/i))
    ).toBeVisible();
  });

  test('when order is PURCHASING, Cancelar compra en curso is visible', async ({ page }) => {
    if (!ORDER_ID) {
      test.skip();
      return;
    }
    await page.goto('/login');
    await page.getByLabel(/Username/i).fill(LOGIN_USER!);
    await page.getByLabel(/Password/i).fill(LOGIN_PASSWORD!);
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|autopilot|\/)/);

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_ID}`));

    const cancelButton = page.getByRole('button', { name: /Cancelar compra en curso/i });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await cancelButton.click();
    await expect(cancelButton).toBeHidden({ timeout: 15000 });
  });
});

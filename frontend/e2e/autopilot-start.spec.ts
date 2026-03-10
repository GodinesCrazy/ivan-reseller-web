/**
 * E2E: Login, go to /autopilot, click "Start Autopilot", verify success.
 * Ensures the optimized cycle can be started from the browser flow.
 *
 * Env:
 *   PLAYWRIGHT_BASE_URL or BASE_URL - frontend URL (default http://localhost:5173)
 *   E2E_LOGIN_USER - username for login
 *   E2E_LOGIN_PASSWORD - password for login
 *
 * Prerequisites: Frontend and backend running; backend must accept login and /api/autopilot/start.
 */
import { test, expect } from '@playwright/test';

const LOGIN_USER = process.env.E2E_LOGIN_USER || process.env.AUTOPILOT_LOGIN_USER;
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD || process.env.AUTOPILOT_LOGIN_PASSWORD;

test.describe('Autopilot start from browser', () => {
  test.beforeEach(async ({ page }) => {
    if (!LOGIN_USER || !LOGIN_PASSWORD) {
      test.skip();
      return;
    }
  });

  test('login, open autopilot, start autopilot and verify', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Ivan Reseller/i })).toBeVisible();

    await page.getByLabel(/Username/i).fill(LOGIN_USER);
    await page.getByLabel(/Password/i).fill(LOGIN_PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|autopilot)/);
    await page.goto('/autopilot');
    await expect(page).toHaveURL(/\/autopilot/);

    const startButton = page.getByRole('button', { name: /Start Autopilot/i });
    await expect(startButton).toBeVisible();
    await startButton.click();

    await expect(page.getByText('Autopilot Status: Running')).toBeVisible({ timeout: 15000 });
  });
});

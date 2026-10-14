import { test, expect } from "@playwright/test";
import { loginAsController } from "./helpers/auth.js";

/**
 * Regression walkthrough against Docker (or start:prod) on :4000
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:4000 npx playwright test
 */
test.describe.serial("FinDataGraph controller walkthrough", () => {
  test("1 Spec Studio — seeded CRM↔GL generate → implement → run", async ({
    page,
  }) => {
    await loginAsController(page);

    await page.getByTestId("studio-chip-crm_to_accounting_revenue").click();
    await page.getByTestId("studio-generate").click();
    await expect(page.getByTestId("studio-implement")).toBeVisible();
    await page.getByTestId("studio-implement").click();
    await expect(page.getByTestId("studio-run")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("studio-run").click();
    await page.waitForURL(/\/exceptions/);
  });

  test("2 Runs — at least one completed run", async ({ page }) => {
    await loginAsController(page);
    await page.getByTestId("nav-runs").click();
    await expect(page.getByTestId("runs-page")).toBeVisible();
    await expect(page.locator("table.data").nth(1).locator("tbody tr").first()).toBeVisible();
    await expect(page.getByText(/completed/i).first()).toBeVisible();
  });

  test("3 Exceptions — open a break and resolve", async ({ page }) => {
    await loginAsController(page);
    await page.getByTestId("nav-exceptions").click();
    await page.getByRole("button", { name: "Open" }).click();

    const firstLink = page.locator('a[data-testid^="exception-link-"]').first();
    await expect(firstLink).toBeVisible({ timeout: 30_000 });
    await firstLink.click();

    await page.locator("#assignee").selectOption({ index: 1 });
    await page.getByTestId("exception-assign").click();
    await expect(page.getByText("Updated")).toBeVisible();

    await page.locator("#note").fill("Playwright regression resolve note");
    await page.getByTestId("exception-resolve").click();
    await expect(page.getByText("Updated")).toBeVisible();
    await expect(page.getByText(/resolved/i).first()).toBeVisible();
  });

  test("4 Sources — fixture Test + Sync", async ({ page }) => {
    await loginAsController(page);
    await page.getByTestId("nav-sources").click();
    await expect(page.getByTestId("sources-page")).toBeVisible();

    await page.getByTestId("source-test-postgres").click();
    await expect(page.getByTestId("sources-message")).toContainText(/postgres/i, {
      timeout: 30_000,
    });

    await page.getByTestId("source-sync-postgres").click();
    await expect(page.getByTestId("sources-message")).toContainText(/Synced/i, {
      timeout: 30_000,
    });
  });

  test("5 Connectors — stub Snowflake sync", async ({ page }) => {
    await loginAsController(page);
    await page.getByTestId("nav-connectors").click();

    const snowflakeSync = page.locator(
      'button[data-testid^="connector-sync-snowflake"]'
    ).first();
    await expect(snowflakeSync).toBeVisible();
    await snowflakeSync.click();
    await expect(page.getByText(/completed|stub/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("6 Jumpstart / Evidence / Audit — scorecard + trail", async ({
    page,
  }) => {
    await loginAsController(page);

    await page.getByTestId("nav-jumpstart").click();
    await expect(page.getByTestId("jumpstart-page")).toBeVisible();
    await expect(page.getByTestId("jumpstart-scorecard")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Match rate/i)).toBeVisible();

    await page.getByTestId("nav-evidence").click();
    await expect(page.getByTestId("evidence-page")).toBeVisible();
    await expect(page.locator("table.data tbody tr").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("nav-audit").click();
    await expect(page.getByTestId("audit-page")).toBeVisible();
    await expect(page.locator("table.data tbody tr").first()).toBeVisible({
      timeout: 30_000,
    });
  });
});

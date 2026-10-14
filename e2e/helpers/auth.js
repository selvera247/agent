export async function loginAsController(page) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill("controller@findatagraph.demo");
  await page.getByTestId("login-password").fill("password123");
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/studio/);
  await page.getByRole("heading", { name: "Spec Studio" }).waitFor();
}

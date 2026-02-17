import { chromium } from "playwright";

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const EXPECTED_PATH_PREFIX =
  process.env.SMOKE_EXPECTED_PATH_PREFIX ?? "/auth/sign-in";
const ROUTES = ["/dashboard", "/prospects", "/outreach", "/analytics", "/settings"];
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 15000);

function toAbsolute(route) {
  return `${BASE_URL}${route}`;
}

function formatResult(result) {
  const status = result.ok ? "PASS" : "FAIL";
  return `${status}  ${result.route}  ->  ${result.finalPath}`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  try {
    for (const route of ROUTES) {
      const url = toAbsolute(route);
      let ok = false;
      let finalUrl = "";
      let errorMessage = null;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
        await page.waitForTimeout(200);
        finalUrl = page.url();
        const finalPath = new URL(finalUrl).pathname;
        ok = finalPath.startsWith(EXPECTED_PATH_PREFIX);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      const finalPath = finalUrl ? new URL(finalUrl).pathname : "(no-navigation)";
      results.push({
        route,
        finalPath,
        ok,
        errorMessage,
      });
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`Smoke base URL: ${BASE_URL}`);
  console.log(`Expected redirect path prefix: ${EXPECTED_PATH_PREFIX}`);
  console.log("");
  results.forEach((result) => {
    console.log(formatResult(result));
    if (result.errorMessage) {
      console.log(`      Error: ${result.errorMessage}`);
    }
  });

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error("");
    console.error(
      `Protected-route smoke failed (${failures.length}/${results.length} routes).`,
    );
    process.exit(1);
  }

  console.log("");
  console.log("Protected-route smoke passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Smoke script failed: ${message}`);
  process.exit(1);
});

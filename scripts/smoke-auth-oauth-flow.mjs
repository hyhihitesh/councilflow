import { chromium } from "playwright";

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 20000);

function ok(name, details) {
  return { name, ok: true, details };
}

function fail(name, details) {
  return { name, ok: false, details };
}

function summarize(result) {
  const status = result.ok ? "PASS" : "FAIL";
  return `${status}  ${result.name}  ${result.details}`;
}

async function verifyProtectedRedirect(page) {
  await page.context().clearCookies();
  await page.goto(`${BASE_URL}/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT_MS,
  });

  const current = new URL(page.url());
  const path = current.pathname;

  if (path.startsWith("/auth/sign-in")) {
    return ok("Protected route redirects", `dashboard -> ${current.pathname}${current.search}`);
  }

  return fail("Protected route redirects", `expected /auth/sign-in*, got ${current.pathname}`);
}

async function verifyGoogleOAuthKickoff(page) {
  await page.context().clearCookies();
  await page.goto(`${BASE_URL}/auth/sign-in`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT_MS,
  });

  let actionStatus = null;
  let actionLocation = null;
  const actionResponseHandler = async (response) => {
    const req = response.request();
    const isLegacyActionPost =
      req.method() === "POST" && req.url().startsWith(`${BASE_URL}/auth/sign-in`);
    const isOAuthStartGet =
      req.method() === "GET" && req.url().startsWith(`${BASE_URL}/auth/oauth`);

    if ((isLegacyActionPost || isOAuthStartGet) && actionStatus === null) {
      actionStatus = response.status();
      actionLocation = response.headers().location ?? null;
    }
  };

  page.on("response", actionResponseHandler);

  const submitStart = Date.now();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.waitForTimeout(1200);
  page.off("response", actionResponseHandler);

  const finalUrl = page.url();
  const final = new URL(finalUrl);
  const elapsedMs = Date.now() - submitStart;

  if ((actionStatus === 303 || actionStatus === 307) && actionLocation) {
    const locationIsGoogle = actionLocation.includes("accounts.google.com");
    const locationIsLocal = actionLocation.startsWith("/");
    const locationIsSupabaseAuthorize =
      actionLocation.includes(".supabase.co/auth/v1/authorize") &&
      actionLocation.includes("provider=google");
    if (locationIsGoogle || locationIsLocal || locationIsSupabaseAuthorize) {
      return ok(
        "Google OAuth kickoff",
        `server action redirect=${actionStatus} location=${actionLocation} in ${elapsedMs}ms`,
      );
    }
  }

  const endedAtGoogle = final.hostname.includes("accounts.google.com");
  const endedAuthenticated =
    final.origin === BASE_URL &&
    (final.pathname.startsWith("/onboarding") || final.pathname.startsWith("/dashboard"));

  if (endedAtGoogle) {
    return ok(
      "Google OAuth kickoff",
      `redirected to Google (${final.origin}${final.pathname}) in ${elapsedMs}ms`,
    );
  }

  if (endedAuthenticated) {
    return ok(
      "Google OAuth kickoff",
      `OAuth roundtrip completed back to app (${final.pathname}) in ${elapsedMs}ms`,
    );
  }

  return fail(
    "Google OAuth kickoff",
    `unexpected URL ${final.origin}${final.pathname}${final.search}, actionStatus=${actionStatus}, actionLocation=${actionLocation}`,
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  try {
    results.push(await verifyProtectedRedirect(page));
    results.push(await verifyGoogleOAuthKickoff(page));
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`Smoke base URL: ${BASE_URL}`);
  console.log("");
  for (const result of results) {
    console.log(summarize(result));
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error("");
    console.error(`Auth OAuth smoke failed (${failures.length}/${results.length} checks).`);
    process.exit(1);
  }

  console.log("");
  console.log("Auth OAuth smoke passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Smoke script failed: ${message}`);
  process.exit(1);
});

export function extractSchedulerToken(request: Request) {
  const headerToken =
    request.headers.get("x-councilflow-scheduler-token");
  if (headerToken) return headerToken.trim();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  return queryToken?.trim() ?? "";
}

export function resolveExpectedSchedulerToken(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }

  return "";
}

export function isSchedulerAuthorized(request: Request, expectedToken: string) {
  const providedToken = extractSchedulerToken(request);
  return {
    providedToken,
    authorized: Boolean(expectedToken) && providedToken === expectedToken,
  };
}

import { NextResponse } from "next/server";

type ErrorEnvelope = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
};

function sanitizeRequestId(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

export function getRequestId(request: Request) {
  return (
    sanitizeRequestId(request.headers.get("x-request-id")) ??
    sanitizeRequestId(request.headers.get("x-correlation-id")) ??
    crypto.randomUUID()
  );
}

export function apiSuccess<T>(
  request: Request,
  data: T,
  init?: {
    status?: number;
  },
) {
  const requestId = getRequestId(request);
  const response = NextResponse.json(
    {
      data,
      requestId,
    },
    { status: init?.status ?? 200 },
  );
  response.headers.set("x-request-id", requestId);
  return response;
}

export function apiError(
  request: Request,
  error: {
    code: string;
    message: string;
    details?: unknown;
  },
  init?: {
    status?: number;
  },
) {
  const requestId = getRequestId(request);
  const payload: { error: ErrorEnvelope } = {
    error: {
      code: error.code,
      message: error.message,
      requestId,
    },
  };

  if (error.details !== undefined) {
    payload.error.details = error.details;
  }

  const response = NextResponse.json(payload, {
    status: init?.status ?? 500,
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

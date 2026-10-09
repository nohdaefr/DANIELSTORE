import "server-only";
import { inspect } from "node:util";
import type { ApiErrorBody, ApiErrorCode } from "@/types";
import { redactSecrets } from "./env-guard";

// Shared helpers for Route Handlers: consistent JSON, safe errors, request ids.

export function newRequestId(): string {
  return crypto.randomUUID();
}

function baseHeaders(requestId: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Request-Id", requestId);
  return headers;
}

export function jsonResponse(
  body: unknown,
  { status = 200, requestId, headers }: { status?: number; requestId: string; headers?: HeadersInit },
): Response {
  return Response.json(body, { status, headers: baseHeaders(requestId, headers) });
}

/**
 * Error response. `message` must be safe for end users: never pass raw
 * database/exception messages here — log those with logServerError().
 */
export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  { requestId, details, headers }: { requestId: string; details?: unknown; headers?: HeadersInit },
): Response {
  const body: ApiErrorBody = {
    error: { code, message, requestId, ...(details === undefined ? {} : { details }) },
  };
  return jsonResponse(body, { status, requestId, headers });
}

/**
 * Full details go to the server log only, tagged with the request id.
 * Keys and tokens are redacted before anything is written.
 */
export function logServerError(requestId: string, context: string, error: unknown): void {
  const detail = inspect(error, { depth: 4, breakLength: Infinity });
  console.error(redactSecrets(`[${requestId}] ${context} ${detail}`));
}

export type JsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; status: 400 | 413 | 415; code: ApiErrorCode; message: string };

/** Reads a JSON body with a hard size limit (also for chunked uploads). */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(contentType)) {
    return { ok: false, status: 415, code: "UNSUPPORTED_MEDIA_TYPE", message: "יש לשלוח Content-Type: application/json" };
  }

  const tooLarge = { ok: false, status: 413, code: "PAYLOAD_TOO_LARGE", message: "גוף הבקשה גדול מדי" } as const;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return tooLarge;

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return tooLarge;
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, code: "INVALID_JSON", message: "גוף הבקשה אינו JSON תקין" };
  }
}

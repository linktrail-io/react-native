/**
 * Error codes, camelCase, matching the native `LinkTrailError` case names.
 * `unknown` covers anything that isn't a LinkTrail error.
 */
export type LinkTrailErrorCode =
  | 'missingApiKey'
  | 'invalidApiKey'
  | 'notConfigured'
  | 'invalidUrl'
  | 'notALinkTrailUrl'
  | 'transport'
  | 'server'
  | 'decoding'
  | 'emptyResponse'
  | 'invalidArgument'
  | 'invalidEvent'
  | 'unknown';

const CODES: ReadonlySet<string> = new Set<LinkTrailErrorCode>([
  'missingApiKey',
  'invalidApiKey',
  'notConfigured',
  'invalidUrl',
  'notALinkTrailUrl',
  'transport',
  'server',
  'decoding',
  'emptyResponse',
  'invalidArgument',
  'invalidEvent',
  'unknown',
]);

/** Maps a native code to a `LinkTrailErrorCode`; anything unrecognised is `unknown`. */
export function normalizeErrorCode(raw: unknown): LinkTrailErrorCode {
  return typeof raw === 'string' && CODES.has(raw)
    ? (raw as LinkTrailErrorCode)
    : 'unknown';
}

/** The fields shared by rejected promises and `onError` events. */
export interface LinkTrailErrorInfo {
  code: LinkTrailErrorCode;
  /** The native error's message, unchanged. */
  message: string;
  /** HTTP status, for `server` errors. */
  statusCode?: number;
  /** Response body, for `server` errors when the server sent one. */
  body?: string;
  /** Why the event was rejected, for `invalidEvent` errors (e.g. `name is blank`). */
  reason?: string;
}

/** The error every LinkTrail promise rejects with. */
export class LinkTrailError extends Error implements LinkTrailErrorInfo {
  readonly code: LinkTrailErrorCode;
  readonly statusCode?: number;
  readonly body?: string;
  readonly reason?: string;

  constructor(info: LinkTrailErrorInfo) {
    super(info.message);
    this.name = 'LinkTrailError';
    this.code = info.code;
    if (info.statusCode !== undefined) this.statusCode = info.statusCode;
    if (info.body !== undefined) this.body = info.body;
    if (info.reason !== undefined) this.reason = info.reason;
  }
}

type RawError = {
  code?: unknown;
  message?: unknown;
  statusCode?: unknown;
  body?: unknown;
  reason?: unknown;
  userInfo?: { statusCode?: unknown; body?: unknown; reason?: unknown } | null;
};

/** Builds the error fields from a native rejection or `onError` payload. */
export function toErrorInfo(raw: unknown): LinkTrailErrorInfo {
  const e = (raw ?? {}) as RawError;
  const statusCode = e.statusCode ?? e.userInfo?.statusCode;
  const body = e.body ?? e.userInfo?.body;
  const reason = e.reason ?? e.userInfo?.reason;
  const info: LinkTrailErrorInfo = {
    code: normalizeErrorCode(e.code),
    message: typeof e.message === 'string' ? e.message : String(raw),
  };
  if (typeof statusCode === 'number') info.statusCode = statusCode;
  if (typeof body === 'string') info.body = body;
  if (typeof reason === 'string') info.reason = reason;
  return info;
}

/** Converts a native rejection into a `LinkTrailError`. */
export function toLinkTrailError(raw: unknown): LinkTrailError {
  if (raw instanceof LinkTrailError) return raw;
  return new LinkTrailError(toErrorInfo(raw));
}

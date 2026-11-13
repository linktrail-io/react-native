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
  | 'unknown';

/** The snake_case codes used up to 0.1.0. Exposed as `legacyCode` for one release. */
export type LinkTrailLegacyErrorCode =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'not_configured'
  | 'invalid_url'
  | 'not_a_linktrail_url'
  | 'transport'
  | 'server'
  | 'decoding'
  | 'empty_response'
  | 'invalid_argument'
  | 'unknown';

const LEGACY: Record<LinkTrailErrorCode, LinkTrailLegacyErrorCode> = {
  missingApiKey: 'missing_api_key',
  invalidApiKey: 'invalid_api_key',
  notConfigured: 'not_configured',
  invalidUrl: 'invalid_url',
  notALinkTrailUrl: 'not_a_linktrail_url',
  transport: 'transport',
  server: 'server',
  decoding: 'decoding',
  emptyResponse: 'empty_response',
  invalidArgument: 'invalid_argument',
  unknown: 'unknown',
};

const FROM_LEGACY = Object.fromEntries(
  Object.entries(LEGACY).map(([code, legacy]) => [legacy, code]),
) as Record<string, LinkTrailErrorCode>;

/** Maps a native code (camelCase, or snake_case from an older native build) to camelCase. */
export function normalizeErrorCode(raw: unknown): LinkTrailErrorCode {
  if (typeof raw !== 'string') return 'unknown';
  if (raw in LEGACY) return raw as LinkTrailErrorCode;
  return FROM_LEGACY[raw] ?? 'unknown';
}

/** The fields shared by rejected promises and `onError` events. */
export interface LinkTrailErrorInfo {
  code: LinkTrailErrorCode;
  /**
   * The pre-0.1.1 snake_case code (`missing_api_key`, …).
   * @deprecated Use `code`. Removed in the next minor release.
   */
  legacyCode: LinkTrailLegacyErrorCode;
  /** The native error's message, unchanged. */
  message: string;
  /** HTTP status, for `server` errors. */
  statusCode?: number;
  /** Response body, for `server` errors when the server sent one. */
  body?: string;
}

/** The error every LinkTrail promise rejects with. */
export class LinkTrailError extends Error implements LinkTrailErrorInfo {
  readonly code: LinkTrailErrorCode;
  readonly legacyCode: LinkTrailLegacyErrorCode;
  readonly statusCode?: number;
  readonly body?: string;

  constructor(info: Omit<LinkTrailErrorInfo, 'legacyCode'>) {
    super(info.message);
    this.name = 'LinkTrailError';
    this.code = info.code;
    this.legacyCode = LEGACY[info.code];
    if (info.statusCode !== undefined) this.statusCode = info.statusCode;
    if (info.body !== undefined) this.body = info.body;
  }
}

type RawError = {
  code?: unknown;
  message?: unknown;
  statusCode?: unknown;
  body?: unknown;
  userInfo?: { statusCode?: unknown; body?: unknown } | null;
};

/** Builds the error fields from a native rejection or `onError` payload. */
export function toErrorInfo(raw: unknown): LinkTrailErrorInfo {
  const e = (raw ?? {}) as RawError;
  const code = normalizeErrorCode(e.code);
  const statusCode = e.statusCode ?? e.userInfo?.statusCode;
  const body = e.body ?? e.userInfo?.body;
  const info: LinkTrailErrorInfo = {
    code,
    legacyCode: LEGACY[code],
    message: typeof e.message === 'string' ? e.message : String(raw),
  };
  if (typeof statusCode === 'number') info.statusCode = statusCode;
  if (typeof body === 'string') info.body = body;
  return info;
}

/** Converts a native rejection into a `LinkTrailError`. */
export function toLinkTrailError(raw: unknown): LinkTrailError {
  if (raw instanceof LinkTrailError) return raw;
  return new LinkTrailError(toErrorInfo(raw));
}

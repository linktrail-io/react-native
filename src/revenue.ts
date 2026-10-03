/** Input to `LinkTrail.trackRevenue`. */
export interface LinkTrailRevenueParams {
  /**
   * The store's unique id for this payment — the **dedupe key**. StoreKit
   * `transactionId` on iOS, Google Play `orderId` on Android. 1–255 characters
   * (surrounding whitespace is trimmed).
   */
  transactionId: string;
  /** Amount charged, finite and `>= 0`. Rounded to 2 decimals by the SDK. */
  value: number;
  /** 3-letter ISO 4217 code (`'usd'` is normalised to `'USD'`). */
  currency: string;
  /** Optional store product / SKU id. Blank is treated as absent. */
  productId?: string;
}

/** The server's acknowledgement of a revenue report. */
export interface LinkTrailRevenueResult {
  /** Server-side id of the recorded revenue event, when one was created. */
  id?: number;
  /** Whether the purchase was attributed to a LinkTrail link/campaign. */
  attributed: boolean;
  /**
   * `true` when this `transactionId` was already recorded — the repeat was
   * ignored and nothing was double-counted.
   */
  duplicate: boolean;
}

/** Machine-readable codes for `LinkTrailRevenueError`. */
export type LinkTrailRevenueErrorCode =
  | 'invalid_transaction_id'
  | 'invalid_value'
  | 'invalid_currency';

/**
 * Thrown (as a rejected promise) by `trackRevenue` when the input is invalid.
 * Nothing is sent. Transport / server failures are not wrapped — they reject
 * with the native error (`code` such as `transport`, `server`,
 * `not_configured`) and the report is retried natively.
 */
export class LinkTrailRevenueError extends Error {
  readonly code: LinkTrailRevenueErrorCode;

  constructor(code: LinkTrailRevenueErrorCode, message: string) {
    super(message);
    this.name = 'LinkTrailRevenueError';
    this.code = code;
    Object.setPrototypeOf(this, LinkTrailRevenueError.prototype);
  }
}

const MAX_TRANSACTION_ID_LENGTH = 255;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

/** The validated, normalised arguments handed to the native module. */
export interface NormalizedRevenue {
  transactionId: string;
  value: number;
  currency: string;
  productId?: string;
}

/**
 * Applies the same rules as the native SDKs: id trimmed and 1–255 chars, value
 * finite and `>= 0`, currency 3 letters (uppercased). Throws
 * `LinkTrailRevenueError` otherwise.
 */
export function normalizeRevenue(params: LinkTrailRevenueParams): NormalizedRevenue {
  const { transactionId, value, currency, productId } = params ?? {};

  const txn = typeof transactionId === 'string' ? transactionId.trim() : '';
  if (txn.length === 0 || txn.length > MAX_TRANSACTION_ID_LENGTH) {
    throw new LinkTrailRevenueError(
      'invalid_transaction_id',
      'Revenue transactionId must be 1–255 characters.'
    );
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new LinkTrailRevenueError(
      'invalid_value',
      'Revenue value must be a finite number >= 0.'
    );
  }
  const cur = typeof currency === 'string' ? currency.trim() : '';
  if (!CURRENCY_PATTERN.test(cur)) {
    throw new LinkTrailRevenueError(
      'invalid_currency',
      'Revenue currency must be a 3-letter ISO 4217 code (e.g. "USD").'
    );
  }
  const product = typeof productId === 'string' ? productId.trim() : '';

  return {
    transactionId: txn,
    value,
    currency: cur.toUpperCase(),
    ...(product.length > 0 ? { productId: product } : {}),
  };
}

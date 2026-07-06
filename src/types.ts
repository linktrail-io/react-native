/**
 * The deep-link payload the SDK routes on. Returned by install attribution
 * (deferred deep linking), re-engagement opens, and link resolution.
 */
export interface LinkTrailDeepLink {
  /** The link's short slug. */
  slug?: string;
  /** The canonical public URL of the link. */
  url?: string;
  /** The in-app destination path, e.g. `/products/42`. */
  deepLinkPath?: string;
  iosUrl?: string;
  androidUrl?: string;
  fallbackUrl?: string;
  campaign?: string;
  channel?: string;
  /** UTM parameters carried by the link. */
  utm?: Record<string, string>;
  /** Arbitrary key/value payload configured on the link. */
  customData?: Record<string, string>;
  /** The destination path to route to, defaulting to `/` when none is set. */
  path: string;
  /** Whether this link points at a specific destination (not the app root). */
  hasRoutableDestination: boolean;
}

/** Where a delivered deep link came from. */
export type LinkTrailLinkSource = 'deferred' | 'reengagement';

/** The result of recording an install or open and attributing it. */
export interface LinkTrailAttribution {
  /** Server-side event id for this install/open. */
  id?: number;
  /** Whether the event was matched to a click. */
  attributed: boolean;
  /** The resolved deep link to route on, when attributed. */
  deepLink?: LinkTrailDeepLink;
}

/** The acknowledgement returned when recording a custom event. */
export interface LinkTrailEventResult {
  id?: number;
  attributed: boolean;
}

/** An error reported by the native SDK via the `onError` callback. */
export interface LinkTrailErrorEvent {
  /**
   * Stable machine-readable code: `missing_api_key`, `invalid_api_key`,
   * `transport`, `server`, `decoding`, `empty_response`, `invalid_url`,
   * `not_a_linktrail_url`, `not_configured`, or `unknown`.
   */
  code: string;
  /** Human-readable description. */
  message: string;
}

/** Severity levels for SDK logging, from most to least verbose. */
export type LinkTrailLogLevel = 'debug' | 'info' | 'warning' | 'error' | 'none';

/** Retry behavior for transient network failures (timeouts, 5xx, 429). */
export interface LinkTrailRetryPolicy {
  /** Total attempts including the first try (1 = no retry). Default 3. */
  maxAttempts?: number;
  /** Base delay for exponential backoff, in milliseconds. Default 500. */
  baseDelayMillis?: number;
  /** Upper bound on any single backoff delay, in milliseconds. Default 8000. */
  maxDelayMillis?: number;
}

/** Configuration for `LinkTrail.configure(...)`. */
export interface LinkTrailOptions {
  /** Master switch for native SDK logging. Default `false`. */
  logEnabled?: boolean;
  /** Minimum severity to emit when logging is enabled. Default `'info'`. */
  logLevel?: LinkTrailLogLevel;
  /** Per-request network timeout, in milliseconds. Default 15000. */
  requestTimeoutMillis?: number;
  /** Retry policy applied to transient network failures. */
  retryPolicy?: LinkTrailRetryPolicy;
  /**
   * Link hosts the SDK should treat as its own (e.g. `['go.acme.com']`).
   * When non-empty, `handleDeepLink` ignores URLs on other hosts. Empty =
   * handle every parseable link.
   */
  linkDomains?: string[];
  /**
   * Whether `configure` automatically sends the install event. Default `true`.
   * Set `false` to defer until consent, then call `trackInstall()` manually.
   */
  autoTrackInstall?: boolean;
  /**
   * React Native-only convenience: when `true` (the default), the wrapper
   * listens to the RN `Linking` API and forwards incoming URLs (including the
   * initial launch URL) to the native SDK, so you don't have to call
   * `handleDeepLink` yourself. Set `false` to forward URLs manually.
   */
  autoHandleLinks?: boolean;
}

/** SKAdNetwork 4.0+ coarse conversion value bucket (iOS only). */
export type LinkTrailCoarseConversionValue = 'low' | 'medium' | 'high';

/** A subscription returned by the event-listener APIs. */
export interface LinkTrailSubscription {
  remove(): void;
}

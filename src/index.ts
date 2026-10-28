import { Linking } from 'react-native';
import NativeLinkTrail from './NativeLinkTrail';
import type {
  LinkTrailAttribution,
  LinkTrailCoarseConversionValue,
  LinkTrailDeepLink,
  LinkTrailErrorEvent,
  LinkTrailEventResult,
  LinkTrailLinkSource,
  LinkTrailOptions,
  LinkTrailSubscription,
} from './types';

import { toErrorInfo, toLinkTrailError } from './errors';
import { LINKTRAIL_RN_VERSION } from './version';

export * from './types';
export {
  LinkTrailError,
  type LinkTrailErrorCode,
  type LinkTrailErrorInfo,
  type LinkTrailLegacyErrorCode,
} from './errors';
export {
  LinkTrailPasteButton,
  type LinkTrailPasteButtonProps,
} from './LinkTrailPasteButton';

/** Rejects with a `LinkTrailError` (camelCase `code`, `legacyCode`, native message). */
function call<T>(promise: Promise<unknown>): Promise<T> {
  return promise.then(
    (value) => value as T,
    (error: unknown) => {
      throw toLinkTrailError(error);
    }
  );
}

// ── Link / attribution delivery ─────────────────────────────────────────────
//
// Native can emit before any JS listener exists (a deferred link resolving
// during the auto-tracked install, a link opened at launch). RN event emitters
// drop events with no subscriber, so the bridge owns one native subscription
// per event and fans out to JS listeners:
// - Links: the native `onLink` is registered only when the first JS listener
//   subscribes (`startLinkDelivery`), so the native SDK keeps a saved deferred
//   link (persisted across launches) until JS can take it. Re-engagement links
//   resolved by `autoHandleLinks` before then are buffered here (max 10, oldest
//   dropped) and delivered once, in order, to the first listener.
// - Attribution: the last value is kept and replayed to the first listener.

type LinkListener = (link: LinkTrailDeepLink, source: LinkTrailLinkSource) => void;
type AttributionListener = (attribution: LinkTrailAttribution) => void;

const LINK_BUFFER_LIMIT = 10;
const linkListeners = new Set<LinkListener>();
const attributionListeners = new Set<AttributionListener>();
let linkBuffer: Array<{ link: LinkTrailDeepLink; source: LinkTrailLinkSource }> = [];
let linkDeliveryStarted = false;
let nativeLinkSubscription: LinkTrailSubscription | null = null;
let nativeAttributionSubscription: LinkTrailSubscription | null = null;
let lastAttribution: LinkTrailAttribution | null = null;
let attributionReplayed = false;

function emitLink(link: LinkTrailDeepLink, source: LinkTrailLinkSource): void {
  for (const listener of [...linkListeners]) listener(link, source);
}

function bufferLink(link: LinkTrailDeepLink, source: LinkTrailLinkSource): void {
  linkBuffer.push({ link, source });
  if (linkBuffer.length > LINK_BUFFER_LIMIT) linkBuffer.shift();
}

function ensureAttributionSubscription(): void {
  nativeAttributionSubscription ??= NativeLinkTrail.onAttribution((payload) => {
    const attribution = payload as unknown as LinkTrailAttribution;
    lastAttribution = attribution;
    if (attributionListeners.size === 0) return; // kept for the first listener
    attributionReplayed = true;
    for (const listener of [...attributionListeners]) listener(attribution);
  });
}

let linkingSubscription: LinkTrailSubscription | null = null;
let initialUrlForwarded = false;

/** Forwards RN `Linking` URLs (initial + subsequent) to the native SDK. */
function startLinkForwarding(): void {
  if (!initialUrlForwarded) {
    initialUrlForwarded = true;
    Linking.getInitialURL()
      .then((url) => (url ? forwardUrl(url) : null))
      .catch(() => {
        // Non-LinkTrail URLs and transport failures are reported via onError.
      });
  }
  linkingSubscription ??= Linking.addEventListener('url', ({ url }) => {
    forwardUrl(url).catch(() => {});
  });
}

/**
 * Hands a URL to native. Before the first `onLink` listener the native `onLink`
 * isn't registered yet, so a resolved re-engagement link is buffered here.
 */
async function forwardUrl(url: string): Promise<void> {
  const link = (await NativeLinkTrail.handleDeepLink(url)) as LinkTrailDeepLink | null;
  if (link && !linkDeliveryStarted) bufferLink(link, 'reengagement');
}

function stopLinkForwarding(): void {
  linkingSubscription?.remove();
  linkingSubscription = null;
}

export const LinkTrail = {
  /** This package's version (`linktrail-react-native`), e.g. `"0.1.1"`. */
  version: LINKTRAIL_RN_VERSION,

  /**
   * The embedded native LinkTrail SDK version (iOS `LinkTrailSDK` or Android
   * `io.linktrail:sdk`), e.g. `"0.1.0"`.
   */
  get nativeSdkVersion(): string {
    return NativeLinkTrail.nativeSdkVersion();
  },

  /**
   * Configures the SDK with your workspace API key (`lt_live_…`). Call once at
   * app launch, before any other LinkTrail API. The install is tracked
   * automatically unless `options.autoTrackInstall` is `false`.
   *
   * Rejects with code `missingApiKey` when the key is blank. Calling it again
   * with the same key and options is a no-op; different options replace the
   * native instance.
   *
   * Custom link domains must be listed in `options.linkDomains`; other URLs are
   * ignored by `handleDeepLink`.
   */
  async configure(apiKey: string, options: LinkTrailOptions = {}): Promise<void> {
    const { autoHandleLinks = true, ...nativeOptions } = options;
    ensureAttributionSubscription();
    await call<void>(NativeLinkTrail.configure(apiKey, nativeOptions));
    if (autoHandleLinks) {
      startLinkForwarding();
    } else {
      stopLinkForwarding();
    }
  },

  /**
   * Registers a listener for **both** deferred deep links (first launch after
   * install) and re-engagement links (app already installed) — `source` says
   * which. Links that arrive before the first listener aren't lost: the first
   * listener gets them once, in order (later listeners get no replays), so it's
   * fine to subscribe after a splash or login screen.
   */
  onLink(listener: LinkListener): LinkTrailSubscription {
    const first = !linkDeliveryStarted;
    linkListeners.add(listener);
    if (first) {
      linkDeliveryStarted = true;
      nativeLinkSubscription ??= NativeLinkTrail.onLink((payload) => {
        const event = payload as {
          link: LinkTrailDeepLink;
          source: LinkTrailLinkSource;
        };
        emitLink(event.link, event.source);
      });
      const buffered = linkBuffer;
      linkBuffer = [];
      for (const { link, source } of buffered) listener(link, source);
      NativeLinkTrail.startLinkDelivery();
    }
    return { remove: () => linkListeners.delete(listener) };
  },

  /**
   * Registers a listener for attribution results (attributed or organic). The
   * first listener also gets the latest result that arrived before it
   * subscribed.
   */
  onAttribution(listener: AttributionListener): LinkTrailSubscription {
    ensureAttributionSubscription();
    attributionListeners.add(listener);
    if (!attributionReplayed && lastAttribution) {
      attributionReplayed = true;
      listener(lastAttribution);
    }
    return { remove: () => attributionListeners.delete(listener) };
  },

  /**
   * Registers a listener invoked when a fire-and-forget native operation
   * (auto-tracked install, queued event, link open) fails after retries.
   */
  onError(
    listener: (error: LinkTrailErrorEvent) => void
  ): LinkTrailSubscription {
    return NativeLinkTrail.onError((payload) => {
      listener(toErrorInfo(payload));
    });
  },

  /**
   * Sends the install event and resolves attribution. Only needed when
   * `autoTrackInstall` is `false` (e.g. deferred until consent) — `configure`
   * does this automatically otherwise. Already-tracked installs resolve from
   * cache unless `force` is `true`.
   */
  trackInstall(force = false): Promise<LinkTrailAttribution> {
    return call(NativeLinkTrail.trackInstall(force));
  },

  /**
   * iOS: sends the install using a deferred click token you read from the
   * clipboard yourself (advanced — normally the `<LinkTrailPasteButton/>` does
   * this for you). Android: equivalent to `trackInstall`.
   */
  trackInstallWithClickToken(
    clickToken: string,
    force = false
  ): Promise<LinkTrailAttribution> {
    return call(NativeLinkTrail.trackInstallWithClickToken(clickToken, force));
  },

  /**
   * Records a custom post-install event (purchase, signup, conversion).
   * On failure the event is queued natively and retried; the returned promise
   * rejects so you can observe the first failure.
   */
  trackEvent(
    name: string,
    options: { value?: number; currency?: string } = {}
  ): Promise<LinkTrailEventResult> {
    return call(
      NativeLinkTrail.trackEvent(name, options.value, options.currency)
    );
  },

  /**
   * Forwards an incoming URL to the SDK. Resolves with the resolved deep link,
   * or `null` when the URL is not a LinkTrail link (not `https` on `linktrail.io`
   * or a `linkDomains` host): those make no network call and fire no `onError`.
   * You only need this when
   * `autoHandleLinks` is `false`; routing normally happens via `onLink`.
   */
  handleDeepLink(url: string): Promise<LinkTrailDeepLink | null> {
    return call(NativeLinkTrail.handleDeepLink(url));
  },

  /** The most recent attribution result (cached across launches), or `null`. */
  getLastAttribution(): Promise<LinkTrailAttribution | null> {
    return call(NativeLinkTrail.getLastAttribution());
  },

  /** The most recent resolved deep link from the current session, or `null`. */
  getLastDeepLink(): Promise<LinkTrailDeepLink | null> {
    return call(NativeLinkTrail.getLastDeepLink());
  },

  /**
   * iOS: requests App Tracking Transparency authorization (for apps using
   * SKAdNetwork) and resolves with whether tracking was granted.
   * Android: not applicable (there is no ATT equivalent) — resolves `true`,
   * meaning the platform does not restrict tracking. This is not the user's
   * consent: use `setConsent` / `requireConsent` for that.
   */
  requestTrackingAuthorization(): Promise<boolean> {
    return call(NativeLinkTrail.requestTrackingAuthorization());
  },

  /**
   * iOS: registers the app for SKAdNetwork attribution. Call early in the app
   * lifecycle. Android: no-op.
   */
  registerForSKAdAttribution(): void {
    NativeLinkTrail.registerForSKAdAttribution();
  },

  /**
   * iOS: updates the SKAdNetwork conversion value for a post-install event.
   * Android: no-op.
   */
  updateConversionValue(
    value: number,
    coarseValue?: LinkTrailCoarseConversionValue
  ): void {
    NativeLinkTrail.updateConversionValue(value, coarseValue);
  },

  /**
   * Grants or revokes the user's tracking consent. Only meaningful when
   * `configure` was called with `requireConsent: true` (the default).
   *
   * Granting releases the held install and flushes queued events; revoking
   * stops sending and drops the queue. The SDK persists the decision, but
   * exposes **no getter** — your app is the source of truth and must persist
   * the choice and call `setConsent` again on every launch after `configure`.
   */
  setConsent(granted: boolean): void {
    NativeLinkTrail.setConsent(granted);
  },

  /**
   * Clears the install flag, cached attribution, queued events, and device id,
   * so the next launch sends a fresh install event. Testing only.
   */
  resetForTesting(): void {
    NativeLinkTrail.resetForTesting();
  },
};

export default LinkTrail;

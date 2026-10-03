import { Linking } from 'react-native';
import NativeLinkTrail from './NativeLinkTrail';
import { Identity } from './identity';
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

export * from './types';
export {
  LinkTrailPasteButton,
  type LinkTrailPasteButtonProps,
} from './LinkTrailPasteButton';

const identity = new Identity({
  persistUserId: (userId) => NativeLinkTrail.persistUserId(userId ?? undefined),
  loadUserId: () => NativeLinkTrail.loadUserId(),
  forwardUserId: (userId) => NativeLinkTrail.forwardUserId(userId ?? undefined),
});

let linkingSubscription: LinkTrailSubscription | null = null;
let initialUrlForwarded = false;

/** Forwards RN `Linking` URLs (initial + subsequent) to the native SDK. */
function startLinkForwarding(): void {
  if (!initialUrlForwarded) {
    initialUrlForwarded = true;
    Linking.getInitialURL()
      .then((url) => (url ? NativeLinkTrail.handleDeepLink(url) : null))
      .catch(() => {
        // Non-LinkTrail URLs and transport failures are reported via onError.
      });
  }
  linkingSubscription ??= Linking.addEventListener('url', ({ url }) => {
    NativeLinkTrail.handleDeepLink(url).catch(() => {});
  });
}

function stopLinkForwarding(): void {
  linkingSubscription?.remove();
  linkingSubscription = null;
}

export const LinkTrail = {
  /**
   * Configures the SDK with your workspace API key (`lt_live_…`). Call once at
   * app launch, before any other LinkTrail API. The install is tracked
   * automatically unless `options.autoTrackInstall` is `false`.
   *
   * Rejects with code `missing_api_key` when the key is blank.
   */
  async configure(apiKey: string, options: LinkTrailOptions = {}): Promise<void> {
    const { autoHandleLinks = true, ...nativeOptions } = options;
    await NativeLinkTrail.configure(apiKey, nativeOptions);
    identity.configure(nativeOptions.requireConsent ?? true).catch(() => {});
    if (autoHandleLinks) {
      startLinkForwarding();
    } else {
      stopLinkForwarding();
    }
  },

  /**
   * Registers a single listener for **both** deferred deep links (first launch
   * after install) and re-engagement links (app already installed) — `source`
   * says which. Fires immediately if a deferred link already resolved this
   * session, so registration order vs. the auto-tracked install doesn't matter.
   */
  onLink(
    listener: (link: LinkTrailDeepLink, source: LinkTrailLinkSource) => void
  ): LinkTrailSubscription {
    return NativeLinkTrail.onLink((payload) => {
      const event = payload as {
        link: LinkTrailDeepLink;
        source: LinkTrailLinkSource;
      };
      listener(event.link, event.source);
    });
  },

  /**
   * Registers a listener for attribution results (attributed or organic).
   * Fires immediately with the cached result if one already exists.
   */
  onAttribution(
    listener: (attribution: LinkTrailAttribution) => void
  ): LinkTrailSubscription {
    return NativeLinkTrail.onAttribution((payload) => {
      listener(payload as unknown as LinkTrailAttribution);
    });
  },

  /**
   * Registers a listener invoked when a fire-and-forget native operation
   * (auto-tracked install, queued event, link open) fails after retries.
   */
  onError(
    listener: (error: LinkTrailErrorEvent) => void
  ): LinkTrailSubscription {
    return NativeLinkTrail.onError((payload) => {
      listener(payload as unknown as LinkTrailErrorEvent);
    });
  },

  /**
   * Sends the install event and resolves attribution. Only needed when
   * `autoTrackInstall` is `false` (e.g. deferred until consent) — `configure`
   * does this automatically otherwise. Already-tracked installs resolve from
   * cache unless `force` is `true`.
   */
  trackInstall(force = false): Promise<LinkTrailAttribution> {
    return NativeLinkTrail.trackInstall(force) as Promise<LinkTrailAttribution>;
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
    return NativeLinkTrail.trackInstallWithClickToken(
      clickToken,
      force
    ) as Promise<LinkTrailAttribution>;
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
    return NativeLinkTrail.trackEvent(
      name,
      options.value,
      options.currency
    ) as Promise<LinkTrailEventResult>;
  },

  /**
   * Forwards an incoming URL to the SDK. Resolves with the resolved deep link,
   * or `null` when the URL is not a LinkTrail link. You only need this when
   * `autoHandleLinks` is `false`; routing normally happens via `onLink`.
   */
  handleDeepLink(url: string): Promise<LinkTrailDeepLink | null> {
    return NativeLinkTrail.handleDeepLink(
      url
    ) as Promise<LinkTrailDeepLink | null>;
  },

  /** The most recent attribution result (cached across launches), or `null`. */
  getLastAttribution(): Promise<LinkTrailAttribution | null> {
    return NativeLinkTrail.getLastAttribution() as Promise<LinkTrailAttribution | null>;
  },

  /** The most recent resolved deep link from the current session, or `null`. */
  getLastDeepLink(): Promise<LinkTrailDeepLink | null> {
    return NativeLinkTrail.getLastDeepLink() as Promise<LinkTrailDeepLink | null>;
  },

  /**
   * iOS: requests App Tracking Transparency authorization (for apps using
   * SKAdNetwork) and resolves with whether tracking was granted.
   * Android: resolves `false`.
   */
  requestTrackingAuthorization(): Promise<boolean> {
    return NativeLinkTrail.requestTrackingAuthorization();
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
    identity.setConsent(granted).catch(() => {});
  },

  /**
   * Associates events with your app's own user id. Use an opaque internal id or
   * a hash — **never** an email, phone number or name. 1-128 characters from
   * `A-Z a-z 0-9 _ - . :`; anything else rejects with code `invalid_user_id`
   * and nothing is stored or sent.
   *
   * The id is persisted across launches. It is only transmitted while consent
   * is granted (see `setConsent`); calling a different id replaces the old one.
   * Delivery is best-effort and never throws for network reasons. Requires a
   * native SDK with identity support (see README).
   */
  setUserId(userId: string): Promise<void> {
    return identity.setUserId(userId);
  },

  /**
   * Clears the stored user id locally (no network call). Subsequent events
   * carry no user id.
   */
  logout(): Promise<void> {
    return identity.logout();
  },

  /** The currently stored user id, or `null`. */
  getUserId(): Promise<string | null> {
    return identity.getUserId();
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

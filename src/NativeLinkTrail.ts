import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type {
  EventEmitter,
  UnsafeObject,
} from 'react-native/Libraries/Types/CodegenTypes';

/**
 * Codegen spec for the LinkTrail TurboModule.
 *
 * Payloads that cross the bridge (options, attribution, deep links, events) are
 * typed as `UnsafeObject` here because their shapes contain string-keyed maps
 * (`utm`, `customData`) that codegen cannot express. The public, fully-typed
 * API lives in `types.ts` / `index.ts` — this module is not exported to users.
 */
export interface Spec extends TurboModule {
  /**
   * Configures the native SDK. Resolves once configured; rejects with
   * `missing_api_key` when the key is blank.
   */
  configure(apiKey: string, options?: UnsafeObject): Promise<void>;

  /** Sends the install event and resolves with the attribution result. */
  trackInstall(force: boolean): Promise<UnsafeObject>;

  /**
   * iOS: sends the install using a deferred click token read from the clipboard
   * (via the paste button). Android: resolves the plain install result.
   */
  trackInstallWithClickToken(clickToken: string, force: boolean): Promise<UnsafeObject>;

  /** Records a custom post-install event; resolves with the server ack. */
  trackEvent(name: string, value?: number, currency?: string): Promise<UnsafeObject>;

  /**
   * Handles an incoming deep-link URL. Resolves with the resolved deep link,
   * or `null` when the URL is not a LinkTrail link.
   */
  handleDeepLink(url: string): Promise<UnsafeObject>;

  /** The most recent attribution result (cached across launches), or null. */
  getLastAttribution(): Promise<UnsafeObject>;

  /** The most recent resolved deep link from the current session, or null. */
  getLastDeepLink(): Promise<UnsafeObject>;

  /** iOS: requests ATT authorization. Android: resolves `false`. */
  requestTrackingAuthorization(): Promise<boolean>;

  /** iOS: registers for SKAdNetwork attribution. Android: no-op. */
  registerForSKAdAttribution(): void;

  /** iOS: updates the SKAdNetwork conversion value. Android: no-op. */
  updateConversionValue(value: number, coarseValue?: string): void;

  /** Grants/revokes tracking consent (only meaningful with `requireConsent`). */
  setConsent(granted: boolean): void;

  /** Clears the install flag, cached attribution, queued events, device id. */
  resetForTesting(): void;

  /** Fires for both deferred and re-engagement links: `{ link, source }`. */
  readonly onLink: EventEmitter<UnsafeObject>;

  /** Fires with every attribution result (attributed or organic). */
  readonly onAttribution: EventEmitter<UnsafeObject>;

  /** Fires when a fire-and-forget native operation fails after retries. */
  readonly onError: EventEmitter<UnsafeObject>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('LinkTrail');

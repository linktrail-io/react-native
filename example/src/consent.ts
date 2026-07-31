import AsyncStorage from '@react-native-async-storage/async-storage';
import LinkTrail from 'linktrail-react-native';

/**
 * The user's tracking-consent decision. Mirrors the native example's
 * ConsentManager: the LinkTrail SDK deliberately exposes **no consent getter**,
 * so the app is the source of truth — it persists the choice and replays it to
 * the SDK on every launch via `syncToSDK`.
 */
export type ConsentState = 'undecided' | 'granted' | 'denied';

const KEY = 'kickflip.consent';

export const ConsentManager = {
  /** Load the persisted decision (defaults to `undecided`). */
  async load(): Promise<ConsentState> {
    const value = await AsyncStorage.getItem(KEY);
    return value === 'granted' || value === 'denied' ? value : 'undecided';
  },

  /** Persist a decision and forward it to the SDK. */
  async set(state: 'granted' | 'denied'): Promise<void> {
    await AsyncStorage.setItem(KEY, state);
    LinkTrail.setConsent(state === 'granted');
  },

  /** Clear the decision (and revoke on the SDK) so the prompt shows again. */
  async reset(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
    LinkTrail.setConsent(false);
  },

  /**
   * Replay the stored decision to the SDK — call once after `configure` on each
   * launch, so a previously granted user resumes tracking automatically. An
   * `undecided` user stays gated (deny-by-default), so nothing is sent.
   */
  syncToSDK(state: ConsentState): void {
    if (state === 'granted') LinkTrail.setConsent(true);
    else if (state === 'denied') LinkTrail.setConsent(false);
  },
};

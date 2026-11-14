import LinkTrail from 'linktrail-react-native';
import e2eConfig from 'kickflip-e2e-config';
import { e2eRecorder } from './recorder';

const OPEN = 'kickflip://e2e/open?url=';
const EVENTS = 'kickflip://e2e/events?list=';

/** One event of the events hook: `value` is in major units, as `trackEvent` takes it. */
interface HookEvent {
  name: string;
  value?: string | number;
  currency?: string;
}

/**
 * The e2e-only `kickflip://e2e/…` URLs the Maestro runners open (e2e builds
 * only; other builds ignore them). Returns true when `url` was one of them.
 *
 * - `kickflip://e2e/open?url=<encoded LinkTrail link>` hands the link to the
 *   SDK, which resolves it and delivers it through onLink as a re-engagement.
 *   Used on the iOS simulator, where an unsigned build has no Associated
 *   Domains (https links open Safari), and for hosts the Android manifest
 *   doesn't claim.
 * - `kickflip://e2e/events?list=<encoded JSON [{name, value?, currency?}]>`
 *   sends each event through `trackEvent`, in order, and counts the answers on
 *   the e2e panel (`e2e-events`). The reward flows use it.
 */
export function handleE2EUrl(url: string): boolean {
  if (!url.startsWith('kickflip://e2e/')) return false;
  if (!e2eConfig.enabled) return true;
  if (url.startsWith(OPEN)) {
    const link = decodeURIComponent(url.slice(OPEN.length));
    LinkTrail.handleDeepLink(link).catch(error =>
      console.warn('LinkTrail e2e open failed:', error),
    );
  } else if (url.startsWith(EVENTS)) {
    sendEvents(url.slice(EVENTS.length)).catch(error =>
      console.warn('LinkTrail e2e events failed:', error),
    );
  }
  return true;
}

async function sendEvents(encoded: string): Promise<void> {
  let events: HookEvent[];
  try {
    events = JSON.parse(decodeURIComponent(encoded));
    if (!Array.isArray(events)) throw new Error('not a list');
  } catch (error) {
    e2eRecorder.hookEvent('failed');
    throw error;
  }
  for (const event of events) {
    try {
      const value = event.value === undefined ? undefined : Number(event.value);
      const result = await LinkTrail.trackEvent(event.name, {
        value,
        currency: event.currency,
      });
      e2eRecorder.hookEvent(result.attributed ? 'attributed' : 'sent');
    } catch (error) {
      console.warn(`LinkTrail e2e event '${event.name}' failed:`, error);
      e2eRecorder.hookEvent('failed');
    }
  }
}

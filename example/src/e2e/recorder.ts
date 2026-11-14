import type {
  LinkTrailAttribution,
  LinkTrailDeepLink,
  LinkTrailLinkSource,
} from 'linktrail-react-native';

/**
 * What the e2e flows read off the screen: every `onLink` delivery (so a flow
 * can assert it fired exactly once), the last attribution, the last
 * `trackEvent` / `trackInstall` result and the events-hook counts. Only
 * rendered when the e2e config is enabled.
 */
export interface E2EState {
  linkCount: number;
  lastLink: LinkTrailDeepLink | null;
  lastSource: LinkTrailLinkSource | null;
  attribution: string;
  event: string;
  /** The last `trackInstall()` answer from the panel's button. */
  install: string;
  /** Events sent through the kickflip://e2e/events hook (the reward flows). */
  events: { done: number; attributed: number; failed: number };
}

let state: E2EState = {
  linkCount: 0,
  lastLink: null,
  lastSource: null,
  attribution: 'none',
  event: 'idle',
  install: 'idle',
  events: { done: 0, attributed: 0, failed: 0 },
};
const listeners = new Set<() => void>();

function update(patch: Partial<E2EState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const e2eRecorder = {
  getState: (): E2EState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  link(link: LinkTrailDeepLink, source: LinkTrailLinkSource): void {
    update({ linkCount: state.linkCount + 1, lastLink: link, lastSource: source });
  },
  attribution(a: LinkTrailAttribution): void {
    update({ attribution: `attributed=${a.attributed}` });
  },
  event(text: string): void {
    update({ event: text });
  },
  install(text: string): void {
    update({ install: text });
  },
  /** One answer of the events hook: sent and attributed, sent, or failed. */
  hookEvent(result: 'attributed' | 'sent' | 'failed'): void {
    const e = state.events;
    update({
      events: {
        done: e.done + (result === 'failed' ? 0 : 1),
        attributed: e.attributed + (result === 'attributed' ? 1 : 0),
        failed: e.failed + (result === 'failed' ? 1 : 0),
      },
    });
  },
};

/** customData as stable JSON (sorted keys), so a flow can match it as text. */
export function stableJson(data?: Record<string, string>): string {
  if (!data) return '{}';
  const sorted: Record<string, string> = {};
  Object.keys(data)
    .sort()
    .forEach((k) => {
      sorted[k] = data[k];
    });
  return JSON.stringify(sorted);
}

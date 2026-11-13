import type {
  LinkTrailAttribution,
  LinkTrailDeepLink,
  LinkTrailLinkSource,
} from 'linktrail-react-native';

/**
 * What the e2e flows read off the screen: every `onLink` delivery (so a flow
 * can assert it fired exactly once), the last attribution and the last
 * `trackEvent` result. Only rendered when the e2e config is enabled.
 */
export interface E2EState {
  linkCount: number;
  lastLink: LinkTrailDeepLink | null;
  lastSource: LinkTrailLinkSource | null;
  attribution: string;
  event: string;
}

let state: E2EState = {
  linkCount: 0,
  lastLink: null,
  lastSource: null,
  attribution: 'none',
  event: 'idle',
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

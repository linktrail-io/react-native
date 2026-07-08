import { Linking } from 'react-native';
import LinkTrail, { type LinkTrailDeepLink } from 'linktrail-react-native';
import type { StoreAction } from './store';

/**
 * Bridges the demo UI to the LinkTrail SDK: configures it, forwards real
 * deferred + re-engagement links into the store, and can *simulate* the four
 * deferred scenarios locally so you can see each one without a real
 * click → install round-trip. Mirrors the native examples' AttributionCoordinator.
 */

/**
 * Your workspace SDK key (`lt_live_…`) from the LinkTrail dashboard. Replace
 * this placeholder with your own — until you do, the backend rejects it
 * (surfaced via `onError` as a console warning). The deep-link simulator
 * works without a key.
 */
const API_KEY = 'lt_live_USE_YOUR_API_KEY';

/** One of the demo's deferred-deep-link scenarios. */
export interface Scenario {
  id: string;
  title: string;
  detail: string;
  link: LinkTrailDeepLink;
}

/** The four scenarios, each expressed as the link your `onLink` handler would receive. */
export const scenarios: Scenario[] = [
  {
    id: 'home',
    title: 'Home',
    detail: 'User just lands on the storefront',
    link: fabricate('/', 'brand-awareness'),
  },
  {
    id: 'category',
    title: 'Home · Running selected',
    detail: 'Lands on home with a category pre-selected',
    link: fabricate('/category/running', 'running-sale'),
  },
  {
    id: 'product',
    title: 'Product · Air Jordan 1',
    detail: 'Lands directly on a product page',
    link: fabricate('/products/aj1', 'aj1-launch'),
  },
  {
    id: 'voucher',
    title: 'Product · Air Jordan 1 + voucher',
    detail: 'Product page with a voucher from the link meta',
    link: fabricate('/products/aj1', 'vip-loyalty', {
      voucher: 'SUMMER25',
      discountPercent: '25',
    }),
  },
];

function fabricate(
  path: string,
  campaign: string,
  customData?: Record<string, string>,
): LinkTrailDeepLink {
  return {
    deepLinkPath: path,
    campaign,
    customData,
    path,
    hasRoutableDestination: path !== '/',
  };
}

/**
 * Configures the SDK and wires links into the store. Returns a cleanup
 * function. `dispatch` is the store's reducer dispatch.
 */
export function startAttribution(
  dispatch: (action: StoreAction) => void,
): () => void {
  const subscriptions: { remove(): void }[] = [];

  (async () => {
    try {
      // autoTrackInstall → the install fires now, which also validates the key.
      // linkDomains → only treat kick.linktrail.io links as ours.
      await LinkTrail.configure(API_KEY, {
        linkDomains: ['kick.linktrail.io'],
        autoTrackInstall: true,
      });
    } catch (error) {
      console.warn('LinkTrail configuration failed:', error);
      return;
    }
    LinkTrail.registerForSKAdAttribution();

    // The ONE piece of real wiring: route deferred (first launch) +
    // re-engagement links into navigation state.
    subscriptions.push(
      LinkTrail.onLink((link, source) => {
        dispatch({ type: 'route-link', link, source });
      }),
    );

    // Surface backend failures — most importantly a rejected API key.
    subscriptions.push(
      LinkTrail.onError((error) => {
        if (error.code === 'invalid_api_key') {
          console.warn(
            '⚠️ LinkTrail: API key rejected by the server — check your lt_live_… key.',
          );
        } else {
          console.warn(`⚠️ LinkTrail error [${error.code}]: ${error.message}`);
        }
      }),
    );
  })();

  // Offline demo: kickflip:// URLs are not LinkTrail links (the SDK ignores
  // them), so route them locally — manual testing works while installed, e.g.
  //   xcrun simctl openurl booted "kickflip://products/aj1?voucher=SUMMER25&discountPercent=25"
  Linking.getInitialURL().then((url) => url && routeLocalScheme(url, dispatch));
  const linkingSub = Linking.addEventListener('url', ({ url }) =>
    routeLocalScheme(url, dispatch),
  );

  return () => {
    subscriptions.forEach((s) => s.remove());
    linkingSub.remove();
  };
}

function routeLocalScheme(
  url: string,
  dispatch: (action: StoreAction) => void,
): void {
  if (!url.startsWith('kickflip://')) return;
  const [pathPart = '', queryPart] = url.slice('kickflip://'.length).split('?');
  const path = '/' + pathPart.replace(/^\/+|\/+$/g, '');

  const customData: Record<string, string> = {};
  queryPart?.split('&').forEach((pair) => {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      customData[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  });

  dispatch({
    type: 'route-link',
    link: {
      deepLinkPath: path,
      customData: Object.keys(customData).length ? customData : undefined,
      path,
      hasRoutableDestination: path !== '/',
    },
    source: 'reengagement',
  });
}

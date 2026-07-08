import type {
  LinkTrailDeepLink,
  LinkTrailLinkSource,
} from 'linktrail-react-native';
import { category, product, type Voucher } from './catalog';

/**
 * The demo's navigation + storefront state, and the reducer that translates a
 * `LinkTrailDeepLink` (real or simulated) into where the user lands. The
 * `route-link` case is exactly the code a real app would put in its `onLink`
 * handler — the link's `path` decides the screen, `customData` carries extras.
 */

export interface Banner {
  title: string;
  subtitle: string;
  source: LinkTrailLinkSource;
}

export interface StoreState {
  /** Product page currently shown; `null` == home. */
  productId: string | null;
  /** Selected category chip on the home screen. `null` == "All". */
  selectedCategoryId: string | null;
  /** Vouchers applied per product id (delivered via a deep link's customData). */
  vouchers: Record<string, Voucher>;
  /** A transient "you arrived via a link" banner. */
  banner: Banner | null;
  /** Whether the deep-link simulator sheet is open. */
  simulatorOpen: boolean;
}

export const initialState: StoreState = {
  productId: null,
  selectedCategoryId: null,
  vouchers: {},
  banner: null,
  simulatorOpen: false,
};

export type StoreAction =
  | { type: 'select-category'; categoryId: string | null }
  | { type: 'open-product'; productId: string }
  | { type: 'go-home' }
  | { type: 'dismiss-banner' }
  | { type: 'set-simulator'; open: boolean }
  | { type: 'route-link'; link: LinkTrailDeepLink; source: LinkTrailLinkSource };

export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'select-category':
      return { ...state, selectedCategoryId: action.categoryId };
    case 'open-product':
      return { ...state, productId: action.productId };
    case 'go-home':
      return { ...state, productId: null };
    case 'dismiss-banner':
      return { ...state, banner: null };
    case 'set-simulator':
      return { ...state, simulatorOpen: action.open };
    case 'route-link':
      return routeLink(state, action.link, action.source);
  }
}

function routeLink(
  state: StoreState,
  link: LinkTrailDeepLink,
  source: LinkTrailLinkSource,
): StoreState {
  const destination = link.path ?? '/';
  const title =
    source === 'deferred' ? 'Opened from your link' : 'Welcome back';

  // Scenario 3 & 4 — a specific product (optionally with a voucher in the meta).
  if (destination.startsWith('/products/')) {
    const productId = destination.slice('/products/'.length);
    const target = product(productId);
    if (!target) return landOnHome(state, title);

    const code = link.customData?.voucher;
    const vouchers = code
      ? {
          ...state.vouchers,
          [target.id]: {
            code,
            percentOff: parseInt(link.customData?.discountPercent ?? '', 10) || 0,
          },
        }
      : state.vouchers;

    return {
      ...state,
      selectedCategoryId: category(target.categoryId)?.id ?? null,
      vouchers,
      productId: target.id,
      simulatorOpen: false,
      banner: {
        title,
        subtitle: code
          ? `Voucher ${code} applied to ${target.name}`
          : `Straight to ${target.name}`,
        source,
      },
    };
  }

  // Scenario 2 — home with a category pre-selected.
  if (destination.startsWith('/category/')) {
    const categoryId = destination.slice('/category/'.length);
    const selected = category(categoryId);
    return {
      ...state,
      selectedCategoryId: selected?.id ?? null,
      productId: null,
      simulatorOpen: false,
      banner: {
        title,
        subtitle: `${selected?.name ?? categoryId} picks for you`,
        source,
      },
    };
  }

  // Scenario 1 — just the storefront.
  return landOnHome(state, title, source);
}

function landOnHome(
  state: StoreState,
  title: string,
  source: LinkTrailLinkSource = 'deferred',
): StoreState {
  return {
    ...state,
    selectedCategoryId: null,
    productId: null,
    simulatorOpen: false,
    banner: { title, subtitle: 'Browse the latest drops', source },
  };
}

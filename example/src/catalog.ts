/** The demo's static storefront data — mirrors the native KickFlip examples. */

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  emoji: string;
  tint: string;
  blurb: string;
}

/** A voucher carried in a deep link's `customData` (`voucher` + `discountPercent`). */
export interface Voucher {
  code: string;
  percentOff: number;
}

export const categories: Category[] = [
  { id: 'basketball', name: 'Basketball' },
  { id: 'running', name: 'Running' },
  { id: 'lifestyle', name: 'Lifestyle' },
  { id: 'skate', name: 'Skate' },
];

export const products: Product[] = [
  { id: 'aj1',      name: 'Air Jordan 1', categoryId: 'basketball', price: 180, emoji: '👟', tint: '#E4574C', blurb: 'The icon that started it all — premium leather, timeless colorway.' },
  { id: 'dunk',     name: 'Dunk Low',     categoryId: 'basketball', price: 110, emoji: '🏀', tint: '#E88C3A', blurb: 'Court-born, street-approved. An everyday staple.' },
  { id: 'uboost',   name: 'UltraBoost',   categoryId: 'running',    price: 190, emoji: '🏃', tint: '#3A78D8', blurb: 'Responsive cushioning built for the long miles.' },
  { id: 'pegasus',  name: 'Pegasus 40',   categoryId: 'running',    price: 140, emoji: '⚡️', tint: '#2FA8A0', blurb: 'The workhorse daily trainer, refined again.' },
  { id: 'am90',     name: 'Air Max 90',   categoryId: 'lifestyle',  price: 130, emoji: '✨', tint: '#8E5BD1', blurb: 'Visible Air and heritage lines you know by heart.' },
  { id: 'boost350', name: 'Boost 350',    categoryId: 'lifestyle',  price: 220, emoji: '🌙', tint: '#5A63C8', blurb: 'Knit upper, sock-like fit, all-day comfort.' },
  { id: 'oldskool', name: 'Old Skool',    categoryId: 'skate',      price: 70,  emoji: '🛹', tint: '#DB5A96', blurb: 'The classic side-stripe skate shoe.' },
  { id: 'sbzoom',   name: 'SB Zoom',      categoryId: 'skate',      price: 100, emoji: '🔥', tint: '#4CAF6E', blurb: 'Board feel with Zoom Air pop.' },
];

export function product(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function category(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function categoryName(id: string): string {
  return category(id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function money(value: number): string {
  return `$${Math.round(value)}`;
}

export function discountedPrice(price: number, voucher: Voucher): number {
  return Math.round(price * (1 - voucher.percentOff / 100));
}

export function savings(price: number, voucher: Voucher): number {
  return price - discountedPrice(price, voucher);
}

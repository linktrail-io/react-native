import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  categoryName,
  discountedPrice,
  money,
  savings,
  type Product,
  type Voucher,
} from '../catalog';

interface Props {
  product: Product;
  voucher?: Voucher;
  onBack: () => void;
}

/**
 * One product. If a voucher was delivered in the deep link, shows the voucher
 * badge, the discounted price, and how much you saved.
 */
export function ProductScreen({ product, voucher, onBack }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.back} onPress={onBack} accessibilityLabel="Back">
        <Text style={styles.backText}>‹ Store</Text>
      </Pressable>

      <View style={[styles.hero, { backgroundColor: product.tint + '22' }]}>
        <Text style={styles.heroEmoji}>{product.emoji}</Text>
      </View>

      <Text style={styles.category}>
        {categoryName(product.categoryId).toUpperCase()}
      </Text>
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.blurb}>{product.blurb}</Text>

      {voucher ? (
        <View style={styles.voucherBox}>
          <View style={[styles.voucherBadge, { backgroundColor: product.tint }]}>
            <Text style={styles.voucherBadgeText}>
              {voucher.code} −{voucher.percentOff}%
            </Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceOld}>{money(product.price)}</Text>
            <Text style={styles.priceNew}>
              {money(discountedPrice(product.price, voucher))}
            </Text>
          </View>
          <Text style={styles.savings}>
            You save {money(savings(product.price, voucher))} with this link's
            voucher
          </Text>
        </View>
      ) : (
        <Text style={styles.price}>{money(product.price)}</Text>
      )}

      <Pressable style={[styles.buyButton, { backgroundColor: product.tint }]}>
        <Text style={styles.buyButtonText}>Add to Cart</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  back: { marginBottom: 12 },
  backText: { fontSize: 17, color: '#3A78D8', fontWeight: '600' },
  hero: {
    borderRadius: 24,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 96 },
  category: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#999',
  },
  name: { marginTop: 4, fontSize: 28, fontWeight: '800', color: '#111' },
  blurb: { marginTop: 8, fontSize: 15, lineHeight: 22, color: '#555' },
  price: { marginTop: 16, fontSize: 24, fontWeight: '700', color: '#111' },
  voucherBox: { marginTop: 16 },
  voucherBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  voucherBadgeText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 8,
  },
  priceOld: {
    fontSize: 18,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  priceNew: { fontSize: 26, fontWeight: '800', color: '#111' },
  savings: { marginTop: 4, fontSize: 13, color: '#2FA860' },
  buyButton: {
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buyButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

import React from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  categories,
  money,
  products,
  type Product,
  type Voucher,
} from '../catalog';

interface Props {
  selectedCategoryId: string | null;
  vouchers: Record<string, Voucher>;
  onSelectCategory: (categoryId: string | null) => void;
  onOpenProduct: (productId: string) => void;
  onOpenSimulator: () => void;
}

/** Category bar on top, product grid below — the storefront. */
export function HomeScreen({
  selectedCategoryId,
  vouchers,
  onSelectCategory,
  onOpenProduct,
  onOpenSimulator,
}: Props) {
  const visible = selectedCategoryId
    ? products.filter((p) => p.categoryId === selectedCategoryId)
    : products;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>KickFlip</Text>
        <Pressable
          style={styles.linkButton}
          onPress={onOpenSimulator}
          accessibilityLabel="Simulate a deep link"
        >
          <Text style={styles.linkButtonText}>🔗</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        <Chip
          label="All"
          selected={selectedCategoryId === null}
          onPress={() => onSelectCategory(null)}
        />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={selectedCategoryId === c.id}
            onPress={() => onSelectCategory(c.id)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            voucher={vouchers[item.id]}
            onPress={() => onOpenProduct(item.id)}
          />
        )}
      />
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProductCard({
  product,
  voucher,
  onPress,
}: {
  product: Product;
  voucher?: Voucher;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.cardHero, { backgroundColor: product.tint + '22' }]}>
        <Text style={styles.cardEmoji}>{product.emoji}</Text>
        {voucher ? (
          <View style={[styles.cardBadge, { backgroundColor: product.tint }]}>
            <Text style={styles.cardBadgeText}>−{voucher.percentOff}%</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardName}>{product.name}</Text>
      <Text style={styles.cardPrice}>{money(product.price)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: { fontSize: 32, fontWeight: '800', color: '#111' },
  linkButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: { fontSize: 18 },
  chipRow: { flexGrow: 0, marginTop: 12 },
  chipRowContent: { paddingHorizontal: 20, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F0F0F3',
  },
  chipSelected: { backgroundColor: '#111' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#444' },
  chipTextSelected: { color: '#FFF' },
  gridContent: { padding: 14, paddingBottom: 32 },
  gridRow: { gap: 12 },
  card: { flex: 1, margin: 6 },
  cardHero: {
    borderRadius: 16,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 48 },
  cardBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cardBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  cardName: { marginTop: 8, fontSize: 15, fontWeight: '600', color: '#111' },
  cardPrice: { marginTop: 2, fontSize: 14, color: '#666' },
});

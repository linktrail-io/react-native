import React, { useEffect, useReducer } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { product } from './src/catalog';
import { initialState, storeReducer } from './src/store';
import { startAttribution } from './src/attribution';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProductScreen } from './src/screens/ProductScreen';
import { SimulatorPanel } from './src/SimulatorPanel';

/**
 * KickFlip — a small storefront showing how LinkTrail's deferred deep linking
 * decides where a user lands after installing. React Native port of the
 * native iOS/Android SDK example apps.
 */
export default function App() {
  const [state, dispatch] = useReducer(storeReducer, initialState);
  const insets = useSafeAreaInsets();

  // Configure the SDK once and route incoming links into the store.
  useEffect(() => startAttribution(dispatch), []);

  // Auto-dismiss the "you arrived via a link" banner.
  useEffect(() => {
    if (!state.banner) return;
    const timer = setTimeout(() => dispatch({ type: 'dismiss-banner' }), 4000);
    return () => clearTimeout(timer);
  }, [state.banner]);

  const openProduct = state.productId ? product(state.productId) : undefined;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Apply insets as padding so content clears the notch/status bar and
          side cutouts. 'bottom' is intentionally left off so the screens'
          scroll views can extend under the home indicator. */}
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {openProduct ? (
          <ProductScreen
            product={openProduct}
            voucher={state.vouchers[openProduct.id]}
            onBack={() => dispatch({ type: 'go-home' })}
          />
        ) : (
          <HomeScreen
            selectedCategoryId={state.selectedCategoryId}
            vouchers={state.vouchers}
            onSelectCategory={(categoryId) =>
              dispatch({ type: 'select-category', categoryId })
            }
            onOpenProduct={(productId) =>
              dispatch({ type: 'open-product', productId })
            }
            onOpenSimulator={() =>
              dispatch({ type: 'set-simulator', open: true })
            }
          />
        )}
      </View>

      {/* Overlay banner — positioned from the true screen top so it clears the
          notch regardless of the SafeAreaView padding above. */}
      {state.banner ? (
        <Pressable
          style={[styles.banner, { top: insets.top + 12 }]}
          onPress={() => dispatch({ type: 'dismiss-banner' })}
        >
          <View>
            <Text style={styles.bannerTitle}>{state.banner.title}</Text>
            <Text style={styles.bannerSubtitle}>{state.banner.subtitle}</Text>
          </View>
          <Text style={styles.bannerSource}>
            {state.banner.source === 'deferred' ? 'deferred' : 're-engagement'}
          </Text>
        </Pressable>
      ) : null}

      <SimulatorPanel
        visible={state.simulatorOpen}
        onSelect={(scenario) =>
          // Simulate a fresh install arriving via a deferred deep link — the
          // same routing code (`route-link`) a real `onLink` delivery hits.
          dispatch({ type: 'route-link', link: scenario.link, source: 'deferred' })
        }
        onClose={() => dispatch({ type: 'set-simulator', open: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF' },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bannerTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  bannerSubtitle: { color: '#CCC', fontSize: 13, marginTop: 2 },
  bannerSource: { color: '#8AB4F8', fontSize: 11, fontWeight: '600' },
});

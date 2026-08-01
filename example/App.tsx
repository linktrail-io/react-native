import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { product } from './src/catalog';
import { initialState, storeReducer } from './src/store';
import { startAttribution, type Scenario } from './src/attribution';
import { ConsentManager, type ConsentState } from './src/consent';
import { ConsentPrompt } from './src/ConsentPrompt';
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
  // 'loading' until the persisted decision is read from storage — so the prompt
  // doesn't flash on a re-engagement launch by an already-decided user.
  const [consent, setConsent] = useState<ConsentState | 'loading'>('loading');
  // Skip hides the prompt for this session without persisting a decision
  // (consent stays undecided → deny-by-default; the prompt may return next launch).
  const [promptSkipped, setPromptSkipped] = useState(false);
  // Route a picked simulator scenario only AFTER the sheet has fully closed —
  // mirrors the iOS example; navigating while the sheet dismisses doesn't stick.
  const [pendingScenario, setPendingScenario] = useState<Scenario | null>(null);
  const insets = useSafeAreaInsets();

  // Configure the SDK once, route incoming links, and load the consent decision.
  useEffect(() => startAttribution(dispatch, setConsent), []);

  const grantConsent = useCallback(async () => {
    await ConsentManager.set('granted');
    setConsent('granted');
  }, []);
  const denyConsent = useCallback(async () => {
    await ConsentManager.set('denied');
    setConsent('denied');
  }, []);
  const resetConsent = useCallback(async () => {
    await ConsentManager.reset();
    setConsent('undecided');
  }, []);

  // Route the picked scenario once the simulator sheet has closed (+ a beat for
  // the dismiss animation), so the navigation sticks — the iOS example's pattern.
  // NOTE: clear `pendingScenario` inside the timeout, not synchronously here —
  // clearing it synchronously re-runs this effect and its cleanup cancels the
  // timer before it ever fires (which broke navigation on both platforms).
  useEffect(() => {
    if (state.simulatorOpen || !pendingScenario) return;
    const scenario = pendingScenario;
    const timer = setTimeout(() => {
      dispatch({ type: 'route-link', link: scenario.link, source: 'deferred' });
      setPendingScenario(null);
    }, 350);
    return () => clearTimeout(timer);
  }, [state.simulatorOpen, pendingScenario]);

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
        consent={consent === 'loading' ? 'undecided' : consent}
        onSelect={(scenario) => {
          // Record the pick and close the sheet; the effect above routes it once
          // the sheet is gone (same as the native example's onDismiss).
          setPendingScenario(scenario);
          dispatch({ type: 'set-simulator', open: false });
        }}
        onGrantConsent={grantConsent}
        onRevokeConsent={denyConsent}
        onResetConsent={resetConsent}
        onClose={() => dispatch({ type: 'set-simulator', open: false })}
      />

      {/* First-launch consent gate — shown until the user decides or skips. */}
      <ConsentPrompt
        visible={consent === 'undecided' && !promptSkipped}
        onDecide={(g) => (g ? grantConsent() : denyConsent())}
        onSkip={() => setPromptSkipped(true)}
        onTokenPasted={(token) =>
          // The SDK already fired the install with this token; this is just a
          // UI signal. onLink will route the recovered deferred link.
          console.log('[KickFlip] click token pasted:', token)
        }
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

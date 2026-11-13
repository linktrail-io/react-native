import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LinkTrail from 'linktrail-react-native';
import { e2eRecorder, stableJson } from './recorder';

interface Props {
  consent: string;
  onGrantConsent: () => void;
}

/** Event the trackEvent flow sends: a purchase with a value. */
export const E2E_EVENT = { name: 'e2e_purchase', value: 9.99, currency: 'USD' };

/**
 * Diagnostics strip for the Maestro smoke flows (e2e builds only). Every
 * value has a testID so a flow can assert on it.
 */
export function E2EPanel({ consent, onGrantConsent }: Props) {
  const s = useSyncExternalStore(e2eRecorder.subscribe, e2eRecorder.getState);

  const trackEvent = async () => {
    e2eRecorder.event('sending');
    try {
      const result = await LinkTrail.trackEvent(E2E_EVENT.name, {
        value: E2E_EVENT.value,
        currency: E2E_EVENT.currency,
      });
      e2eRecorder.event(`ok id=${result.id ?? 'none'}`);
    } catch (error) {
      const { code, message } = error as { code?: string; message?: string };
      e2eRecorder.event(`error ${code ?? message ?? String(error)}`);
    }
  };

  return (
    <View style={styles.panel} testID="e2e-panel">
      <Text style={styles.line} testID="e2e-consent">{`consent: ${consent}`}</Text>
      <Text style={styles.line} testID="e2e-link-count">{`onLink: ${s.linkCount}`}</Text>
      <Text style={styles.line} testID="e2e-link-source">{`source: ${s.lastSource ?? 'none'}`}</Text>
      <Text style={styles.line} testID="e2e-link-path">{`path: ${s.lastLink?.path ?? 'none'}`}</Text>
      <Text style={styles.line} testID="e2e-link-custom-data">
        {`customData: ${stableJson(s.lastLink?.customData)}`}
      </Text>
      <Text style={styles.line} testID="e2e-attribution">{`attribution: ${s.attribution}`}</Text>
      <Text style={styles.line} testID="e2e-event">{`event: ${s.event}`}</Text>
      <View style={styles.buttons}>
        <Pressable style={styles.button} testID="e2e-grant-consent" onPress={onGrantConsent}>
          <Text style={styles.buttonText}>Grant consent</Text>
        </Pressable>
        <Pressable style={styles.button} testID="e2e-track-event" onPress={trackEvent}>
          <Text style={styles.buttonText}>Track event</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 24,
    backgroundColor: 'rgba(255,255,240,0.97)',
    borderColor: '#999',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  line: { fontSize: 11, color: '#111' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 6 },
  button: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});

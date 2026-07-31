import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import type { LinkTrailDeepLink } from 'linktrail-react-native';
import { scenarios, type Scenario } from './attribution';
import type { ConsentState } from './consent';

interface Props {
  visible: boolean;
  consent: ConsentState;
  onSelect: (scenario: Scenario) => void;
  onGrantConsent: () => void;
  onRevokeConsent: () => void;
  onResetConsent: () => void;
  onClose: () => void;
}

/**
 * A small dev panel that fires each of the four deferred deep-link scenarios so
 * you can see where the app lands — without a real click + install round-trip.
 * Also exposes the tracking-consent controls (Grant / Revoke / Reset).
 */
export function SimulatorPanel(props: Props) {
  const { visible, onClose } = props;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A Modal renders outside the app's SafeAreaProvider, so give it its
          own — otherwise the insets read as 0 inside the sheet. */}
      <SafeAreaProvider>
        <PanelContent {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function PanelContent({
  consent,
  onSelect,
  onGrantConsent,
  onRevokeConsent,
  onResetConsent,
  onClose,
}: Omit<Props, 'visible'>) {
  // useSafeAreaInsets must run inside the SafeAreaProvider above.
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Simulate a Link</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionHeader}>TRACKING CONSENT</Text>
      <View style={styles.consentBox}>
        <View style={styles.consentStatusRow}>
          <Text style={styles.consentLabel}>Status</Text>
          <View style={[styles.badge, consentStyle(consent).badge]}>
            <Text style={[styles.badgeText, consentStyle(consent).text]}>
              {consentLabel(consent)}
            </Text>
          </View>
        </View>
        <View style={styles.consentButtons}>
          <Pressable
            style={[styles.consentButton, styles.grant]}
            onPress={onGrantConsent}
          >
            <Text style={styles.grantText}>Grant</Text>
          </Pressable>
          <Pressable
            style={[styles.consentButton, styles.revoke]}
            onPress={onRevokeConsent}
          >
            <Text style={styles.revokeText}>Revoke</Text>
          </Pressable>
          <Pressable style={styles.consentButton} onPress={onResetConsent}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>
        <Text style={styles.consentHint}>
          Attribution is gated by consent; deep links still route regardless.
        </Text>
      </View>

      <Text style={styles.sectionHeader}>DEFERRED DEEP LINK SCENARIOS</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {scenarios.map((scenario) => (
          <Pressable
            key={scenario.id}
            style={styles.row}
            onPress={() => onSelect(scenario)}
          >
            <Text style={styles.rowTitle}>{scenario.title}</Text>
            <Text style={styles.rowDetail}>{scenario.detail}</Text>
            <Text style={styles.rowPath}>{pathLabel(scenario.link)}</Text>
          </Pressable>
        ))}

        <Text style={styles.footer}>
          Simulates a fresh install landing via the SDK's deferred deep link.
          The link's path and meta decide where you land — the same thing your
          real onLink handler routes on.
        </Text>
      </ScrollView>
    </View>
  );
}

function pathLabel(link: LinkTrailDeepLink): string {
  let label = link.path;
  const voucher = link.customData?.voucher;
  if (voucher) {
    label += `  ·  meta: voucher=${voucher}`;
    const percent = link.customData?.discountPercent;
    if (percent) label += `, ${percent}%`;
  }
  return label;
}

function consentLabel(consent: ConsentState): string {
  return consent === 'granted'
    ? 'Granted'
    : consent === 'denied'
      ? 'Denied'
      : 'Undecided';
}

function consentStyle(consent: ConsentState): {
  badge: object;
  text: object;
} {
  if (consent === 'granted') {
    return { badge: { backgroundColor: '#E3F5E9' }, text: { color: '#1E8E4E' } };
  }
  if (consent === 'denied') {
    return { badge: { backgroundColor: '#FBE4E4' }, text: { color: '#C0392B' } };
  }
  return { badge: { backgroundColor: '#ECECF0' }, text: { color: '#888' } };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  close: { fontSize: 16, color: '#3A78D8', fontWeight: '600' },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  rowDetail: { marginTop: 2, fontSize: 14, color: '#666' },
  rowPath: {
    marginTop: 6,
    fontSize: 12,
    color: '#3A78D8',
    fontFamily: 'Menlo',
  },
  footer: { marginTop: 8, paddingHorizontal: 4, fontSize: 12, color: '#888' },
  consentBox: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
  },
  consentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  consentLabel: { fontSize: 15, fontWeight: '600', color: '#111' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  consentButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  consentButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ECECF0',
  },
  grant: { backgroundColor: '#111' },
  grantText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  revoke: { backgroundColor: '#FBE4E4' },
  revokeText: { color: '#C0392B', fontSize: 14, fontWeight: '700' },
  resetText: { color: '#555', fontSize: 14, fontWeight: '600' },
  consentHint: { marginTop: 10, fontSize: 12, color: '#999' },
});

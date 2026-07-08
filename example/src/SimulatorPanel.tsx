import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import type { LinkTrailDeepLink } from 'linktrail-react-native';
import { scenarios, type Scenario } from './attribution';

interface Props {
  visible: boolean;
  onSelect: (scenario: Scenario) => void;
  onClose: () => void;
}

/**
 * A small dev panel that fires each of the four deferred deep-link scenarios so
 * you can see where the app lands — without a real click + install round-trip.
 */
export function SimulatorPanel({ visible, onSelect, onClose }: Props) {
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
        <PanelContent onSelect={onSelect} onClose={onClose} />
      </SafeAreaProvider>
    </Modal>
  );
}

function PanelContent({ onSelect, onClose }: Omit<Props, 'visible'>) {
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
});

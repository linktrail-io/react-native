import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinkTrailPasteButton } from 'linktrail-react-native';

interface Props {
  visible: boolean;
  /** Apply the user's consent selection (granted/denied) and dismiss. */
  onDecide: (granted: boolean) => void;
  /** Dismiss without deciding (consent stays undecided → deny-by-default). */
  onSkip: () => void;
  /** Raw pasted click token (UI signal; the SDK already used it). */
  onTokenPasted: (token: string) => void;
}

/**
 * First-launch prompt. Allow/Deny is a *selection*; the full-width
 * **Paste / Navigate** button confirms it — reading the deferred click token
 * from the clipboard (no "Allow Paste" alert) and letting `onLink` route the
 * recovered destination. Skip dismisses without deciding.
 */
export function ConsentPrompt({
  visible,
  onDecide,
  onSkip,
  onTokenPasted,
}: Props) {
  const [granted, setGranted] = useState(true);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🔒</Text>
          <Text style={styles.title}>Allow tracking?</Text>
          <Text style={styles.body}>
            KickFlip uses LinkTrail to measure which links bring people to the
            app. Choose below, then continue.
          </Text>

          {/* Allow / Deny — a selection, applied when you tap Paste / Navigate. */}
          <View style={styles.segment}>
            <Pressable
              style={[styles.segItem, granted && styles.segItemActive]}
              onPress={() => setGranted(true)}
            >
              <Text style={[styles.segText, granted && styles.segTextActive]}>
                Allow
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segItem, !granted && styles.segItemActiveDeny]}
              onPress={() => setGranted(false)}
            >
              <Text
                style={[styles.segText, !granted && styles.segTextActiveDeny]}
              >
                Deny
              </Text>
            </Pressable>
          </View>

          {/* Full-width Paste / Navigate. On iOS this is Apple's UIPasteControl
              (label is the system "Paste"); the caption names the full action. */}
          <Text style={styles.pasteCaption}>Paste / Navigate</Text>
          {Platform.OS === 'ios' ? (
            <LinkTrailPasteButton
              style={styles.pasteButton}
              cornerStyle="fixed"
              fillColor="#111"
              foregroundColor="#FFFFFF"
              onTokenPasted={(token) => {
                onTokenPasted(token);
                onDecide(granted);
              }}
            />
          ) : (
            <Pressable
              style={[styles.pasteButton, styles.pasteFallback]}
              onPress={() => onDecide(granted)}
            >
              <Text style={styles.pasteFallbackText}>Continue</Text>
            </Pressable>
          )}

          <Pressable style={styles.skip} onPress={onSkip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  emoji: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 8 },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
  },
  segment: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: '#F0F0F3',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segItem: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
  },
  segItemActive: { backgroundColor: '#111' },
  segItemActiveDeny: { backgroundColor: '#FBE4E4' },
  segText: { fontSize: 15, fontWeight: '700', color: '#888' },
  segTextActive: { color: '#FFF' },
  segTextActiveDeny: { color: '#C0392B' },
  pasteCaption: {
    alignSelf: 'flex-start',
    marginTop: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  pasteButton: { alignSelf: 'stretch', height: 46 },
  pasteFallback: {
    backgroundColor: '#111',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteFallbackText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  skip: {
    marginTop: 14,
    paddingVertical: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  skipText: { color: '#888', fontSize: 15, fontWeight: '600' },
});

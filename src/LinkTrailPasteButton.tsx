import { Platform, type ColorValue, type ViewProps } from 'react-native';
import LinkTrailPasteButtonNative from './LinkTrailPasteButtonNativeComponent';

export interface LinkTrailPasteButtonProps extends ViewProps {
  /**
   * Called with the raw pasted string once the SDK has read the click token
   * (the SDK already performs the install — use this only for UI side effects,
   * e.g. advancing a first-launch flow).
   */
  onTokenPasted?: (token: string) => void;
  /** What the control shows. Default `'labelOnly'`. */
  displayMode?: 'iconAndLabel' | 'iconOnly' | 'labelOnly';
  /** Corner rounding. Default `'capsule'`. */
  cornerStyle?: 'dynamic' | 'fixed' | 'capsule' | 'large' | 'medium' | 'small';
  /** Label/icon color. */
  foregroundColor?: ColorValue;
  /** Button fill color. */
  fillColor?: ColorValue;
  /**
   * Whether the tap also records tracking consent. Default `true`, so the
   * install the tap triggers isn't held by the deny-by-default consent gate.
   * Set `false` when a separate consent UI owns the decision.
   */
  grantsConsent?: boolean;
}

/**
 * A drop-in **Paste** button (iOS 16+) that reads a LinkTrail deferred click
 * token from the clipboard — **without** the iOS "Allow Paste" alert — and hands
 * it to the SDK. Style it to match your theme via `displayMode` / `cornerStyle` /
 * `foregroundColor` / `fillColor`, and size it with `style` (width/height).
 * Configure the SDK with `clickTokenSource: 'pasteButton'` and
 * `autoTrackInstall: false` so the install waits for the tap. The tap also
 * records consent by default (see `grantsConsent`). Renders nothing on
 * Android (which uses the Play Install Referrer, so no paste button is needed).
 */
export function LinkTrailPasteButton({
  onTokenPasted,
  ...nativeProps
}: LinkTrailPasteButtonProps) {
  if (Platform.OS !== 'ios') return null;
  return (
    <LinkTrailPasteButtonNative
      {...nativeProps}
      onTokenPasted={
        onTokenPasted
          ? (event) => onTokenPasted(event.nativeEvent.token)
          : undefined
      }
    />
  );
}

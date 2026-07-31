import type { ColorValue, HostComponent, ViewProps } from 'react-native';
import type {
  BubblingEventHandler,
  WithDefault,
} from 'react-native/Libraries/Types/CodegenTypes';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

/**
 * Codegen spec for the native paste-button Fabric component (iOS only).
 *
 * Wraps Apple's `UIPasteControl` via the SDK's `LinkTrailPasteButton`: tapping it
 * reads the deferred-attribution click token from the clipboard **without** the
 * iOS "Allow Paste" alert and hands it to the SDK. Style it to match your app's
 * theme via the props below (Apple restricts what's customizable on a paste
 * control); size it with the standard `style` (width/height). Use with
 * `clickTokenSource: 'pasteButton'` and `autoTrackInstall: false`.
 */
export interface NativeProps extends ViewProps {
  /** Fired (main thread) with the raw pasted string after the SDK reads it. */
  onTokenPasted?: BubblingEventHandler<{ token: string }> | null;

  /** What the control shows. Default `'labelOnly'`. */
  displayMode?: WithDefault<
    'iconAndLabel' | 'iconOnly' | 'labelOnly',
    'labelOnly'
  >;

  /** Corner rounding. Default `'capsule'`. */
  cornerStyle?: WithDefault<
    'dynamic' | 'fixed' | 'capsule' | 'large' | 'medium' | 'small',
    'capsule'
  >;

  /** Label/icon color (maps to `baseForegroundColor`). */
  foregroundColor?: ColorValue;

  /** Button fill color (maps to `baseBackgroundColor`). */
  fillColor?: ColorValue;
}

export default codegenNativeComponent<NativeProps>(
  'LinkTrailPasteButton'
) as HostComponent<NativeProps>;

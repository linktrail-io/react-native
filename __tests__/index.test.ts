/* eslint-env jest */
import { Linking, Platform } from 'react-native';

type Listener = (payload: unknown) => void;

const mockSub = () => ({ remove: jest.fn() });

const mockNative = {
  configure: jest.fn(),
  trackInstall: jest.fn(),
  trackInstallWithClickToken: jest.fn(),
  trackEvent: jest.fn(),
  handleDeepLink: jest.fn(),
  getLastAttribution: jest.fn(),
  getLastDeepLink: jest.fn(),
  requestTrackingAuthorization: jest.fn(),
  registerForSKAdAttribution: jest.fn(),
  updateConversionValue: jest.fn(),
  setConsent: jest.fn(),
  resetForTesting: jest.fn(),
  startLinkDelivery: jest.fn(),
  nativeSdkVersion: jest.fn(),
  onLink: jest.fn(),
  onAttribution: jest.fn(),
  onError: jest.fn(),
};

jest.mock('../src/NativeLinkTrail', () => ({
  __esModule: true,
  default: mockNative,
}));

type Api = typeof import('../src/index');
let api: Api;
let urlListener: ((e: { url: string }) => void) | undefined;
let linkingSub: { remove: jest.Mock };

function load(): Api {
  let mod!: Api;
  jest.isolateModules(() => {
    mod = require('../src/index');
  });
  return mod;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockNative.configure.mockResolvedValue(undefined);
  mockNative.handleDeepLink.mockResolvedValue(null);
  linkingSub = mockSub();
  urlListener = undefined;
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (e: { url: string }) => void
  ) => {
    urlListener = handler;
    return linkingSub;
  }) as never);
  api = load();
});

describe('API surface', () => {
  it('exposes the documented methods on both named and default export', () => {
    expect(api.default).toBe(api.LinkTrail);
    for (const name of [
      'configure',
      'onLink',
      'onAttribution',
      'onError',
      'trackInstall',
      'trackInstallWithClickToken',
      'trackEvent',
      'handleDeepLink',
      'getLastAttribution',
      'getLastDeepLink',
      'requestTrackingAuthorization',
      'registerForSKAdAttribution',
      'updateConversionValue',
      'setConsent',
      'resetForTesting',
    ]) {
      expect(typeof (api.LinkTrail as Record<string, unknown>)[name]).toBe(
        'function'
      );
    }
    expect(typeof api.LinkTrailPasteButton).toBe('function');
  });
});

describe('configure', () => {
  it('passes the api key and options to native, minus autoHandleLinks', async () => {
    await api.LinkTrail.configure('lt_live_x', {
      requireConsent: false,
      autoHandleLinks: true,
      autoTrackInstall: false,
    });
    expect(mockNative.configure).toHaveBeenCalledWith('lt_live_x', {
      requireConsent: false,
      autoTrackInstall: false,
    });
  });

  it('defaults options to an empty object', async () => {
    await api.LinkTrail.configure('lt_live_x');
    expect(mockNative.configure).toHaveBeenCalledWith('lt_live_x', {});
  });

  it('propagates native rejections (missingApiKey) and does not forward links', async () => {
    const err = Object.assign(new Error('blank'), { code: 'missingApiKey' });
    mockNative.configure.mockRejectedValue(err);
    await expect(api.LinkTrail.configure('')).rejects.toMatchObject({
      code: 'missingApiKey',
      legacyCode: 'missing_api_key',
      message: 'blank',
    });
    expect(Linking.addEventListener).not.toHaveBeenCalled();
    expect(Linking.getInitialURL).not.toHaveBeenCalled();
  });
});

describe('deep-link forwarding', () => {
  it('forwards the initial URL and subsequent url events to native', async () => {
    (Linking.getInitialURL as jest.Mock).mockResolvedValue('app://initial');
    await api.LinkTrail.configure('k');
    await Promise.resolve();
    expect(mockNative.handleDeepLink).toHaveBeenCalledWith('app://initial');

    urlListener?.({ url: 'app://later' });
    expect(mockNative.handleDeepLink).toHaveBeenCalledWith('app://later');
  });

  it('does not call native for a missing initial URL', async () => {
    await api.LinkTrail.configure('k');
    await Promise.resolve();
    expect(mockNative.handleDeepLink).not.toHaveBeenCalled();
  });

  it('swallows native errors from forwarded URLs', async () => {
    (Linking.getInitialURL as jest.Mock).mockResolvedValue('app://x');
    mockNative.handleDeepLink.mockRejectedValue(new Error('not_a_link'));
    await api.LinkTrail.configure('k');
    urlListener?.({ url: 'app://y' });
    await new Promise((r) => setImmediate(r));
    // No unhandled rejection: test completing is the assertion.
    expect(mockNative.handleDeepLink).toHaveBeenCalledTimes(2);
  });

  it('subscribes once and forwards the initial URL once across repeated configure calls', async () => {
    (Linking.getInitialURL as jest.Mock).mockResolvedValue('app://i');
    await api.LinkTrail.configure('k');
    await api.LinkTrail.configure('k');
    expect(Linking.addEventListener).toHaveBeenCalledTimes(1);
    expect(Linking.getInitialURL).toHaveBeenCalledTimes(1);
  });

  it('autoHandleLinks: false does not subscribe and removes an existing subscription', async () => {
    await api.LinkTrail.configure('k', { autoHandleLinks: false });
    expect(Linking.addEventListener).not.toHaveBeenCalled();

    await api.LinkTrail.configure('k');
    expect(Linking.addEventListener).toHaveBeenCalledTimes(1);
    await api.LinkTrail.configure('k', { autoHandleLinks: false });
    expect(linkingSub.remove).toHaveBeenCalledTimes(1);
  });

  it('handleDeepLink passes the url through and resolves link or null', async () => {
    const link = { path: '/p' };
    mockNative.handleDeepLink.mockResolvedValueOnce(link);
    await expect(api.LinkTrail.handleDeepLink('https://x/p')).resolves.toBe(
      link
    );
    expect(mockNative.handleDeepLink).toHaveBeenCalledWith('https://x/p');
    mockNative.handleDeepLink.mockResolvedValueOnce(null);
    await expect(api.LinkTrail.handleDeepLink('https://other')).resolves.toBe(
      null
    );
  });
});

describe('event emitters', () => {
  it('onLink unwraps { link, source } into listener args and starts native delivery', () => {
    let emit!: Listener;
    mockNative.onLink.mockImplementation((l: Listener) => {
      emit = l;
      return mockSub();
    });
    const listener = jest.fn();
    api.LinkTrail.onLink(listener);
    expect(mockNative.startLinkDelivery).toHaveBeenCalledTimes(1);
    const link = { path: '/a' };
    emit({ link, source: 'deferred' });
    expect(listener).toHaveBeenCalledWith(link, 'deferred');
    emit({ link, source: 'reengagement' });
    expect(listener).toHaveBeenLastCalledWith(link, 'reengagement');
  });

  it('onAttribution passes the payload through', () => {
    let emit!: Listener;
    mockNative.onAttribution.mockImplementation((l: Listener) => {
      emit = l;
      return mockSub();
    });
    const listener = jest.fn();
    api.LinkTrail.onAttribution(listener);
    const payload = { attributed: true };
    emit(payload);
    expect(listener).toHaveBeenCalledWith(payload);
  });

  it('onError passes the payload through and unsubscribe works', () => {
    const sub = mockSub();
    let emit!: Listener;
    mockNative.onError.mockImplementation((l: Listener) => {
      emit = l;
      return sub;
    });
    const listener = jest.fn();
    const s = api.LinkTrail.onError(listener);
    emit({ code: 'transport', message: 'offline' });
    expect(listener).toHaveBeenCalledWith({
      code: 'transport',
      legacyCode: 'transport',
      message: 'offline',
    });
    s.remove();
    expect(sub.remove).toHaveBeenCalled();
  });
});

describe('tracking calls', () => {
  it('trackInstall defaults force to false and passes true through', async () => {
    mockNative.trackInstall.mockResolvedValue({ attributed: false });
    await expect(api.LinkTrail.trackInstall()).resolves.toEqual({
      attributed: false,
    });
    expect(mockNative.trackInstall).toHaveBeenLastCalledWith(false);
    await api.LinkTrail.trackInstall(true);
    expect(mockNative.trackInstall).toHaveBeenLastCalledWith(true);
  });

  it('trackInstallWithClickToken passes token and force', async () => {
    mockNative.trackInstallWithClickToken.mockResolvedValue({});
    await api.LinkTrail.trackInstallWithClickToken('tok');
    expect(mockNative.trackInstallWithClickToken).toHaveBeenLastCalledWith(
      'tok',
      false
    );
    await api.LinkTrail.trackInstallWithClickToken('tok', true);
    expect(mockNative.trackInstallWithClickToken).toHaveBeenLastCalledWith(
      'tok',
      true
    );
  });

  it('trackEvent flattens value/currency into positional args', async () => {
    mockNative.trackEvent.mockResolvedValue({ ok: true });
    await api.LinkTrail.trackEvent('purchase', { value: 9.99, currency: 'USD' });
    expect(mockNative.trackEvent).toHaveBeenLastCalledWith(
      'purchase',
      9.99,
      'USD'
    );
    await api.LinkTrail.trackEvent('signup');
    expect(mockNative.trackEvent).toHaveBeenLastCalledWith(
      'signup',
      undefined,
      undefined
    );
  });

  it('rejections from native propagate to the caller', async () => {
    mockNative.trackEvent.mockRejectedValue(new Error('offline'));
    await expect(api.LinkTrail.trackEvent('x')).rejects.toThrow('offline');
    mockNative.trackInstall.mockRejectedValue(new Error('boom'));
    await expect(api.LinkTrail.trackInstall()).rejects.toThrow('boom');
  });

  it('getLastAttribution / getLastDeepLink resolve native values (including null)', async () => {
    mockNative.getLastAttribution.mockResolvedValue(null);
    mockNative.getLastDeepLink.mockResolvedValue({ path: '/z' });
    await expect(api.LinkTrail.getLastAttribution()).resolves.toBeNull();
    await expect(api.LinkTrail.getLastDeepLink()).resolves.toEqual({
      path: '/z',
    });
  });
});

describe('consent, SKAdNetwork and testing helpers', () => {
  it('setConsent forwards the boolean', () => {
    api.LinkTrail.setConsent(true);
    api.LinkTrail.setConsent(false);
    expect(mockNative.setConsent.mock.calls).toEqual([[true], [false]]);
  });

  it('SKAdNetwork calls are forwarded', () => {
    api.LinkTrail.registerForSKAdAttribution();
    api.LinkTrail.updateConversionValue(5, 'high');
    api.LinkTrail.updateConversionValue(3);
    expect(mockNative.registerForSKAdAttribution).toHaveBeenCalledTimes(1);
    expect(mockNative.updateConversionValue.mock.calls).toEqual([
      [5, 'high'],
      [3, undefined],
    ]);
  });

  it('resetForTesting is forwarded', () => {
    api.LinkTrail.resetForTesting();
    expect(mockNative.resetForTesting).toHaveBeenCalledTimes(1);
  });
});

describe('requestTrackingAuthorization (platform behavior)', () => {
  it.each(['ios', 'android'] as const)(
    'delegates to native on %s and returns its result',
    async (os) => {
      Platform.OS = os;
      mockNative.requestTrackingAuthorization.mockResolvedValue(true);
      await expect(api.LinkTrail.requestTrackingAuthorization()).resolves.toBe(
        true
      );
      mockNative.requestTrackingAuthorization.mockResolvedValue(false);
      await expect(api.LinkTrail.requestTrackingAuthorization()).resolves.toBe(
        false
      );
    }
  );
});

describe('LinkTrailPasteButton', () => {
  const nativeComponentMock = jest.fn(() => null);

  function loadButton() {
    let mod!: typeof import('../src/LinkTrailPasteButton');
    jest.isolateModules(() => {
      jest.doMock('../src/LinkTrailPasteButtonNativeComponent', () => ({
        __esModule: true,
        default: nativeComponentMock,
      }));
      mod = require('../src/LinkTrailPasteButton');
    });
    return mod.LinkTrailPasteButton;
  }

  afterEach(() => {
    Platform.OS = 'ios';
  });

  it('renders nothing on Android', () => {
    Platform.OS = 'android';
    expect(loadButton()({})).toBeNull();
  });

  it('on iOS renders the native component and unwraps the token event', () => {
    Platform.OS = 'ios';
    const onTokenPasted = jest.fn();
    const el = loadButton()({
      onTokenPasted,
      displayMode: 'iconOnly',
    }) as unknown as {
      type: unknown;
      props: {
        displayMode: string;
        onTokenPasted?: (e: { nativeEvent: { token: string } }) => void;
      };
    };
    expect(el.type).toBe(nativeComponentMock);
    expect(el.props.displayMode).toBe('iconOnly');
    el.props.onTokenPasted?.({ nativeEvent: { token: 'abc' } });
    expect(onTokenPasted).toHaveBeenCalledWith('abc');
  });

  it('passes no handler when onTokenPasted is omitted', () => {
    Platform.OS = 'ios';
    const el = loadButton()({}) as unknown as {
      props: { onTokenPasted?: unknown };
    };
    expect(el.props.onTokenPasted).toBeUndefined();
  });
});

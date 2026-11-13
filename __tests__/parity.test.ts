/* eslint-env jest */
// wrapper-parity 0.1.1: link/attribution buffering, error codes, version.
import { Linking } from 'react-native';

type Listener = (payload: unknown) => void;

const emitters: Record<'onLink' | 'onAttribution' | 'onError', Listener[]> = {
  onLink: [],
  onAttribution: [],
  onError: [],
};
const emitterMock = (name: keyof typeof emitters) =>
  jest.fn((l: Listener) => {
    emitters[name].push(l);
    return { remove: jest.fn() };
  });

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
  onLink: emitterMock('onLink'),
  onAttribution: emitterMock('onAttribution'),
  onError: emitterMock('onError'),
};

jest.mock('../src/NativeLinkTrail', () => ({
  __esModule: true,
  default: mockNative,
}));

type Api = typeof import('../src/index');
let api: Api;
let urlListener: ((e: { url: string }) => void) | undefined;

const nativeEmit = (name: keyof typeof emitters, payload: unknown) =>
  emitters[name].forEach((l) => l(payload));
const flush = () => new Promise((r) => setImmediate(r));
const link = (path: string) => ({ path, hasRoutableDestination: true });

beforeEach(() => {
  jest.clearAllMocks();
  emitters.onLink = [];
  emitters.onAttribution = [];
  emitters.onError = [];
  mockNative.configure.mockResolvedValue(undefined);
  mockNative.handleDeepLink.mockResolvedValue(null);
  urlListener = undefined;
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockImplementation(((
    _t: string,
    h: (e: { url: string }) => void,
  ) => {
    urlListener = h;
    return { remove: jest.fn() };
  }) as never);
  jest.isolateModules(() => {
    api = require('../src/index');
  });
});

describe('onLink buffering', () => {
  it('registers native onLink only when the first listener subscribes', async () => {
    await api.LinkTrail.configure('k');
    expect(mockNative.startLinkDelivery).not.toHaveBeenCalled();
    api.LinkTrail.onLink(jest.fn());
    api.LinkTrail.onLink(jest.fn());
    expect(mockNative.startLinkDelivery).toHaveBeenCalledTimes(1);
    expect(mockNative.onLink).toHaveBeenCalledTimes(1);
  });

  it('subscribes the JS emitter before asking native to deliver', () => {
    const order: string[] = [];
    mockNative.onLink.mockImplementationOnce((l: Listener) => {
      order.push('subscribe');
      emitters.onLink.push(l);
      return { remove: jest.fn() };
    });
    mockNative.startLinkDelivery.mockImplementationOnce(() => {
      order.push('start');
      nativeEmit('onLink', { link: link('/saved'), source: 'deferred' });
    });
    const listener = jest.fn();
    api.LinkTrail.onLink(listener);
    expect(order).toEqual(['subscribe', 'start']);
    expect(listener).toHaveBeenCalledWith(link('/saved'), 'deferred');
  });

  it('buffers links resolved before any listener and delivers them once, in order', async () => {
    mockNative.handleDeepLink.mockImplementation(async (url: string) =>
      link(new URL(url).pathname),
    );
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(
      'https://x.linktrail.io/a',
    );
    await api.LinkTrail.configure('k');
    await flush();
    urlListener?.({ url: 'https://x.linktrail.io/b' });
    await flush();

    const first = jest.fn();
    api.LinkTrail.onLink(first);
    expect(first.mock.calls).toEqual([
      [link('/a'), 'reengagement'],
      [link('/b'), 'reengagement'],
    ]);

    const second = jest.fn();
    api.LinkTrail.onLink(second);
    expect(second).not.toHaveBeenCalled(); // no replays for later listeners

    // After delivery started, links come from native only (no double delivery).
    urlListener?.({ url: 'https://x.linktrail.io/c' });
    await flush();
    expect(first).toHaveBeenCalledTimes(2);
    nativeEmit('onLink', { link: link('/c'), source: 'reengagement' });
    expect(first).toHaveBeenCalledTimes(3);
    expect(second).toHaveBeenCalledWith(link('/c'), 'reengagement');
  });

  it('caps the buffer at 10, dropping the oldest', async () => {
    mockNative.handleDeepLink.mockImplementation(async (url: string) =>
      link(new URL(url).pathname),
    );
    await api.LinkTrail.configure('k');
    for (let i = 0; i < 12; i++)
      urlListener?.({ url: `https://x.linktrail.io/${i}` });
    await flush();
    const listener = jest.fn();
    api.LinkTrail.onLink(listener);
    expect(listener.mock.calls.map(([l]) => l.path)).toEqual(
      Array.from({ length: 10 }, (_, i) => `/${i + 2}`),
    );
  });

  it('does not buffer non-LinkTrail URLs', async () => {
    await api.LinkTrail.configure('k');
    urlListener?.({ url: 'https://example.com' });
    await flush();
    const listener = jest.fn();
    api.LinkTrail.onLink(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('remove() stops delivery to that listener only', () => {
    const a = jest.fn();
    const b = jest.fn();
    const sub = api.LinkTrail.onLink(a);
    api.LinkTrail.onLink(b);
    sub.remove();
    nativeEmit('onLink', { link: link('/x'), source: 'reengagement' });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('onAttribution replay', () => {
  it('keeps the last attribution and replays it to the first listener only', async () => {
    await api.LinkTrail.configure('k');
    nativeEmit('onAttribution', { attributed: false });
    nativeEmit('onAttribution', { attributed: true, id: 7 });
    const first = jest.fn();
    api.LinkTrail.onAttribution(first);
    expect(first.mock.calls).toEqual([[{ attributed: true, id: 7 }]]);
    const second = jest.fn();
    api.LinkTrail.onAttribution(second);
    expect(second).not.toHaveBeenCalled();
    nativeEmit('onAttribution', { attributed: true, id: 8 });
    expect(first).toHaveBeenLastCalledWith({ attributed: true, id: 8 });
    expect(second).toHaveBeenCalledWith({ attributed: true, id: 8 });
  });

  it('does not replay when the first listener already received live values', async () => {
    const first = jest.fn();
    api.LinkTrail.onAttribution(first);
    nativeEmit('onAttribution', { attributed: true });
    const later = jest.fn();
    api.LinkTrail.onAttribution(later);
    expect(later).not.toHaveBeenCalled();
    expect(mockNative.onAttribution).toHaveBeenCalledTimes(1);
  });
});

describe('error codes', () => {
  it('rejects with a LinkTrailError: camelCase code, legacyCode, native message', async () => {
    mockNative.trackEvent.mockRejectedValue(
      Object.assign(new Error('Server returned status 500: boom'), {
        code: 'server',
        userInfo: { statusCode: 500, body: 'boom' },
      }),
    );
    const err = await api.LinkTrail.trackEvent('x').catch((e) => e);
    expect(err).toBeInstanceOf(api.LinkTrailError);
    expect(err).toMatchObject({
      code: 'server',
      legacyCode: 'server',
      message: 'Server returned status 500: boom',
      statusCode: 500,
      body: 'boom',
    });
  });

  it.each([
    ['missingApiKey', 'missing_api_key'],
    ['invalidApiKey', 'invalid_api_key'],
    ['notConfigured', 'not_configured'],
    ['invalidUrl', 'invalid_url'],
    ['notALinkTrailUrl', 'not_a_linktrail_url'],
    ['transport', 'transport'],
    ['decoding', 'decoding'],
    ['emptyResponse', 'empty_response'],
    ['invalidArgument', 'invalid_argument'],
  ])(
    'maps %s <-> legacy %s (either form from native)',
    async (code, legacy) => {
      for (const nativeCode of [code, legacy]) {
        mockNative.trackInstall.mockRejectedValueOnce(
          Object.assign(new Error('m'), { code: nativeCode }),
        );
        await expect(api.LinkTrail.trackInstall()).rejects.toMatchObject({
          code,
          legacyCode: legacy,
        });
      }
    },
  );

  it('maps unrecognised codes to unknown and omits statusCode/body', async () => {
    mockNative.handleDeepLink.mockRejectedValue(
      Object.assign(new Error('weird'), { code: 'E_WHAT' }),
    );
    const err = await api.LinkTrail.handleDeepLink('https://x').catch((e) => e);
    expect(err.code).toBe('unknown');
    expect(err).not.toHaveProperty('statusCode');
    expect(err).not.toHaveProperty('body');
  });

  it('onError carries statusCode and body for server errors', () => {
    const listener = jest.fn();
    api.LinkTrail.onError(listener);
    nativeEmit('onError', {
      code: 'server',
      message: 'Server returned status 503',
      statusCode: 503,
    });
    expect(listener).toHaveBeenCalledWith({
      code: 'server',
      legacyCode: 'server',
      message: 'Server returned status 503',
      statusCode: 503,
    });
  });
});

describe('version', () => {
  it('LinkTrail.version equals package.json', () => {
    expect(api.LinkTrail.version).toBe(require('../package.json').version);
  });

  it('nativeSdkVersion comes from native', () => {
    mockNative.nativeSdkVersion.mockReturnValue('0.1.0');
    expect(api.LinkTrail.nativeSdkVersion).toBe('0.1.0');
  });
});

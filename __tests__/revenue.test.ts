const mockTrackRevenue = jest.fn();

jest.mock('react-native', () => ({
  Linking: {
    getInitialURL: jest.fn(() => Promise.resolve(null)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('../src/NativeLinkTrail', () => ({
  __esModule: true,
  default: { trackRevenue: (...args: unknown[]) => mockTrackRevenue(...args) },
}));

jest.mock('../src/LinkTrailPasteButton', () => ({
  LinkTrailPasteButton: () => null,
}));

import { LinkTrail, LinkTrailRevenueError } from '../src';

const valid = { transactionId: '2000000123456', value: 9.99, currency: 'USD' };

beforeEach(() => {
  mockTrackRevenue.mockReset();
  mockTrackRevenue.mockResolvedValue({ id: 7, attributed: true, duplicate: false });
});

describe('LinkTrail.trackRevenue', () => {
  it('forwards normalised arguments to the native module', async () => {
    await LinkTrail.trackRevenue({
      transactionId: '  GPA.3300-1  ',
      value: 4.5,
      currency: ' usd ',
      productId: ' pro.monthly ',
    });
    expect(mockTrackRevenue).toHaveBeenCalledWith('GPA.3300-1', 4.5, 'USD', 'pro.monthly');
  });

  it('omits a missing or blank productId', async () => {
    await LinkTrail.trackRevenue(valid);
    await LinkTrail.trackRevenue({ ...valid, productId: '   ' });
    expect(mockTrackRevenue).toHaveBeenNthCalledWith(1, '2000000123456', 9.99, 'USD', undefined);
    expect(mockTrackRevenue).toHaveBeenNthCalledWith(2, '2000000123456', 9.99, 'USD', undefined);
  });

  it('resolves with the native result', async () => {
    await expect(LinkTrail.trackRevenue(valid)).resolves.toEqual({
      id: 7,
      attributed: true,
      duplicate: false,
    });
  });

  it('reports duplicates and tolerates a missing id', async () => {
    mockTrackRevenue.mockResolvedValue({ attributed: false, duplicate: true });
    const result = await LinkTrail.trackRevenue(valid);
    expect(result).toEqual({ attributed: false, duplicate: true });
    expect('id' in result).toBe(false);
  });

  it('accepts zero value and a 255-character transactionId', async () => {
    await LinkTrail.trackRevenue({ ...valid, value: 0, transactionId: 'x'.repeat(255) });
    expect(mockTrackRevenue).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['empty transactionId', { transactionId: '' }, 'invalid_transaction_id'],
    ['blank transactionId', { transactionId: '   ' }, 'invalid_transaction_id'],
    ['256-char transactionId', { transactionId: 'x'.repeat(256) }, 'invalid_transaction_id'],
    ['negative value', { value: -0.01 }, 'invalid_value'],
    ['NaN value', { value: NaN }, 'invalid_value'],
    ['Infinity value', { value: Infinity }, 'invalid_value'],
    ['string value', { value: '9.99' as unknown as number }, 'invalid_value'],
    ['2-letter currency', { currency: 'US' }, 'invalid_currency'],
    ['4-letter currency', { currency: 'USDX' }, 'invalid_currency'],
    ['numeric currency', { currency: '840' }, 'invalid_currency'],
  ])('rejects %s without calling native', async (_name, override, code) => {
    const promise = LinkTrail.trackRevenue({ ...valid, ...override });
    await expect(promise).rejects.toBeInstanceOf(LinkTrailRevenueError);
    await expect(promise).rejects.toMatchObject({ code, name: 'LinkTrailRevenueError' });
    expect(mockTrackRevenue).not.toHaveBeenCalled();
  });

  it('propagates native rejections unchanged', async () => {
    const nativeError = Object.assign(new Error('offline'), { code: 'transport' });
    mockTrackRevenue.mockRejectedValue(nativeError);
    await expect(LinkTrail.trackRevenue(valid)).rejects.toBe(nativeError);
  });
});

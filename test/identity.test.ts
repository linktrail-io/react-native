import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Identity, INVALID_USER_ID, type IdentityBridge } from '../src/identity';

function fakeBridge(initial: string | null = null) {
  const state = {
    stored: initial,
    forwards: [] as Array<string | null>,
    failForward: false,
  };
  const bridge: IdentityBridge = {
    persistUserId: async (id) => {
      state.stored = id;
    },
    loadUserId: async () => state.stored,
    forwardUserId: async (id) => {
      if (state.failForward) throw new Error('boom');
      state.forwards.push(id);
      return true;
    },
  };
  return { state, bridge };
}

describe('validation', () => {
  it('rejects invalid ids without storing or sending', async () => {
    const { state, bridge } = fakeBridge();
    const identity = new Identity(bridge);
    await identity.configure(false);
    for (const bad of ['', 'a@b.com', 'x'.repeat(129), 'has space!', '名前']) {
      await assert.rejects(identity.setUserId(bad), { code: INVALID_USER_ID });
    }
    await assert.rejects(identity.setUserId(undefined as never), {
      code: INVALID_USER_ID,
    });
    assert.equal(state.stored, null);
    assert.deepEqual(state.forwards, []);
  });

  it('accepts boundary and allowed characters', async () => {
    const { bridge } = fakeBridge();
    const identity = new Identity(bridge);
    await identity.setUserId('a'.repeat(128));
    await identity.setUserId('Az09_-.:');
    assert.equal(await identity.getUserId(), 'Az09_-.:');
  });
});

describe('consent gating', () => {
  let t: ReturnType<typeof fakeBridge>;
  beforeEach(() => {
    t = fakeBridge();
  });

  it('stores but never forwards while consent is undecided', async () => {
    const identity = new Identity(t.bridge);
    await identity.configure(true);
    await identity.setUserId('u1');
    assert.equal(t.state.stored, 'u1');
    assert.deepEqual(t.state.forwards, []);
  });

  it('forwards once on consent grant', async () => {
    const identity = new Identity(t.bridge);
    await identity.configure(true);
    await identity.setUserId('u1');
    await identity.setConsent(true);
    await identity.setConsent(true);
    assert.deepEqual(t.state.forwards, ['u1']);
  });

  it('clears the native id when consent is revoked, and resends on re-grant', async () => {
    const identity = new Identity(t.bridge);
    await identity.configure(false);
    await identity.setUserId('u1');
    await identity.setConsent(false);
    assert.equal(t.state.stored, 'u1');
    await identity.setConsent(true);
    assert.deepEqual(t.state.forwards, ['u1', null, 'u1']);
  });

  it('forwards immediately when consent is not required', async () => {
    const identity = new Identity(t.bridge);
    await identity.configure(false);
    await identity.setUserId('u1');
    await identity.setUserId('u1');
    await identity.setUserId('u2');
    assert.deepEqual(t.state.forwards, ['u1', 'u2']);
  });

  it('swallows forward failures', async () => {
    const identity = new Identity(t.bridge);
    await identity.configure(false);
    t.state.failForward = true;
    await identity.setUserId('u1');
    assert.equal(await identity.getUserId(), 'u1');
  });
});

describe('persistence and logout', () => {
  it('restores the stored id on the next launch and re-identifies', async () => {
    const first = fakeBridge();
    const a = new Identity(first.bridge);
    await a.configure(false);
    await a.setUserId('u1');

    const second = fakeBridge(first.state.stored);
    const b = new Identity(second.bridge);
    await b.configure(false);
    assert.equal(await b.getUserId(), 'u1');
    assert.deepEqual(second.state.forwards, ['u1']);
  });

  it('does not forward a restored id before consent', async () => {
    const t = fakeBridge('u1');
    const identity = new Identity(t.bridge);
    await identity.configure(true);
    assert.deepEqual(t.state.forwards, []);
    await identity.setConsent(true);
    assert.deepEqual(t.state.forwards, ['u1']);
  });

  it('ignores a corrupt stored id', async () => {
    const t = fakeBridge('bad id!');
    const identity = new Identity(t.bridge);
    await identity.configure(false);
    assert.equal(await identity.getUserId(), null);
  });

  it('logout clears storage and detaches the id', async () => {
    const t = fakeBridge();
    const identity = new Identity(t.bridge);
    await identity.configure(false);
    await identity.setUserId('u1');
    await identity.logout();
    assert.equal(t.state.stored, null);
    assert.equal(await identity.getUserId(), null);
    assert.deepEqual(t.state.forwards, ['u1', null]);
  });
});

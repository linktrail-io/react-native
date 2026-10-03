/**
 * User identity (`setUserId` / `logout`) state machine.
 *
 * Pure TypeScript with an injected native bridge so it can be unit-tested
 * without React Native. The wrapper owns the id (validation, persistence via
 * the native bridge, consent gating); delivery to the backend is delegated to
 * the native SDK through `forwardUserId`, which resolves `false` when the
 * pinned native SDK has no identity support yet.
 */

/** Allowed characters/length for a user id (matches the backend contract). */
export const USER_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Rejection code for an id that fails validation. */
export const INVALID_USER_ID = 'invalid_user_id';

export interface IdentityBridge {
  /** Persists the id (or clears it with `null`). */
  persistUserId(userId: string | null): Promise<void>;
  /** Reads the persisted id. */
  loadUserId(): Promise<string | null>;
  /**
   * Hands the id to the native SDK (`null` = stop attaching/clear). Resolves
   * `true` if the native SDK accepted it, `false` if unsupported/unconfigured.
   */
  forwardUserId(userId: string | null): Promise<boolean>;
}

function invalidUserId(): Error {
  const error = new Error(
    'Invalid userId: must be 1-128 characters from A-Z a-z 0-9 _ - . : ' +
      '(use an opaque internal id or a hash, never an email, phone or name).'
  ) as Error & { code: string };
  error.code = INVALID_USER_ID;
  return error;
}

export class Identity {
  private userId: string | null = null;
  private consent = false;
  /** The value last forwarded to the native SDK (avoids duplicate identify). */
  private forwarded: string | null = null;
  private ready: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly bridge: IdentityBridge) {}

  /**
   * Called from `configure`. `requireConsent: false` means tracking is allowed
   * immediately; otherwise it stays denied until `setConsent(true)`.
   */
  configure(requireConsent: boolean): Promise<void> {
    return this.run(async () => {
      await this.load();
      this.consent = !requireConsent;
      this.forwarded = null; // fresh SDK instance per launch
      await this.sync();
    });
  }

  setConsent(granted: boolean): Promise<void> {
    return this.run(async () => {
      this.consent = granted;
      await this.load();
      await this.sync();
    });
  }

  setUserId(userId: string): Promise<void> {
    if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) {
      return Promise.reject(invalidUserId());
    }
    return this.run(async () => {
      await this.load();
      this.userId = userId;
      await this.bridge.persistUserId(userId);
      await this.sync();
    });
  }

  logout(): Promise<void> {
    return this.run(async () => {
      await this.load();
      this.userId = null;
      await this.bridge.persistUserId(null);
      await this.sync();
    });
  }

  getUserId(): Promise<string | null> {
    return this.run(async () => {
      await this.load();
    }).then(() => this.userId);
  }

  private load(): Promise<void> {
    this.ready ??= this.bridge
      .loadUserId()
      .then((stored) => {
        if (this.userId === null && stored && USER_ID_PATTERN.test(stored)) {
          this.userId = stored;
        }
      })
      .catch(() => {
        this.ready = null; // retry on the next operation
      });
    return this.ready;
  }

  /**
   * Reconciles the native SDK with the desired state: the id is forwarded only
   * while consent is granted and cleared otherwise. Best-effort, never throws.
   */
  private async sync(): Promise<void> {
    const desired = this.consent ? this.userId : null;
    if (desired === this.forwarded) {
      return;
    }
    try {
      await this.bridge.forwardUserId(desired);
      this.forwarded = desired;
    } catch {
      // Identity is best-effort: failures never reach the app.
    }
  }

  /** Serialises operations so persist/forward ordering is deterministic. */
  private run(op: () => Promise<void>): Promise<void> {
    const next = this.queue.then(op, op);
    this.queue = next.catch(() => {});
    return next;
  }
}

import { describe, expect, it } from 'vitest';
import { isAllowlistedAccount } from '../src/access';

const allowlist = {
  uids: ['hugo-uid'],
  emails: ['hugo@example.com'],
};

describe('isAllowlistedAccount', () => {
  it('acepta el uid sin mirar el correo', () => {
    expect(
      isAllowlistedAccount(
        { uid: 'hugo-uid', email: 'otro@example.com', emailVerified: false },
        allowlist,
      ),
    ).toBe(true);
  });

  it('acepta el correo verificado aunque el uid no esté', () => {
    expect(
      isAllowlistedAccount(
        { uid: 'otro', email: 'Hugo@Example.com', emailVerified: true },
        allowlist,
      ),
    ).toBe(true);
  });

  it('rechaza el correo si no está verificado y la lista vacía', () => {
    expect(
      isAllowlistedAccount(
        { uid: 'otro', email: 'hugo@example.com', emailVerified: false },
        allowlist,
      ),
    ).toBe(false);
    expect(
      isAllowlistedAccount(
        { uid: 'otro', email: 'hugo@example.com', emailVerified: true },
        { uids: [], emails: [] },
      ),
    ).toBe(false);
  });
});

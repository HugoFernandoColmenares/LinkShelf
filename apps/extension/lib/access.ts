import { isAllowlistedAccount, PRIVATE_INSTANCE_MESSAGE } from '@linkshelf/firebase/personal';
import type { User } from 'firebase/auth/web-extension';
import { auth } from './firebase';

export { PRIVATE_INSTANCE_MESSAGE };

const allowlist = {
  uids: __LS_ALLOWED_UIDS__,
  emails: __LS_ALLOWED_EMAILS__,
};

export function personalUser(user: User | null = auth.currentUser): User | null {
  if (!user) return null;
  return isAllowlistedAccount(
    { uid: user.uid, email: user.email, emailVerified: user.emailVerified },
    allowlist,
  )
    ? user
    : null;
}

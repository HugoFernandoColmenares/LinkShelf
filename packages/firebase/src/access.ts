export interface AccountIdentity {
  uid: string;
  email?: string | null;
  emailVerified: boolean;
}

export interface AccessAllowlist {
  uids: readonly string[];
  emails: readonly string[];
}

export const PRIVATE_INSTANCE_MESSAGE =
  'Esta es una instancia privada. Tu cuenta no tiene acceso a la base de datos.';

export const DEMO_FALLBACK_MESSAGE =
  'Sigues en el modo demo: los enlaces se quedan en este navegador.';

export const RULES_DENIED_MESSAGE =
  'Firestore rechazó esta cuenta. Revisa que config/access incluya tu UID o tu correo verificado, en minúsculas.';

/** True when the Firebase account matches the configured UID or a verified email. */
export function isAllowlistedAccount(
  account: AccountIdentity,
  allowlist: AccessAllowlist,
): boolean {
  const uid = account.uid.trim();
  if (uid.length > 0 && allowlist.uids.some((item) => item.trim() === uid)) return true;
  if (!account.emailVerified) return false;
  const email = account.email?.trim().toLowerCase() ?? '';
  if (!email) return false;
  return allowlist.emails.some((item) => item.trim().toLowerCase() === email);
}

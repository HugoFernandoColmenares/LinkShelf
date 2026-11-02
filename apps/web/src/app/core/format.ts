export function formatWhen(date: Date | null): string {
  if (!date) return 'pendiente de sincronizar';
  const diff = Date.now() - date.getTime();
  const day = 86_400_000;
  if (diff >= 0 && diff < day) return 'hoy';
  if (diff >= 0 && diff < 2 * day) return 'ayer';
  if (diff >= 0 && diff < 7 * day) return `hace ${Math.floor(diff / day)} d`;
  return new Intl.DateTimeFormat('es-419', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code.includes('popup-closed')) return 'Cerraste la ventana de Google.';
  if (code.includes('email-already-in-use')) return 'Ese correo ya existe. Revisa la contraseña.';
  if (code.includes('invalid-email')) return 'El correo no es válido.';
  if (code.includes('weak-password')) return 'Usa al menos 6 caracteres.';
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo iniciar sesión.';
}

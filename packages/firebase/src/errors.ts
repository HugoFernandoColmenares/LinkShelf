import type { Link } from './link';

export class DuplicateError extends Error {
  readonly level = 'exact' as const;

  constructor(readonly existing: Link) {
    super('Ya guardaste este enlace');
    this.name = 'DuplicateError';
  }
}

export function firestoreErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied')) return 'No tienes permiso. Vuelve a iniciar sesión.';
  if (code.includes('resource-exhausted')) return 'Cuota diaria agotada; se reintentará mañana.';
  if (code.includes('unavailable'))
    return 'Sin conexión. El cambio quedó pendiente de sincronizar.';
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo completar la operación.';
}

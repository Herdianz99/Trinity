/**
 * Normaliza un email para guardarlo/consultarlo de forma uniforme:
 * sin espacios alrededor y en minusculas. Asi el casing nunca rompe el login
 * (ej. "Roxana@gmail.com" vs "roxana@gmail.com").
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

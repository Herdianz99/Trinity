import * as crypto from 'crypto';

// Clave temporal legible (sin 0/O/1/l/I). El usuario la cambia en su primer login.
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(crypto.randomInt(chars.length));
  }
  return password;
}

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export function hashOtp(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

/** Six-digit numeric OTP as a zero-padded string. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function verifyOtpHash(code: string, codeHash: string): boolean {
  const hashed = hashOtp(code)
  try {
    const a = Buffer.from(hashed, 'hex')
    const b = Buffer.from(codeHash, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

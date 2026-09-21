/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export interface StoredAdminPin {
  version: 1
  salt: string
  hash: string
}

export function validatePin(pin: string): void {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('Admin PIN must contain 4 to 12 digits.')
}

export async function hashAdminPin(pin: string): Promise<StoredAdminPin> {
  validatePin(pin)
  const salt = randomBytes(16)
  const hash = (await scrypt(pin, salt, 32)) as Buffer
  return { version: 1, salt: salt.toString('base64'), hash: hash.toString('base64') }
}

export async function verifyAdminPin(pin: string, stored: StoredAdminPin): Promise<boolean> {
  if (!/^\d{4,12}$/.test(pin) || stored.version !== 1) return false
  try {
    const expected = Buffer.from(stored.hash, 'base64')
    const actual = (await scrypt(
      pin,
      Buffer.from(stored.salt, 'base64'),
      expected.length
    )) as Buffer
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export class PinAttemptLimiter {
  private failures = 0
  private blockedUntil = 0

  constructor(private readonly now: () => number = Date.now) {}

  assertAllowed(): void {
    const remaining = this.blockedUntil - this.now()
    if (remaining > 0)
      throw new Error(
        `Too many incorrect PIN attempts. Try again in ${Math.ceil(remaining / 1000)} seconds.`
      )
  }

  record(success: boolean): void {
    if (success) {
      this.failures = 0
      this.blockedUntil = 0
      return
    }
    this.failures += 1
    if (this.failures >= 5) {
      this.blockedUntil = this.now() + 30_000
      this.failures = 0
    }
  }
}

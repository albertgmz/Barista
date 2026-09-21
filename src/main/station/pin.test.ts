/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { hashAdminPin, PinAttemptLimiter, validatePin, verifyAdminPin } from './pin'

describe('station admin PIN', () => {
  it('stores a salted scrypt hash and verifies without retaining the PIN', async () => {
    const first = await hashAdminPin('2468')
    const second = await hashAdminPin('2468')
    expect(first.hash).not.toBe(second.hash)
    expect(JSON.stringify(first)).not.toContain('2468')
    await expect(verifyAdminPin('2468', first)).resolves.toBe(true)
    await expect(verifyAdminPin('1357', first)).resolves.toBe(false)
  })

  it('accepts only 4 to 12 digits', () => {
    expect(() => validatePin('1234')).not.toThrow()
    expect(() => validatePin('123')).toThrow(/4 to 12 digits/)
    expect(() => validatePin('abcd')).toThrow(/4 to 12 digits/)
  })

  it('temporarily blocks brute-force attempts and resets after success', () => {
    let now = 1000
    const limiter = new PinAttemptLimiter(() => now)
    for (let index = 0; index < 5; index++) limiter.record(false)
    expect(() => limiter.assertAllowed()).toThrow('Too many incorrect PIN attempts')
    now += 30_000
    expect(() => limiter.assertAllowed()).not.toThrow()
    limiter.record(true)
    expect(() => limiter.assertAllowed()).not.toThrow()
  })
})

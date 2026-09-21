/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { userInfo } from 'node:os'

const SECRET_KEY =
  /^(?:password|passphrase|connectionstring|connectionuri|apikey|secret|adminpin|adminpinhash|pinhash)$/i
const TOKEN_KEY = /token$/i
const DATA_KEY =
  /^(?:serial|serialnumber|serialrange|resolvedvalue|resolvedvalues|variablevalues|values|fields|rows|excelcontents)$/i

function cleanString(value: string, username: string): string {
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let clean = value
  if (escaped) {
    clean = clean
      .replace(
        new RegExp(
          `([A-Za-z]:[\\\\/](?:Users|Documents and Settings)[\\\\/])${escaped}(?=[\\\\/])`,
          'gi'
        ),
        '$1%USER%'
      )
      .replace(new RegExp(`([\\\\/](?:Users|home)[\\\\/])${escaped}(?=[\\\\/])`, 'gi'), '$1%USER%')
  }
  clean = clean
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s:/]+):([^\s@/]+)@/gi, '$1%USER%:[REDACTED]@')
    .replace(/\b(password|passphrase|secret|admin[_-]?pin)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(
      /\b(api[_-]?token|access[_-]?token)\s*[:=]\s*([^\s,;]+)/gi,
      (_match, key, token: string) => `${key}=[REDACTED …${token.slice(-4)}]`
    )
  return clean
}

function redactValue(value: unknown, username: string, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return cleanString(value, username)
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Error) {
    return {
      name: value.name,
      message: cleanString(value.message, username),
      stack: value.stack ? cleanString(value.stack, username) : undefined
    }
  }
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, username, seen))
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (DATA_KEY.test(key)) result[key] = '[REDACTED data values]'
    else if (SECRET_KEY.test(key)) result[key] = '[REDACTED]'
    else if (TOKEN_KEY.test(key) && key.toLowerCase() !== 'tokenname' && typeof item === 'string')
      result[key] = `[REDACTED token …${item.slice(-4)}]`
    else result[key] = redactValue(item, username, seen)
  }
  return result
}

/** Redaction is applied before serialization so secrets never reach a log file. */
export function redactForDiagnostics(value: unknown, username = userInfo().username): unknown {
  return redactValue(value, username, new WeakSet())
}

/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { CounterVariable } from '@shared/template/types'
import { SqliteDataRepositories } from '../data/sqlite'
import type { SerialRepository, SerialReservation } from '../data/types'

export type { SerialReservation }

export interface SerialService extends SerialRepository {
  close(): void
}

/**
 * Compatibility facade for callers that need a standalone local serial ledger.
 * Application printing uses the selected repository through DataStoreManager.
 */
export class SqliteSerialService implements SerialService {
  private readonly store: SqliteDataRepositories

  constructor(path: string) {
    this.store = new SqliteDataRepositories(path)
  }

  peek(variable: CounterVariable, date?: Date): Promise<number> {
    return this.store.serials.peek(variable, date)
  }

  reserve(variable: CounterVariable, count: number, date?: Date): Promise<SerialReservation> {
    return this.store.serials.reserve(variable, count, date)
  }

  commit(reservationId: string): Promise<void> {
    return this.store.serials.commit(reservationId)
  }

  fail(reservationId: string, policy: CounterVariable['failure']): Promise<void> {
    return this.store.serials.fail(reservationId, policy)
  }

  reset(counterId: string, value: number): Promise<void> {
    return this.store.serials.reset(counterId, value)
  }

  close(): void {
    void this.store.close()
  }
}

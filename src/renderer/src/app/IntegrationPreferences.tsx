/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useState, type JSX } from 'react'
import { Button, Checkbox, Field, Input, Select, Textarea } from '@fluentui/react-components'
import type {
  IntegrationConfiguration,
  IntegrationScope,
  IntegrationStatus
} from '@shared/integration'
export function IntegrationPreferences(): JSX.Element {
  const [status, setStatus] = useState<IntegrationStatus>(),
    [draft, setDraft] = useState<IntegrationConfiguration>(),
    [message, setMessage] = useState(''),
    [name, setName] = useState(''),
    [scopes, setScopes] = useState<IntegrationScope[]>(['read']),
    [secret, setSecret] = useState('')
  const load = (): void => {
    void window.barista.invoke('integration:status').then((result) => {
      if (result.ok) {
        setStatus(result.value)
        setDraft(result.value.configuration)
      } else setMessage(result.error.message)
    })
  }
  useEffect(load, [])
  if (!draft) return <p>Loading integration settings…</p>
  const save = async (): Promise<void> => {
    const result = await window.barista.invoke('integration:save', draft)
    if (result.ok) {
      setStatus(result.value)
      setMessage(
        result.value.running ? `Listening on port ${result.value.actualPort}.` : 'Server disabled.'
      )
    } else setMessage(result.error.message)
  }
  const create = async (): Promise<void> => {
    const result = await window.barista.invoke('integration:createToken', { name, scopes })
    if (result.ok) {
      setSecret(result.value.token)
      setName('')
      load()
    } else setMessage(result.error.message)
  }
  const toggle = (scope: IntegrationScope): void =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
    )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Checkbox
        label="Enable local integration server"
        checked={draft.enabled}
        onChange={(_, data) => setDraft({ ...draft, enabled: data.checked === true })}
      />
      <Field label="Port">
        <Input
          type="number"
          value={String(draft.port)}
          onChange={(_, data) => setDraft({ ...draft, port: Number(data.value) })}
        />
      </Field>
      <Field label="Bind address">
        <Select
          value={draft.bindAddress}
          onChange={(event) =>
            setDraft({
              ...draft,
              bindAddress: event.target.value as IntegrationConfiguration['bindAddress']
            })
          }
        >
          <option value="127.0.0.1">127.0.0.1 (this computer)</option>
          <option value="0.0.0.0">0.0.0.0 (LAN)</option>
        </Select>
      </Field>
      {draft.bindAddress === '0.0.0.0' ? (
        <div>
          <p role="alert" style={{ color: '#b10e1e' }}>
            LAN traffic uses unencrypted HTTP. Anyone who captures a bearer token can use its
            scopes, including printing. Enable this only on a trusted, firewalled network.
          </p>
          <Checkbox
            label="I understand LAN clients can reach this server"
            checked={draft.allowLan}
            onChange={(_, data) => setDraft({ ...draft, allowLan: data.checked === true })}
          />
        </div>
      ) : null}
      <Field label="Allowed browser origins" hint="One exact http:// or https:// origin per line.">
        <Textarea
          value={draft.allowedOrigins.join('\n')}
          onChange={(_, data) =>
            setDraft({
              ...draft,
              allowedOrigins: data.value
                .split(/\r?\n/)
                .map((value) => value.trim())
                .filter(Boolean)
            })
          }
        />
      </Field>
      <Checkbox
        label="Start integration server with Windows"
        checked={draft.startWithWindows}
        onChange={(_, data) => setDraft({ ...draft, startWithWindows: data.checked === true })}
      />
      <Button appearance="primary" onClick={() => void save()}>
        Save integration settings
      </Button>
      <h3>API tokens</h3>
      <Field label="Token name">
        <Input value={name} onChange={(_, data) => setName(data.value)} />
      </Field>
      <div>
        {(['read', 'preview', 'print'] as const).map((scope) => (
          <Checkbox
            key={scope}
            label={scope}
            checked={scopes.includes(scope)}
            onChange={() => toggle(scope)}
          />
        ))}
      </div>
      <Button disabled={!name.trim() || !scopes.length} onClick={() => void create()}>
        Generate token
      </Button>
      {secret ? (
        <div role="status">
          <strong>Copy this token now. It will not be shown again.</strong>
          <div style={{ overflowWrap: 'anywhere' }}>{secret}</div>
          <Button onClick={() => void navigator.clipboard.writeText(secret)}>Copy</Button>
          <Button onClick={() => setSecret('')}>Hide</Button>
        </div>
      ) : null}
      {status?.tokens.map((token) => (
        <div key={token.id}>
          {token.name} · {token.scopes.join(', ')}{' '}
          <Button
            onClick={() =>
              void window.barista.invoke('integration:revokeToken', { id: token.id }).then(load)
            }
          >
            Revoke
          </Button>
        </div>
      ))}
      <h3>Recent requests</h3>
      {status?.recentLogs.slice(0, 20).map((entry) => (
        <small key={entry.id}>
          {new Date(entry.date).toLocaleString()} · {entry.client} ·{' '}
          {entry.tokenName ?? 'unauthenticated'} · {entry.endpoint} · {entry.result}
        </small>
      ))}
      {message ? <p role="status">{message}</p> : null}
    </div>
  )
}

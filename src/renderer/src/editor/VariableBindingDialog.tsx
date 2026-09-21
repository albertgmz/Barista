/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle
} from '@fluentui/react-components'
import { useDocumentStore, useEditorStore, useUiStore } from '../store'
import { bindVariable } from './variableActions'
import { variableTint } from './variableColor'

export function VariableBindingDialog(): JSX.Element {
  const open = useUiStore((state) => state.isVariableBindingOpen)
  const variables = useDocumentStore((state) => state.document.template.variables)
  const [name, setName] = useState(variables[0]?.name ?? '')
  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => useUiStore.getState().setVariableBindingOpen(data.open)}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Bind to variable</DialogTitle>
          <DialogContent>
            {variables.length ? (
              <label className="document-properties">
                Variable
                <select value={name} onChange={(event) => setName(event.target.value)}>
                  {variables.map((variable) => (
                    <option
                      key={variable.id}
                      value={variable.name}
                      className="variable-option"
                      style={variableTint(variable.name)}
                    >
                      {variable.name} · {variable.kind}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>Create a variable in the Variables panel first.</p>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => useUiStore.getState().setVariableBindingOpen(false)}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              disabled={!name}
              onClick={() => {
                const ids = useEditorStore.getState().selectedIds
                useDocumentStore.getState().change((document) => ({
                  ...document,
                  template: {
                    ...document.template,
                    design: {
                      ...document.template.design,
                      objects: document.template.design.objects.map((object) =>
                        ids.includes(object.id) && !object.locked
                          ? bindVariable(object, name)
                          : object
                      )
                    }
                  }
                }))
                useUiStore.getState().setVariableBindingOpen(false)
              }}
            >
              Bind
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

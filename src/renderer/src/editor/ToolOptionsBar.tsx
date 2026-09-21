/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { Fragment, useState } from 'react'
import type { JSX, ReactElement } from 'react'
import {
  Button,
  Input,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Select,
  ToggleButton,
  Tooltip
} from '@fluentui/react-components'
import {
  ArrowFitIn20Regular,
  ArrowMove20Regular,
  BarcodeScanner20Regular,
  Circle20Regular,
  ColorFill20Regular,
  Cursor20Regular,
  Dismiss20Regular,
  Image20Regular,
  Info20Regular,
  Line20Regular,
  LineThickness20Regular,
  Pen20Regular,
  QrCode20Regular,
  RectangleLandscape20Regular,
  ResizeLarge20Regular,
  SelectAllOn20Regular,
  TextAlignCenter20Regular,
  TextAlignLeft20Regular,
  TextAlignRight20Regular,
  TextBold20Regular,
  TextColor20Regular,
  TextFont20Regular,
  TextFontSize20Regular,
  TextItalic20Regular,
  TextT20Regular
} from '@fluentui/react-icons'
import { useDocumentStore, useEditorStore } from '../store'
import type { ToolId } from '../store'
import { useToolOptionsStore } from '../store/toolOptionsStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useFontStore } from '../store/fontStore'
import type { ObjectPatch } from '@shared/template/document'
import type { BarcodeSymbology, LabelObject, ObjectKind } from '@shared/template/types'
import { BARCODE_SYMBOLOGIES } from '@shared/template/symbologies'
import { importImage } from './fileActions'
import { applyFontFamily } from './fontActions'
import { toolOptionsLayout } from './toolOptions'
import type { OptionsGroup } from './toolOptions'

const ICONS: Record<ObjectKind | ToolId, ReactElement> = {
  select: <Cursor20Regular />,
  text: <TextT20Regular />,
  barcode: <BarcodeScanner20Regular />,
  qrcode: <QrCode20Regular />,
  image: <Image20Regular />,
  rect: <RectangleLandscape20Regular />,
  ellipse: <Circle20Regular />,
  line: <Line20Regular />,
  pen: <Pen20Regular />,
  path: <Pen20Regular />
}

/** Alignments in reading order, for the segmented alignment control. */
const ALIGNMENTS: readonly (readonly [
  value: 'left' | 'center' | 'right',
  label: string,
  icon: ReactElement
])[] = [
  ['left', 'Align left', <TextAlignLeft20Regular />],
  ['center', 'Align center', <TextAlignCenter20Regular />],
  ['right', 'Align right', <TextAlignRight20Regular />]
]

/**
 * Leading icon for a field. The control beside it carries the accessible name,
 * so the icon is decorative and stays out of the accessibility tree.
 */
function marker(icon: ReactElement): JSX.Element {
  return (
    <span className="options-icon" aria-hidden>
      {icon}
    </span>
  )
}

/** Objects that carry an outline, which is every shape the tools can draw. */
type StrokedObject = Extract<LabelObject, { strokeWidthMm: number }>
/** Objects that carry a fill, so a line is deliberately excluded. */
type FilledObject = Extract<LabelObject, { fill: string | null }>

export function ToolOptionsBar(): JSX.Element {
  const tool = useEditorStore((state) => state.activeTool)
  const ids = useEditorStore((state) => state.selectedIds)
  const doc = useDocumentStore((state) => state.document)
  const options = useToolOptionsStore((state) => state.options)
  const fonts = useFontStore((state) => state.catalog.families)
  const keepInside = useEditorStore((state) => state.keepObjectsInsideLabel)
  const [fontNotice, setFontNotice] = useState<string | null>(null)

  const selected = doc.template.design.objects.filter((object) => ids.includes(object.id))
  const first = selected[0]
  const layout = toolOptionsLayout(
    selected.map((object) => object.kind),
    tool
  )
  const mixed = first !== undefined && selected.some((object) => object.kind !== first.kind)

  /** Edits the selection; with nothing selected only the tool defaults change. */
  const patch = (value: ObjectPatch): void => {
    if (ids.length > 0) useDocumentStore.getState().updateObjects(ids, value)
  }

  const field = (key: 'xMm' | 'yMm' | 'widthMm' | 'heightMm', label: string): JSX.Element => {
    const agreed = first && selected.every((object) => object[key] === first[key])
    return (
      <label className="options-field" key={key}>
        <span>{label}</span>
        <Input
          aria-label={`Options ${key}`}
          size="small"
          type="number"
          step="0.1"
          style={{ width: 96 }}
          contentAfter={<span className="options-unit">mm</span>}
          placeholder={agreed ? undefined : 'Mixed'}
          value={agreed && first ? String(Math.round(first[key] * 100) / 100) : ''}
          onChange={(_, data) => {
            const next = Number(data.value)
            if (data.value.trim() !== '' && Number.isFinite(next)) patch({ [key]: next })
          }}
        />
      </label>
    )
  }

  const textGroup = (): JSX.Element => {
    const text = first?.kind === 'text' ? first : undefined
    const bold = text ? text.fontWeight === 'bold' : options.bold
    const italic = text ? text.fontStyle === 'italic' : options.italic
    const alignment = text ? text.align : options.alignment.toLowerCase()
    return (
      <>
        <div className="options-field">
          {marker(<TextFont20Regular />)}
          <Select
            aria-label="Options font"
            size="small"
            style={{ width: 156 }}
            value={text ? text.fontFamily : options.font}
            onChange={(_, data) => {
              useToolOptionsStore.getState().update({ font: data.value })
              const font = fonts.find((item) => item.family === data.value)
              if (!font) return
              setFontNotice(applyFontFamily(font, ids))
            }}
          >
            {fonts.map((font) => (
              <option key={`${font.source}-${font.id}`} value={font.family}>
                {font.family}
              </option>
            ))}
          </Select>
        </div>
        <div className="options-field">
          {marker(<TextFontSize20Regular />)}
          <Input
            aria-label="Options font size"
            size="small"
            type="number"
            min={1}
            max={1000}
            style={{ width: 88 }}
            contentAfter={<span className="options-unit">pt</span>}
            value={String(text ? text.fontSizePt : options.size)}
            onChange={(_, data) => {
              const next = Number(data.value)
              if (next >= 1 && next <= 1000) {
                useToolOptionsStore.getState().update({ size: next })
                patch({ fontSizePt: next })
              }
            }}
          />
        </div>
        <div className="options-segment">
          <Tooltip content="Bold" relationship="label">
            <ToggleButton
              size="small"
              appearance="subtle"
              icon={<TextBold20Regular />}
              checked={bold}
              onClick={() => {
                useToolOptionsStore.getState().update({ bold: !bold })
                patch({ fontWeight: bold ? 'normal' : 'bold' })
              }}
            />
          </Tooltip>
          <Tooltip content="Italic" relationship="label">
            <ToggleButton
              size="small"
              appearance="subtle"
              icon={<TextItalic20Regular />}
              checked={italic}
              onClick={() => {
                useToolOptionsStore.getState().update({ italic: !italic })
                patch({ fontStyle: italic ? 'normal' : 'italic' })
              }}
            />
          </Tooltip>
        </div>
        <div className="options-segment" role="group" aria-label="Options text alignment">
          {ALIGNMENTS.map(([value, label, icon]) => (
            <Tooltip key={value} content={label} relationship="label">
              <ToggleButton
                size="small"
                appearance="subtle"
                icon={icon}
                checked={alignment === value}
                onClick={() => {
                  useToolOptionsStore.getState().update({ alignment: value })
                  patch({ align: value })
                }}
              />
            </Tooltip>
          ))}
        </div>
        <div className="options-field">
          {marker(<TextColor20Regular />)}
          <input
            className="options-color"
            aria-label="Options text color"
            type="color"
            value={text ? text.color : options.color}
            onChange={(event) => {
              useToolOptionsStore.getState().update({ color: event.target.value })
              patch({ color: event.target.value })
            }}
          />
        </div>
      </>
    )
  }

  const barcodeGroup = (): JSX.Element => {
    const barcodes = selected.filter((object) => object.kind === 'barcode')
    const head = barcodes[0]
    const symbology =
      head && barcodes.every((object) => object.symbology === head.symbology) ? head.symbology : ''
    return (
      <div className="options-field">
        {marker(<BarcodeScanner20Regular />)}
        <Select
          aria-label="Options barcode type"
          size="small"
          style={{ width: 180 }}
          value={symbology}
          onChange={(_, data) => patch({ symbology: data.value as BarcodeSymbology })}
        >
          <option value="" disabled>
            Mixed
          </option>
          {BARCODE_SYMBOLOGIES.map((descriptor) => (
            <option key={descriptor.value} value={descriptor.value}>
              {descriptor.label}
            </option>
          ))}
        </Select>
      </div>
    )
  }

  const shapeGroup = (): JSX.Element => {
    const stroked = selected.filter((object): object is StrokedObject => 'strokeWidthMm' in object)
    const filled = selected.filter((object): object is FilledObject => 'fill' in object)
    const headStroke = stroked[0]
    const headFill = filled[0]
    const stroke = headStroke
      ? stroked.every((object) => object.strokeWidthMm === headStroke.strokeWidthMm)
        ? String(headStroke.strokeWidthMm)
        : ''
      : String(options.strokeWidth)
    // The two choices cover the fills these tools draw; anything else reads as mixed.
    const agreed = headFill && filled.every((object) => object.fill === headFill.fill)
    const fill = !headFill
      ? options.fill
      : agreed && headFill.fill === null
        ? '#ffffff'
        : agreed && headFill.fill === '#000000'
          ? '#000000'
          : ''
    return (
      <>
        <div className="options-field">
          {marker(<LineThickness20Regular />)}
          <Input
            aria-label="Tool stroke width"
            size="small"
            type="number"
            min={0}
            max={20}
            step="0.1"
            style={{ width: 92 }}
            contentAfter={<span className="options-unit">mm</span>}
            placeholder={stroke === '' ? 'Mixed' : undefined}
            value={stroke}
            onChange={(_, data) => {
              const next = Number(data.value)
              if (data.value.trim() === '' || !(next >= 0 && next <= 20)) return
              useToolOptionsStore.getState().update({ strokeWidth: next })
              patch({ strokeWidthMm: next })
            }}
          />
        </div>
        {/* A line has no fill, so the control would not answer for the selection. */}
        {(selected.length === 0 || filled.length > 0) && (
          <div className="options-field">
            {marker(<ColorFill20Regular />)}
            <Select
              aria-label="Tool fill"
              size="small"
              style={{ width: 108 }}
              value={fill}
              onChange={(_, data) => {
                useToolOptionsStore.getState().update({ fill: data.value })
                const fillIds = filled.map((object) => object.id)
                if (fillIds.length > 0)
                  useDocumentStore
                    .getState()
                    .updateObjects(fillIds, { fill: data.value === '#000000' ? '#000000' : null })
              }}
            >
              <option value="" disabled>
                Mixed
              </option>
              <option value="#ffffff">None</option>
              <option value="#000000">Black</option>
            </Select>
          </div>
        )}
      </>
    )
  }

  const group = (name: OptionsGroup): JSX.Element => {
    switch (name) {
      case 'text':
        return textGroup()
      case 'barcode':
        return barcodeGroup()
      case 'shape':
        return shapeGroup()
      case 'image':
        return (
          <Button size="small" icon={<Image20Regular />} onClick={() => void importImage()}>
            Import image…
          </Button>
        )
      case 'position':
        return (
          <>
            {marker(<ArrowMove20Regular />)}
            {field('xMm', 'X')}
            {field('yMm', 'Y')}
            {marker(<ResizeLarge20Regular />)}
            {field('widthMm', 'W')}
            {field('heightMm', 'H')}
          </>
        )
    }
  }

  return (
    <section
      className="options-bar"
      aria-label="Tool options"
      onFocusCapture={() => useDocumentStore.getState().beginGesture()}
      onBlurCapture={() => useDocumentStore.getState().endGesture()}
    >
      <div className="options-row">
        <div className="options-tool">
          {mixed ? <SelectAllOn20Regular /> : ICONS[first?.kind ?? tool]}
          <span>{layout.title}</span>
        </div>
        <div className="chrome-divider" aria-hidden />
        {layout.groups.map((name, index) => (
          <Fragment key={name}>
            {index > 0 && <div className="chrome-divider" aria-hidden />}
            <div className="options-group">{group(name)}</div>
          </Fragment>
        ))}
        {layout.hint && (
          <span className="options-hint">
            {marker(<Info20Regular />)}
            {layout.hint}
          </span>
        )}
        <div className="options-keep">
          <div className="chrome-divider" aria-hidden />
          <Tooltip
            content="Prevent objects from extending outside the printable label area"
            relationship="description"
          >
            <ToggleButton
              size="small"
              icon={<ArrowFitIn20Regular />}
              checked={keepInside}
              onClick={() => {
                const enabled = !keepInside
                useEditorStore.getState().setKeepObjectsInsideLabel(enabled)
                useWorkspaceStore.getState().setKeepObjectsInsideLabel(enabled)
                if (enabled) useDocumentStore.getState().change((document) => document)
              }}
            >
              Keep inside label
            </ToggleButton>
          </Tooltip>
        </div>
      </div>
      {fontNotice && (
        <MessageBar intent="warning">
          <MessageBarBody>{fontNotice}</MessageBarBody>
          <MessageBarActions
            containerAction={
              <Button
                appearance="transparent"
                icon={<Dismiss20Regular />}
                aria-label="Dismiss font notice"
                onClick={() => setFontNotice(null)}
              />
            }
          />
        </MessageBar>
      )}
    </section>
  )
}

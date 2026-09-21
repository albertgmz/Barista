/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import {
  ActiveSelection,
  FabricObject,
  Line,
  Point,
  Textbox,
  controlsUtils,
  loadSVGFromString,
  util
} from 'fabric'
import type { Canvas, Control, TransformActionHandler } from 'fabric'
import { mmToPx, pxToMm, ptToMm } from '@shared/units'
import { bounds as objectBounds, createObject } from '@shared/template/document'
import { objectSvg } from '@shared/render/svg'
import { snap } from '@shared/snapping'
import { evaluatedDocument, templateSegments } from '@shared/variables'
import { fitText, textTopOffset } from '@shared/textFit'
import { encoderMessage, symbologyDescriptor } from '@shared/template/symbologies'
import type { LabelObject, VerticalAlign } from '@shared/template/types'
import { useDocumentStore } from '../store/documentStore'
import { useEditorStore } from '../store/editorStore'
import { useUiStore } from '../store/uiStore'
import { useToolOptionsStore } from '../store/toolOptionsStore'
import { useFontStore } from '../store/fontStore'
import { applyFontFamily } from './fontActions'
import { nudge } from './objectActions'
import { bindVariable, objectExpression } from './variableActions'
import { importImage } from './fileActions'
import { commitPatch } from './commitPatch'
import { canvasTextMeasurer } from './textMeasure'
type Item = FabricObject & { objectId?: string; boxHeight?: number; boxWidth?: number }
const px = (mm: number): number => mmToPx(mm, 96)
const mm = (px: number): number => pxToMm(px, 96)
const { changeObjectHeight, changeObjectWidth, scaleCursorStyleHandler } = controlsUtils
/**
 * A textbox anchored to the box the document stores rather than to the height
 * of its own content. Fabric replaces `height` with the content height on every
 * re-layout and draws from the top of whatever `height` then holds, so the text
 * would re-centre itself the moment an edit begins; anchoring by `verticalAlign`
 * against the stored box is what makes the canvas agree with
 * `shared/render/svg.ts`.
 */
class LabelTextbox extends Textbox {
  declare boxHeight?: number
  declare verticalAlign?: VerticalAlign
  /**
   * The wrapped lines measured the way `shared/textFit.ts` measures them.
   * `calcTextHeight()` gives the last line no line-height multiplier and scales
   * the rest by Fabric's own font-size multiplier, which would anchor a block
   * of lines a little away from where print anchors it.
   */
  private contentHeight(): number {
    return this.textLines.length * this.fontSize * this.lineHeight
  }
  override initDimensions(): void {
    super.initDimensions()
    const box = this.boxHeight
    if (box === undefined) return
    if (!this.isEditing) {
      this.height = box
      return
    }
    // While editing, Fabric hit-tests and clears the cursor layer against
    // `height` centred on the object, so it has to reach the furthest line even
    // when that line sits outside the box.
    const top = this._getTopOffset()
    this.height = Math.max(box, 2 * Math.max(-top, top + this.contentHeight()))
  }
  override _getTopOffset(): number {
    return textTopOffset(
      this.verticalAlign ?? 'top',
      this.boxHeight ?? this.height,
      this.contentHeight()
    )
  }
}
/**
 * Resizes the box of a textbox rather than scaling its glyphs. Fabric reflows
 * the text on a width change and then replaces `height` with the content
 * height, so the box height is tracked separately and reasserted afterwards.
 */
function resizeBox(width: boolean, height: boolean): TransformActionHandler {
  return controlsUtils.wrapWithFireEvent(
    'resizing',
    controlsUtils.wrapWithFixedAnchor((event, transform, x, y) => {
      const target = transform.target as Item
      const resizedWidth = width && changeObjectWidth(event, transform, x, y)
      // Dragging an edge is the one gesture that moves the stored box: Fabric
      // widens `width` by itself whenever a word is wider than the box.
      if (width) target.boxWidth = target.width
      target.height = target.boxHeight ?? target.height
      const resizedHeight = height && changeObjectHeight(event, transform, x, y)
      target.boxHeight = target.height
      return resizedWidth || resizedHeight
    })
  )
}
const TEXT_BOX_CONTROLS: Record<string, Control> = controlsUtils.createObjectDefaultControls()
for (const [key, control] of Object.entries(TEXT_BOX_CONTROLS)) {
  if (key === 'mtr') continue
  control.actionName = 'resizing'
  // ml/mr/mt/mb carry their own `getActionName`, which keeps reporting
  // scaleX/scaleY (or skewX/skewY with Shift) whatever `actionName` says.
  // Removing it falls back to the prototype method, which returns `actionName`.
  delete (control as Partial<Control>).getActionName
  control.cursorStyleHandler = scaleCursorStyleHandler
  control.actionHandler = resizeBox(control.x !== 0, control.y !== 0)
}
export function bindDocumentCanvas(canvas: Canvas, host: HTMLElement): () => void {
  host.tabIndex = 0
  const focus = (): void => {
    if (!(
      canvas.getActiveObject() instanceof Textbox && (canvas.getActiveObject() as Textbox).isEditing
    ))
      host.focus({ preventScroll: true })
  }
  host.addEventListener('pointerdown', focus)
  let version = 0,
    stopped = false,
    syncing = false,
    updating = false
  let start: Point | null = null
  let editingId: string | null = null
  let editCommitted = false
  let guides: Line[] = []
  function clearGuides(): void {
    canvas.remove(...guides)
    guides = []
  }
  function showDimensions(target: FabricObject): void {
    // Resize handlers fire their event before Fabric refreshes the coordinates,
    // and a textbox caches them mid-gesture at its content height.
    target.setCoords()
    const box = target.getBoundingRect()
    useEditorStore
      .getState()
      .setInteractionLabel(
        `X ${mm(box.left).toFixed(3)}  Y ${mm(box.top).toFixed(3)}  W ${mm(box.width).toFixed(3)}  H ${mm(box.height).toFixed(3)} mm`
      )
  }
  function select(): void {
    if (syncing) return
    syncing = true
    canvas.discardActiveObject()
    const ids = useEditorStore.getState().selectedIds
    const items = canvas
      .getObjects()
      .filter((o) => ids.includes((o as Item).objectId ?? '') && o.visible && o.selectable)
    if (items.length === 1) canvas.setActiveObject(items[0]!)
    else if (items.length > 1) canvas.setActiveObject(new ActiveSelection(items, { canvas }))
    syncing = false
    canvas.requestRenderAll()
  }
  async function rebuild(): Promise<void> {
    // Fabric exits inline editing when the active object is discarded. Do that
    // before entering the internal-sync guard so its normal commit retains what
    // the user typed instead of treating it as teardown work.
    const active = canvas.getActiveObject()
    if (active instanceof Textbox && active.isEditing) active.exitEditing()
    const current = ++version,
      sourceDocument = useDocumentStore.getState().document,
      document = useUiStore.getState().showSampleData
        ? evaluatedDocument(sourceDocument, {
            sample: !useUiStore.getState().previewFields,
            fields: useUiStore.getState().previewFields ?? undefined
          }).document
        : sourceDocument
    // Barcodes always encode resolved data: an unresolved `{placeholder}` is
    // not valid input for any length-constrained symbology.
    const symbolSource =
      useUiStore.getState().showSampleData ||
      !document.template.design.objects.some((o) => o.kind === 'barcode' || o.kind === 'qrcode')
        ? document
        : evaluatedDocument(sourceDocument, { sample: true }).document
    const encoded = new Map(symbolSource.template.design.objects.map((o) => [o.id, o]))
    const selected = useEditorStore.getState().selectedIds
    const valid = selected.filter((id) => document.template.design.objects.some((o) => o.id === id))
    if (valid.length !== selected.length) useEditorStore.getState().setSelectedIds(valid)
    const items = await Promise.all(
      document.template.design.objects.map(async (o) => {
        let item: Item
        if (o.kind === 'text') {
          const fit = fitText(o, canvasTextMeasurer)
          const box = new LabelTextbox(fit.lines.join('\n'), {
            width: px(o.widthMm),
            fontSize: px(ptToMm(fit.fontSizePt)),
            fontFamily: o.fontFamily,
            fontWeight: o.fontWeight,
            fontStyle: o.fontStyle,
            textAlign: o.align,
            lineHeight: o.lineHeight,
            fill: o.color,
            splitByGrapheme: false,
            stroke: fit.overflow ? '#b10e1e' : fit.reachedMinimum ? '#b36b00' : undefined,
            strokeWidth: fit.overflow || fit.reachedMinimum ? 0.5 : 0
          })
          // Safe with resolved values on the canvas because `text:editing:entered`
          // reseeds the box with the source expression and `commitPatch` writes
          // `text` back only for the object inline editing produced it for.
          box.editable = true
          box.verticalAlign = o.verticalAlign
          box.controls = TEXT_BOX_CONTROLS
          item = box
        } else {
          try {
            const source = encoded.get(o.id) ?? o
            const symbolSvg =
              source.kind === 'barcode' || source.kind === 'qrcode'
                ? (await import('@shared/render/barcode')).barcodeSvg(source)
                : undefined
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(o.widthMm)}" height="${px(o.heightMm)}" viewBox="0 0 ${o.widthMm} ${o.heightMm}">${objectSvg({ ...o, xMm: 0, yMm: 0, rotation: 0 }, document, symbolSvg)}</svg>`
            const parsed = await loadSVGFromString(svg)
            item = util.groupSVGElements(
              parsed.objects.filter((v): v is FabricObject => v !== null),
              parsed.options
            )
            item.set({
              scaleX: px(o.widthMm) / Math.max(item.width, 0.01),
              scaleY: px(o.heightMm) / Math.max(item.height, 0.01)
            })
          } catch (e) {
            const symbol = o.kind === 'barcode' || o.kind === 'qrcode'
            const descriptor = o.kind === 'barcode' ? symbologyDescriptor(o.symbology) : undefined
            const lines = [
              `Cannot render this ${o.kind}`,
              encoderMessage(e instanceof Error ? e.message : String(e)),
              ...(descriptor ? [`${descriptor.label} data ${descriptor.rule}`] : [])
            ]
            const box = new LabelTextbox(lines.join('\n'), {
              width: px(o.widthMm),
              fontSize: 9,
              fill: symbol ? '#605e5c' : '#b10e1e',
              backgroundColor: symbol ? '#f3f2f1' : '#fff0f0'
            })
            box.editable = false
            box.verticalAlign = 'top'
            box.controls = TEXT_BOX_CONTROLS
            item = box
          }
        }
        if (item instanceof Textbox) {
          item.set({ height: px(o.heightMm) })
          ;(item as Item).boxHeight = px(o.heightMm)
          // Laying the text out may already have widened the box past this.
          ;(item as Item).boxWidth = px(o.widthMm)
        }
        ;(item as Item).objectId = o.id
        item.set({
          left: px(o.xMm + o.widthMm / 2),
          top: px(o.yMm + o.heightMm / 2),
          originX: 'center',
          originY: 'center',
          angle: o.rotation,
          selectable: !o.locked,
          evented: !o.locked,
          visible: o.visible,
          lockScalingFlip: true,
          cornerSize: 9,
          transparentCorners: false
        })
        item.setCoords()
        return item
      })
    )
    if (stopped || current !== version) {
      items.forEach((o) => o.dispose())
      return
    }
    syncing = true
    canvas.discardActiveObject()
    const old = canvas.getObjects().filter((o) => (o as Item).objectId)
    // `discardActiveObject` exits any inline edit, which clears this, but the
    // boxes it named are about to be destroyed either way: a surviving id would
    // let the next commit write a rendered string into the document.
    editingId = null
    canvas.remove(...old)
    old.forEach((o) => o.dispose())
    canvas.add(...items)
    syncing = false
    select()
  }
  function pushSelection(): void {
    if (syncing) return
    let ids = canvas
      .getActiveObjects()
      .map((o) => (o as Item).objectId)
      .filter((id): id is string => !!id)
    const objects = useDocumentStore.getState().document.template.design.objects
    const groups = objects
      .filter((o) => ids.includes(o.id))
      .map((o) => o.groupId)
      .filter(Boolean)
    ids = [
      ...new Set([
        ...ids,
        ...objects
          .filter((o) => o.groupId && groups.includes(o.groupId) && !o.locked && o.visible)
          .map((o) => o.id)
      ])
    ]
    useEditorStore.getState().setSelectedIds(ids)
  }
  function commit(): void {
    if (syncing) return
    const objects = useDocumentStore.getState().document.template.design.objects
    const changes = new Map<string, Partial<LabelObject>>()
    for (const item of canvas.getActiveObjects() as Item[]) {
      if (!item.objectId) continue
      const source = objects.find((o) => o.id === item.objectId)
      if (!source) continue
      const center = item.getCenterPoint(),
        matrix = util.qrDecompose(item.calcTransformMatrix()),
        // Only text that was actually typed grows its box: entering and leaving
        // an inline edit must leave a box the user deliberately shrank alone.
        // The reseed on `text:editing:entered` makes `item.text` the source
        // expression, so any difference here is an edit.
        typedHeightMm =
          source.kind === 'text' &&
          item.objectId === editingId &&
          item instanceof Textbox &&
          item.text !== source.text
            ? fitText({ ...source, text: item.text }, canvasTextMeasurer).heightMm
            : undefined
      changes.set(
        item.objectId,
        commitPatch(
          {
            objectId: item.objectId,
            kind: source.kind,
            geometry: {
              centerXMm: mm(center.x),
              centerYMm: mm(center.y),
              widthMm: mm(item.width * Math.abs(matrix.scaleX)),
              heightMm: mm((item.boxHeight ?? item.height) * Math.abs(matrix.scaleY)),
              rotation: matrix.angle
            },
            boxWidthMm:
              item.boxWidth === undefined ? undefined : mm(item.boxWidth * Math.abs(matrix.scaleX)),
            canvasText: item instanceof Textbox ? item.text : undefined,
            contentHeightMm: typedHeightMm
          },
          editingId
        )
      )
    }
    updating = true
    useDocumentStore.getState().change((d) => ({
      ...d,
      template: {
        ...d.template,
        design: {
          ...d.template.design,
          objects: d.template.design.objects.map((o) =>
            changes.has(o.id) ? ({ ...o, ...changes.get(o.id) } as LabelObject) : o
          )
        }
      }
    }))
    updating = false
    clearGuides()
    void rebuild()
  }
  const off = [
    canvas.on('before:transform', ({ transform }) => {
      canvas.uniformScaling =
        useDocumentStore
          .getState()
          .document.template.design.objects.find(
            (o) => o.id === (transform.target as Item).objectId
          )?.kind === 'image'
    }),
    canvas.on('selection:created', pushSelection),
    canvas.on('selection:updated', pushSelection),
    canvas.on('selection:cleared', pushSelection),
    canvas.on('object:modified', () => {
      // Leaving inline editing fires this on top of `text:editing:exited`,
      // which has already committed the same gesture.
      if (editCommitted) return
      commit()
      useEditorStore.getState().setInteractionLabel(null)
    }),
    canvas.on('object:scaling', (event) => showDimensions(event.target)),
    canvas.on('object:resizing', (event) => showDimensions(event.target)),
    canvas.on('object:rotating', (event) => showDimensions(event.target)),
    canvas.on('text:editing:entered', ({ target }) => {
      const item = target as Textbox & Item
      editingId = item.objectId ?? null
      const source = useDocumentStore
        .getState()
        .document.template.design.objects.find((o) => o.id === editingId)
      if (source?.kind === 'text' && source.text !== item.text) {
        const caret = Math.min(item.selectionStart, source.text.length)
        item.set({ text: source.text })
        item.selectionStart = item.selectionEnd = caret
        if (item.hiddenTextarea) {
          item.hiddenTextarea.value = source.text
          item.hiddenTextarea.selectionStart = item.hiddenTextarea.selectionEnd = caret
        }
        // Fabric captured the rendered string before this handler ran, so
        // without this the reseed alone looks like an edit and `exitEditing`
        // fires `object:modified` on top of `text:editing:exited`.
        ;(item as unknown as { _textBeforeEdit: string })._textBeforeEdit = source.text
      }
      useDocumentStore.getState().beginGesture()
    }),
    canvas.on('text:selection:changed', ({ target }) => {
      const text = target as Textbox & Item
      if (text.objectId && text.selectionStart !== text.selectionEnd)
        useEditorStore.getState().setTextSelection({
          objectId: text.objectId,
          start: text.selectionStart,
          end: text.selectionEnd
        })
      else useEditorStore.getState().setTextSelection(null)
    }),
    canvas.on('text:editing:exited', () => {
      commit()
      editingId = null
      useDocumentStore.getState().endGesture()
      // `exitEditing` fires `object:modified` straight after this event when the
      // text changed, outside the gesture just ended and against the stale box.
      editCommitted = true
      queueMicrotask(() => {
        editCommitted = false
      })
    }),
    canvas.on('object:moving', (e) => {
      clearGuides()
      if ('ctrlKey' in e.e && e.e.ctrlKey) return
      const ui = useUiStore.getState()
      const snapOptions = ui.preferences.snap
      if (
        !ui.snapToGrid &&
        !snapOptions.guides &&
        !snapOptions.label &&
        !snapOptions.objects &&
        !snapOptions.printerDots
      )
        return
      const target = e.target,
        b = target.getBoundingRect(),
        ids = useEditorStore.getState().selectedIds,
        d = useDocumentStore.getState().document.template
      const result = snap(
        { x: mm(b.left), y: mm(b.top), width: mm(b.width), height: mm(b.height) },
        d.stock,
        d.design.objects.filter((o) => !ids.includes(o.id)),
        ui.gridSizeMm,
        0.8 / canvas.getZoom(),
        {
          grid: ui.snapToGrid,
          guides: d.design.guides,
          label: snapOptions.label,
          objects: snapOptions.objects,
          printerDots: snapOptions.printerDots
        }
      )
      target.set({
        left: target.left + px(result.x) - b.left,
        top: target.top + px(result.y) - b.top
      })
      guides = result.guides.map(
        (g) =>
          new Line(
            g.axis === 'x'
              ? [px(g.position), 0, px(g.position), px(d.stock.heightMm)]
              : [0, px(g.position), px(d.stock.widthMm), px(g.position)],
            {
              stroke: '#0078d4',
              strokeWidth: 1 / canvas.getZoom(),
              selectable: false,
              evented: false
            }
          )
      )
      canvas.add(...guides)
      showDimensions(target)
    }),
    canvas.on('mouse:over', (event) => {
      const objects = useDocumentStore.getState().document.template.design.objects
      const hoveredId =
        event.target && 'objectId' in event.target ? (event.target as Item).objectId : undefined
      const hovered = objects.find((object) => object.id === hoveredId)
      if (!('altKey' in event.e) || !event.e.altKey) {
        // Resolved values hide which variables an object carries, so hovering
        // reveals the expression behind them.
        const segments = templateSegments(hovered ? (objectExpression(hovered) ?? '') : '')
        if (segments.some((segment) => segment.variable))
          useEditorStore.getState().setInteractionLabel(segments)
        return
      }
      const ids = useEditorStore.getState().selectedIds
      const selected = objects.filter((object) => ids.includes(object.id))
      if (!selected.length) return
      const from = objectBounds(selected)
      const to = hovered
        ? objectBounds([hovered])
        : {
            x: 0,
            y: 0,
            width: useDocumentStore.getState().labelSize.widthMm,
            height: useDocumentStore.getState().labelSize.heightMm
          }
      const dx = Math.max(0, Math.max(to.x - from.x - from.width, from.x - to.x - to.width))
      const dy = Math.max(0, Math.max(to.y - from.y - from.height, from.y - to.y - to.height))
      useEditorStore
        .getState()
        .setInteractionLabel(`Distance  X ${dx.toFixed(3)}  Y ${dy.toFixed(3)} mm`)
    }),
    canvas.on('mouse:out', () => useEditorStore.getState().setInteractionLabel(null)),
    canvas.on('mouse:down', (e) => {
      if ('button' in e.e && e.e.button === 2 && e.target && 'objectId' in e.target) {
        canvas.setActiveObject(e.target)
        pushSelection()
        canvas.requestRenderAll()
        return
      }
      const tool = useEditorStore.getState().activeTool
      if (tool === 'select' || tool === 'pen' || ('button' in e.e && e.e.button !== 0)) return
      const p = canvas.getScenePoint(e.e),
        s = useDocumentStore.getState().labelSize
      if (p.x < 0 || p.y < 0 || mm(p.x) > s.widthMm || mm(p.y) > s.heightMm) return
      start = p
    }),
    canvas.on('mouse:up', (e) => {
      if (!start) return
      const from = start
      start = null
      const tool = useEditorStore.getState().activeTool
      if (tool === 'select' || tool === 'pen') return
      if (tool === 'image') {
        void importImage(mm(from.x), mm(from.y))
        return
      }
      const end = canvas.getScenePoint(e.e),
        o = createObject(tool, mm(Math.min(from.x, end.x)), mm(Math.min(from.y, end.y)))
      if (Math.abs(end.x - from.x) > 3 || Math.abs(end.y - from.y) > 3) {
        o.widthMm = Math.max(0.1, mm(Math.abs(end.x - from.x)))
        o.heightMm = Math.max(0.1, mm(Math.abs(end.y - from.y)))
      }
      const options = useToolOptionsStore.getState().options
      if (o.kind === 'text') {
        o.fontFamily = options.font
        o.fontSizePt = options.size
        o.fontWeight = options.bold ? 'bold' : 'normal'
        o.fontStyle = options.italic ? 'italic' : 'normal'
        o.color = options.color
        o.align = options.alignment.toLowerCase() as 'left' | 'center' | 'right'
      }
      if (o.kind === 'rect' || o.kind === 'ellipse') {
        o.strokeWidthMm = options.strokeWidth
        o.fill = options.fill === '#000000' ? '#000000' : null
      }
      if (o.kind === 'line') o.strokeWidthMm = options.strokeWidth
      if (o.kind === 'text') useDocumentStore.getState().beginGesture()
      useDocumentStore.getState().addObjects([o])
      if (o.kind === 'text') {
        const font = useFontStore
          .getState()
          .catalog.families.find((family) => family.family === o.fontFamily)
        if (font) applyFontFamily(font, [o.id])
        useDocumentStore.getState().endGesture()
      }
      useEditorStore.getState().setActiveTool('select')
      useEditorStore.getState().setSelectedIds([o.id])
    })
  ]
  const unsubD = useDocumentStore.subscribe((s, p) => {
    if (s.document !== p.document && !updating) void rebuild()
  })
  const unsubE = useEditorStore.subscribe((s, p) => {
    if (s.selectedIds !== p.selectedIds) select()
    if (s.activeTool !== p.activeTool) {
      canvas.selection = s.activeTool === 'select'
      canvas.skipTargetFind = s.activeTool !== 'select'
      canvas.defaultCursor = s.activeTool === 'select' ? 'default' : 'crosshair'
    }
  })
  const unsubUi = useUiStore.subscribe((state, previous) => {
    if (
      state.showSampleData !== previous.showSampleData ||
      state.previewFields !== previous.previewFields
    )
      void rebuild()
  })
  const unsubFonts = useFontStore.subscribe((state, previous) => {
    if (state.catalog !== previous.catalog) void rebuild()
  })
  const key = (e: KeyboardEvent): void => {
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('input,textarea,select,[contenteditable=true],[role=dialog]') ||
        document.querySelector('[role=dialog],[role=menu]'))
    )
      return
    if (!e.key.startsWith('Arrow') || !useEditorStore.getState().selectedIds.length) return
    e.preventDefault()
    const preferences = useUiStore.getState().preferences
    const baseStep = e.shiftKey ? preferences.nudgeLargeMm : preferences.nudgeSmallMm
    const step = e.altKey ? baseStep * 0.1 : baseStep
    useDocumentStore.getState().beginGesture()
    nudge(
      e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
      e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    )
  }
  const keyup = (e: KeyboardEvent): void => {
    if (e.key.startsWith('Arrow')) useDocumentStore.getState().endGesture()
  }
  const drag = (e: DragEvent): void => {
    e.preventDefault()
  }
  const drop = (e: DragEvent): void => {
    e.preventDefault()
    const variableName = e.dataTransfer?.getData('application/x-barista-variable')
    if (variableName) {
      if (
        !useDocumentStore
          .getState()
          .document.template.variables.some((variable) => variable.name === variableName)
      )
        return
      const point = canvas.getScenePoint(e)
      const item = [...canvas.getObjects()]
        .reverse()
        .find((candidate) => (candidate as Item).objectId && candidate.containsPoint(point)) as
        Item | undefined
      const objectId = item?.objectId
      const object = useDocumentStore
        .getState()
        .document.template.design.objects.find((candidate) => candidate.id === objectId)
      if (
        object &&
        !object.locked &&
        (object.kind === 'text' || object.kind === 'barcode' || object.kind === 'qrcode')
      ) {
        const bound = bindVariable(object, variableName)
        useDocumentStore
          .getState()
          .updateObjects(
            [object.id],
            bound.kind === 'text'
              ? { text: bound.text }
              : bound.kind === 'barcode' || bound.kind === 'qrcode'
                ? { data: bound.data }
                : {}
          )
        useEditorStore.getState().setSelectedIds([object.id])
        return
      }
      const text = createObject('text', mm(point.x), mm(point.y))
      if (text.kind !== 'text') return
      text.name = variableName
      text.text = `{${variableName}}`
      useDocumentStore.getState().beginGesture()
      useDocumentStore.getState().addObjects([text])
      const font = useFontStore
        .getState()
        .catalog.families.find((family) => family.family === text.fontFamily)
      if (font) applyFontFamily(font, [text.id])
      useDocumentStore.getState().endGesture()
      useEditorStore.getState().setSelectedIds([text.id])
      return
    }
    const file = e.dataTransfer?.files[0]
    if (!file) return
    const p = canvas.getScenePoint(e)
    void importImage(mm(p.x), mm(p.y), file)
  }
  host.addEventListener('dragover', drag)
  host.addEventListener('drop', drop)
  window.addEventListener('keydown', key)
  window.addEventListener('keyup', keyup)
  void rebuild()
  return () => {
    host.removeEventListener('pointerdown', focus)
    stopped = true
    version++
    off.forEach((f) => f())
    unsubD()
    unsubE()
    unsubUi()
    unsubFonts()
    clearGuides()
    host.removeEventListener('dragover', drag)
    host.removeEventListener('drop', drop)
    window.removeEventListener('keydown', key)
    window.removeEventListener('keyup', keyup)
  }
}

/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelDocument, LabelObject, LabelStock } from '../template/types'
import { ptToMm } from '../units'
import { DEFAULT_PRINT_SETTINGS, printLayout, type PrintSettings } from '../printSettings'
import { evaluatedDocument, type EvaluationContext } from '../variables'
import { fitText, verticalOffset } from '../textFit'
export const xml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
  )
export function stockShapeSvg(stock: LabelStock, attributes = ''): string {
  if (stock.shape === 'circle' || stock.shape === 'ellipse')
    return `<ellipse cx="${stock.widthMm / 2}" cy="${stock.heightMm / 2}" rx="${stock.widthMm / 2}" ry="${stock.heightMm / 2}" ${attributes}/>`
  const radius = stock.shape === 'rounded' ? stock.cornerRadiusMm : 0
  return `<rect width="${stock.widthMm}" height="${stock.heightMm}" rx="${radius}" ry="${radius}" ${attributes}/>`
}
export function objectSvg(o: LabelObject, document: LabelDocument, symbolSvg?: string): string {
  const w = o.widthMm,
    h = o.heightMm
  let content = ''
  switch (o.kind) {
    case 'rect':
      content = `<rect width="${w}" height="${h}" rx="${o.cornerRadiusMm}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'none'}" stroke-width="${o.strokeWidthMm}"/>`
      break
    case 'ellipse':
      content = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'none'}" stroke-width="${o.strokeWidthMm}"/>`
      break
    case 'line':
      content = `<line x2="${w}" y2="${h}" stroke="${o.stroke}" stroke-width="${o.strokeWidthMm}" stroke-dasharray="${o.dashMm.join(' ')}"/>`
      break
    case 'path':
      content = `<path d="${xml(o.d)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'none'}" stroke-width="${o.strokeWidthMm}"/>`
      break
    case 'text': {
      // The wrapping modes carry the box and the source text so the print
      // window can re-wrap them against the real font metrics; the fitted
      // lines below are the approximation's best guess at the same breaks.
      const fit = fitText(o)
      const x = o.align === 'center' ? w / 2 : o.align === 'right' ? w : 0
      const lineMm = ptToMm(fit.fontSizePt) * o.lineHeight
      const top = verticalOffset(o.verticalAlign, h, fit.heightMm)
      content = `<text data-fit="${o.fitMode}" data-overflow="${fit.overflow}" data-width="${w}" data-height="${h}" data-valign="${o.verticalAlign}" data-line-height="${o.lineHeight}" data-min-font-size="${ptToMm(o.minFontSizePt)}" data-max-lines="${o.maxLines}" data-text="${xml(o.text)}" xml:space="preserve" font-family="${xml(o.fontFamily)}" font-size="${ptToMm(fit.fontSizePt)}" font-weight="${o.fontWeight}" font-style="${o.fontStyle}" fill="${o.color}" text-anchor="${o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start'}">${fit.lines
        .map(
          (line, i) =>
            `<tspan x="${x}" y="${top + ptToMm(fit.fontSizePt) * 0.82 + i * lineMm}">${xml(line)}</tspan>`
        )
        .join('')}</text>`
      break
    }
    case 'image': {
      const a = document.template.assets.find((a) => a.id === o.assetId)
      if (!a || !document.assetData[a.id]) throw new Error(`Missing image: ${o.name}`)
      content = `<image width="${w}" height="${h}" data-monochrome="${o.monochrome.enabled}" data-threshold="${o.monochrome.threshold}" data-invert="${o.monochrome.invert}" opacity="${o.opacity}" preserveAspectRatio="${o.fit === 'stretch' ? 'none' : o.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}" href="data:${a.mimeType};base64,${document.assetData[a.id]}"/>`
      break
    }
    case 'barcode':
    case 'qrcode': {
      if (!symbolSvg) throw new Error(`Barcode data has not been rendered: ${o.name}`)
      content = symbolSvg.replace(
        '<svg ',
        `<svg width="${w}" height="${h}" preserveAspectRatio="none" `
      )
      break
    }
  }
  return `<g transform="translate(${o.xMm} ${o.yMm}) rotate(${o.rotation} ${w / 2} ${h / 2})">${content}</g>`
}
export function pageSvg(
  document: LabelDocument,
  settings: PrintSettings = DEFAULT_PRINT_SETTINGS,
  context: EvaluationContext = {},
  symbols: Readonly<Record<string, string>> = {}
): string {
  const evaluated = evaluatedDocument(document, context)
  if (evaluated.errors.length) throw new Error(evaluated.errors.join('\n'))
  const resolved = evaluated.document,
    p = printLayout(resolved.template.stock, settings),
    s = resolved.template.stock
  const content = resolved.template.design.objects
    .filter((o) => o.visible)
    .map((o) => objectSvg(o, resolved, symbols[o.id]))
    .join('')
  const label = `${stockShapeSvg(s, `fill="${xml(s.backgroundColor)}"`)}${content}`
  let labels = `<g clip-path="url(#label)">${label}</g>`
  if (s.feed.kind === 'sheet' && settings.chooseLabelPaper) {
    const feed = s.feed
    const usedWidth = (feed.columns - 1) * feed.pitchXMm + s.widthMm
    const usedHeight = (feed.rows - 1) * feed.pitchYMm + s.heightMm
    const startX = (feed.sheetWidthMm - usedWidth) / 2
    const startY = (feed.sheetHeightMm - usedHeight) / 2
    labels = Array.from({ length: feed.rows }, (_, row) =>
      Array.from(
        { length: feed.columns },
        (_, column) =>
          `<g transform="translate(${startX + column * feed.pitchXMm} ${startY + row * feed.pitchYMm})" clip-path="url(#label)">${label}</g>`
      ).join('')
    ).join('')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}mm" height="${p.height}mm" viewBox="0 0 ${p.width} ${p.height}"><defs><clipPath id="label">${stockShapeSvg(s)}</clipPath></defs><rect width="100%" height="100%" fill="white"/><g transform="translate(${p.x} ${p.y}) scale(${p.scale})">${labels}</g></svg>`
}

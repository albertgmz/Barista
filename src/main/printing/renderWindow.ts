/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { userDataPaths } from '../storage/paths'
import { BrowserWindow } from 'electron'
import type { LabelDocument } from '@shared/template/types'
import { xml } from '@shared/render/svg'
import { renderSvgInUtility, disposeRenderWorker } from './svgWorker'
import { DEFAULT_PRINT_SETTINGS, printLayout, type PrintSettings } from '@shared/printSettings'
import { documentSchema } from '@shared/template/schema'
import type { EvaluationContext } from '@shared/variables'
import { mmToPx, mmToPt, MM_PER_INCH } from '@shared/units'
import { fontFaceCss } from '@main/fonts'
let window: BrowserWindow | null = null
let tail: Promise<unknown> = Promise.resolve()
export function withPrintWindow<T>(
  document: LabelDocument,
  settings: PrintSettings,
  run: (win: BrowserWindow, svg: string) => Promise<T>,
  context: EvaluationContext = {}
): Promise<T> {
  const work = async (): Promise<T> => {
    documentSchema.parse(document)
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false
        }
      })
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    }
    const win = window,
      p = printLayout(document.template.stock, settings)
    let svg = await renderSvgInUtility(document, settings, context)
    const fonts = await fontFaceCss(document)
    const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>${xml(document.template.metadata.title)}</title><style>${fonts}@page{size:${p.width}mm ${p.height}mm;margin:0}html,body{margin:0;padding:0;background:white;width:${p.width}mm;height:${p.height}mm;overflow:hidden}svg{display:block}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${svg}</body></html>`
    win.webContents.setZoomFactor(1)
    win.setContentSize(
      Math.max(1, Math.ceil(mmToPx(p.width, 96))),
      Math.max(1, Math.ceil(mmToPx(p.height, 96)))
    )
    const directory = join(userDataPaths().root, 'render')
    await mkdir(directory, { recursive: true })
    const path = join(directory, 'print.html')
    await writeFile(path, html)
    await win.loadFile(path)
    await win.webContents.executeJavaScript(
      'document.fonts.ready.then(() => Promise.all(Array.from(document.images).map(i => i.decode())))'
    )
    // The SVG arrives wrapped by the approximation in `shared/textFit.ts`, which
    // cannot measure a font. This window can, so the wrapping modes are re-wrapped
    // here against the same `measureText` the editor's canvas measurer uses. The
    // shrink and fit-width modes also repeat their fitting step after re-wrapping,
    // so real print metrics cannot leave a label at the editor's approximate size.
    // SVG images are decoded explicitly; threshold only images so text/shapes stay vector.
    svg = await win.webContents.executeJavaScript(`(async()=>{
     const context=document.createElement('canvas').getContext('2d');
     for(const text of document.querySelectorAll('text[data-fit=wrap],text[data-fit=shrink],text[data-fit=fit-width]')) {
      const factor=${mmToPx(1, 96)},width=Number(text.getAttribute('data-width'))*factor,fit=text.getAttribute('data-fit');
      const lineHeight=Number(text.getAttribute('data-line-height')),height=Number(text.getAttribute('data-height'));
      const layout=(fontSize)=>{
       context.font=text.getAttribute('font-style')+' '+text.getAttribute('font-weight')+' '+(fontSize*factor)+'px '+JSON.stringify(text.getAttribute('font-family'));
       const lines=[],fits=(value)=>context.measureText(value).width<=width,wrap=fit==='wrap'||fit==='shrink';
       for(const paragraph of text.getAttribute('data-text').split(String.fromCharCode(10))) {
        if(!wrap){lines.push(paragraph);continue} let line='';
        for(const word of paragraph.split(/(\\s+)/)) {
         if(!word)continue;
         if(!line.trim()||fits(line+word)){line+=word;continue}
         lines.push(line.trimEnd());line=word.trimStart();if(fits(line))continue;
         let segment='';for(const character of line){if(segment&&!fits(segment+character)){lines.push(segment);segment=character}else segment+=character}line=segment;
        } lines.push(line.trimEnd());
       }
       return { lines, width: Math.max(0,...lines.map((line)=>context.measureText(line).width)) };
      };
      let fontSize=Number(text.getAttribute('font-size')),result=layout(fontSize),minimum=Math.min(fontSize,Number(text.getAttribute('data-min-font-size')));
      if(fit==='fit-width'&&result.width>width){fontSize=Math.max(minimum,fontSize*width/result.width);result=layout(fontSize)}
      if(fit==='shrink')while(fontSize>minimum&&(result.width>width||result.lines.length*fontSize*lineHeight>height||result.lines.length>Number(text.getAttribute('data-max-lines')))){fontSize=Math.max(minimum,Math.round((fontSize-${(0.25 * 25.4) / 72})*100)/100);result=layout(fontSize)}
      text.setAttribute('font-size',String(fontSize));const lines=result.lines;
      const x=text.querySelector('tspan').getAttribute('x'),lineMm=fontSize*lineHeight,slack=height-lines.length*lineMm;
      const valign=text.getAttribute('data-valign'),top=valign==='middle'?slack/2:valign==='bottom'?slack:0;
      text.replaceChildren(...lines.map((line,index)=>{const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');span.setAttribute('x',x);span.setAttribute('y',String(top+fontSize*.82+index*lineMm));span.textContent=line;return span}));
     }

   for(const item of document.querySelectorAll('image')) {
    const source=new Image();source.src=item.getAttribute('href');await source.decode();
    {
     const monochrome=${settings.monochrome}||item.getAttribute('data-monochrome')==='true';
     const threshold=Number(item.getAttribute('data-threshold')||128);const invert=item.getAttribute('data-invert')==='true';
     const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(Number(item.getAttribute('width'))*${document.template.stock.dpi / MM_PER_INCH}));c.height=Math.max(1,Math.ceil(c.width*source.naturalHeight/source.naturalWidth));
     if(c.width*c.height>40000000)throw new Error('Image is too large to rasterize.');
     const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);
     if(monochrome){const pixels=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<pixels.data.length;i+=4){const v=pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722>=threshold?255:0;const out=invert?255-v:v;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=out;pixels.data[i+3]=255}ctx.putImageData(pixels,0,0)}item.setAttribute('href',c.toDataURL());
    }
   }

   return document.querySelector('svg').outerHTML;
  })()`)
    return run(win, svg)
  }
  const result = tail.then(work, work)
  tail = result.catch(() => undefined)
  return result
}
export async function renderPdf(
  document: LabelDocument,
  settings = DEFAULT_PRINT_SETTINGS,
  context: EvaluationContext = {}
): Promise<Uint8Array> {
  return withPrintWindow(
    document,
    settings,
    async (win) => {
      const { PDFDocument } = await import('pdf-lib')
      const p = printLayout(document.template.stock, settings)
      const bytes = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        pageSize: { width: p.width / MM_PER_INCH, height: p.height / MM_PER_INCH },
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })
      const pdf = await PDFDocument.load(bytes)
      // Chromium quantizes custom stock to device units; keep PDF physical media exact.
      for (const page of pdf.getPages()) {
        page.setSize(mmToPt(p.width), mmToPt(p.height))
        page.setCropBox(0, 0, mmToPt(p.width), mmToPt(p.height))
      }
      return pdf.save()
    },
    context
  )
}
export async function renderPng(
  document: LabelDocument,
  context: EvaluationContext = {}
): Promise<Uint8Array> {
  const stock = document.template.stock
  const previewSettings: PrintSettings = {
    ...DEFAULT_PRINT_SETTINGS,
    chooseLabelPaper: false,
    paperWidthMm: stock.widthMm,
    paperHeightMm: stock.heightMm
  }
  return withPrintWindow(
    document,
    previewSettings,
    async (win, svg) => {
      const s = document.template.stock,
        w = Math.ceil(mmToPx(s.widthMm, s.dpi)),
        h = Math.ceil(mmToPx(s.heightMm, s.dpi))
      if (w * h > 40_000_000 || w > 16000 || h > 16000)
        throw new Error('Label is too large for PNG export at this DPI.')
      const dataUrl: string = await win.webContents.executeJavaScript(`(async()=>{
      const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(${JSON.stringify(svg)});await image.decode();
      const canvas=document.createElement('canvas');canvas.width=${w};canvas.height=${h};
      const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/png');
    })()`)
      return Buffer.from(dataUrl.split(',')[1]!, 'base64')
    },
    context
  )
}

/** Rasterize the complete configured page at the printer's real horizontal and vertical DPI. */
export async function renderPagePng(
  document: LabelDocument,
  settings: PrintSettings,
  dpiX: number,
  dpiY: number,
  context: EvaluationContext = {}
): Promise<Uint8Array> {
  const page = printLayout(document.template.stock, settings),
    width = Math.ceil(mmToPx(page.width, dpiX)),
    height = Math.ceil(mmToPx(page.height, dpiY))
  if (width * height > 40_000_000 || width > 16000 || height > 16000)
    throw new Error('The native print bitmap is too large to rasterize safely.')
  return withPrintWindow(
    document,
    settings,
    async (win, svg) => {
      const dataUrl: string = await win.webContents.executeJavaScript(`(async()=>{
      const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(${JSON.stringify(svg)});await image.decode();
      const canvas=document.createElement('canvas');canvas.width=${width};canvas.height=${height};
      const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/png');
    })()`)
      return Buffer.from(dataUrl.split(',')[1]!, 'base64')
    },
    context
  )
}
export function disposePrintWindow(): void {
  window?.destroy()
  window = null
  disposeRenderWorker()
}

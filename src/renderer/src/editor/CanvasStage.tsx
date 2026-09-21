/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { Fragment } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { useDocumentStore, useEditorStore, useUiStore } from '@renderer/store'
import { RULER_SIZE, Rulers } from './Rulers'
import { useFabricCanvas } from './useFabricCanvas'
import { variableTint } from './variableColor'
import { newId } from '@shared/template/document'
import { roundMm } from '@shared/units'

const useStyles = makeStyles({
  root: {
    display: 'grid',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground3
  },
  withRulers: {
    gridTemplateColumns: `${RULER_SIZE}px 1fr`,
    gridTemplateRows: `${RULER_SIZE}px 1fr`
  },
  withoutRulers: {
    gridTemplateColumns: '1fr',
    gridTemplateRows: '1fr'
  },
  host: {
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
    // Fabric sizes its wrapper to the canvas, so the host must never grow with it.
    overflow: 'hidden'
  },
  measurement: {
    position: 'absolute',
    zIndex: 4,
    left: '50%',
    bottom: '12px',
    transform: 'translateX(-50%)',
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusSmall,
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorBrandBackground,
    fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none'
  },
  // A revealed expression carries variable chips, which own their colours, so
  // it reads on a neutral card rather than on the brand fill measurements use.
  expression: {
    maxWidth: '90%',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    whiteSpace: 'pre-wrap'
  }
})

/** The design surface: millimetre rulers around the Fabric label canvas. */
export function CanvasStage(): React.JSX.Element {
  const styles = useStyles()
  const showRulers = useUiStore((state) => state.showRulers)
  const { hostRef, canvasRef, viewport } = useFabricCanvas()
  const interactionLabel = useEditorStore((state) => state.interactionLabel)
  const addGuide = (axis: 'x' | 'y', positionMm: number): void => {
    useDocumentStore.getState().change((document) => ({
      ...document,
      template: {
        ...document.template,
        design: {
          ...document.template.design,
          guides: [
            ...document.template.design.guides,
            { id: newId(), axis, positionMm: roundMm(positionMm), locked: false }
          ]
        }
      }
    }))
  }

  return (
    <div
      className={mergeClasses(styles.root, showRulers ? styles.withRulers : styles.withoutRulers)}
    >
      {showRulers ? <Rulers viewport={viewport} onGuide={addGuide} /> : null}
      <div
        ref={hostRef}
        className={styles.host}
        data-canvas-width={viewport.width}
        data-canvas-height={viewport.height}
        data-label-origin-x={viewport.originX}
        data-label-origin-y={viewport.originY}
        data-pixels-per-mm={viewport.pxPerMm}
      >
        <canvas ref={canvasRef} />
        {interactionLabel && (
          <output
            className={mergeClasses(
              styles.measurement,
              typeof interactionLabel === 'string' ? undefined : styles.expression
            )}
          >
            {typeof interactionLabel === 'string'
              ? interactionLabel
              : interactionLabel.map((segment, index) =>
                  segment.variable === null ? (
                    <Fragment key={index}>{segment.text}</Fragment>
                  ) : (
                    <span
                      key={index}
                      className="variable-chip"
                      style={variableTint(segment.variable)}
                    >
                      {segment.text}
                    </span>
                  )
                )}
          </output>
        )}
      </div>
    </div>
  )
}

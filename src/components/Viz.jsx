import React, { useEffect, useRef } from 'react'
import { VIZ_REGISTRY } from '../viz/index.js'

export default function Viz({ name, caption }) {
  const stageRef = useRef(null)
  const controlsRef = useRef(null)

  useEffect(() => {
    const factory = VIZ_REGISTRY[name]
    if (!factory || !stageRef.current) return
    controlsRef.current.innerHTML = ''
    const dispose = factory(stageRef.current, controlsRef.current)
    return dispose
  }, [name])

  if (!VIZ_REGISTRY[name]) {
    return <div className="viz-wrap"><div className="viz-caption">Unknown visualization: {name}</div></div>
  }

  return (
    <div className="viz-wrap">
      <div ref={stageRef} className="viz-canvas" style={{ position: 'relative' }} />
      <div ref={controlsRef} className="viz-controls" />
      {caption && <div className="viz-caption">{caption} — drag to rotate, scroll to zoom.</div>}
    </div>
  )
}

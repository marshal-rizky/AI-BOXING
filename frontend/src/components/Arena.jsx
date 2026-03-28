import { useEffect, useRef } from 'react'
import * as Renderer from '../lib/renderer.js'
import { whoosh, dodgeSound, crowdReact, hitImpact, whiffSound, clinchSound, restSound } from '../lib/audio.js'

export function Arena({
  round,
  distBefore,
  distAfter,
  reducedMotion,
  highlightMode,
  lowHealth,
  onAnimComplete,
  onPhaseChange,
  onImpact,
}) {
  const canvasRef = useRef(null)
  const roundKeyRef = useRef(null)
  const readyRef = useRef(false)

  useEffect(() => {
    if (!canvasRef.current) return

    Renderer.init(canvasRef.current, handleImpactAudio)
    readyRef.current = true

    return () => Renderer.destroy()
  }, [])

  useEffect(() => {
    if (!readyRef.current) return

    Renderer.setSceneOptions({
      reducedMotion,
      lowHealth,
      highlightMode,
    })
  }, [reducedMotion, lowHealth, highlightMode])

  useEffect(() => {
    if (!readyRef.current) return

    if (!round) {
      roundKeyRef.current = null
      Renderer.drawIdle()
      onPhaseChange?.('idle')
      return
    }

    const roundKey = `${round.round_number}-${round.fighter1.move_executed}-${round.fighter2.move_executed}-${round.fighter1.hp_after}-${round.fighter2.hp_after}`
    if (roundKeyRef.current === roundKey) return
    roundKeyRef.current = roundKey

    const profile = Renderer.getRoundProfile({
      move1: round.fighter1.move_executed,
      move2: round.fighter2.move_executed,
      dmgToF1: round.fighter1.damage_taken ?? 0,
      dmgToF2: round.fighter2.damage_taken ?? 0,
      reducedMotion,
      highlightMode,
    })

    Renderer.animateRound(
      round.fighter1.move_executed,
      round.fighter2.move_executed,
      round.fighter1.damage_taken ?? 0,
      round.fighter2.damage_taken ?? 0,
      distBefore ?? 1,
      distAfter ?? 1,
      {
        reducedMotion,
        highlightMode,
        profile,
        onPhaseChange(phase) {
          if (phase === 'strike') {
            playMoveSound(round.fighter1.move_executed, round.fighter2.damage_taken ?? 0)
            playMoveSound(round.fighter2.move_executed, round.fighter1.damage_taken ?? 0)
          }
          onPhaseChange?.(phase)
        },
        onImpact(payload) {
          onImpact?.(payload)
        },
        onComplete(meta) {
          onAnimComplete?.(meta)
        },
      }
    )
  }, [round, distBefore, distAfter, reducedMotion, highlightMode, onAnimComplete, onImpact, onPhaseChange])

  return (
    <div id="arena">
      <canvas ref={canvasRef} id="ring" />
    </div>
  )
}

function handleImpactAudio(payload) {
  hitImpact(payload.maxDamage, payload.move)
  if (payload.maxDamage >= 12) {
    crowdReact(Math.min(payload.maxDamage / 25, 1))
  }
}

function playMoveSound(move, damageDealt) {
  if (['jab', 'hook', 'uppercut'].includes(move)) {
    if ((damageDealt ?? 0) <= 0) whiffSound(move)
    else whoosh(move)
  } else if (move === 'dodge') {
    dodgeSound()
  } else if (move === 'clinch') {
    clinchSound()
  } else if (move === 'rest') {
    restSound()
  }
}

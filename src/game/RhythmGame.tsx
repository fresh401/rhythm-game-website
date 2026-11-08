import { useEffect, useRef } from 'react'
import { Pause, Play, X } from 'lucide-react'

import { DIFFICULTIES, LANES, getAudioContext } from './audio'
import type { Difficulty, LoadedSong, Note } from './audio'

export type GameStats = {
  score: number
  maxCombo: number
  perfect: number
  great: number
  good: number
  miss: number
  total: number
}

type Props = {
  song: LoadedSong
  notes: Note[]
  difficulty: Difficulty
  compliments: string[]
  friendName: string
  onFinish: (stats: GameStats) => void
  onQuit: () => void
}

const LANE_COLORS = ['#ff6b8b', '#ffc93c', '#4fd1a5', '#5fb4ff']
const LANE_KEYS = [
  ['d', 'arrowleft'],
  ['f', 'arrowdown'],
  ['j', 'arrowup'],
  ['k', 'arrowright'],
]
const KEY_LABELS = ['D', 'F', 'J', 'K']
const WINDOWS = { perfect: 0.055, great: 0.1, good: 0.15 }
const LEAD_IN = 2.2

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  heart: boolean
}
type Popup = { text: string; x: number; y: number; life: number; color: string }

export function RhythmGame({
  song,
  notes,
  difficulty,
  compliments,
  friendName,
  onFinish,
  onQuit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pauseBtnRef = useRef<HTMLButtonElement>(null)
  const controls = useRef<{ togglePause: () => void }>({ togglePause: () => {} })

  useEffect(() => {
    const canvas = canvasRef.current!
    const g = canvas.getContext('2d')!
    const ctx = getAudioContext()
    void ctx.resume()

    const speed = DIFFICULTIES[difficulty].speed
    const stats: GameStats = {
      score: 0,
      maxCombo: 0,
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      total: notes.length,
    }
    let combo = 0
    let particles: Particle[] = []
    let popups: Popup[] = []
    const laneFlash = new Array(LANES).fill(0)
    const pressed = new Array(LANES).fill(false)
    let judgement: { text: string; color: string; life: number } | null = null
    let pulse = 0
    let nextNote = 0

    let source: AudioBufferSourceNode | null = null
    let startAt = 0
    let pausedAt: number | null = null
    let finished = false

    const play = (offset: number) => {
      source = ctx.createBufferSource()
      source.buffer = song.buffer
      source.connect(ctx.destination)
      const when = ctx.currentTime + Math.max(0, -offset)
      source.start(when, Math.max(0, offset))
      startAt = when - Math.max(0, offset)
    }
    play(-LEAD_IN)

    const songTime = () =>
      pausedAt !== null ? pausedAt : ctx.currentTime - startAt

    controls.current.togglePause = () => {
      if (finished) return
      if (pausedAt === null) {
        pausedAt = songTime()
        source?.stop()
        source = null
      } else {
        const resumeFrom = pausedAt - 1.5
        pausedAt = null
        play(resumeFrom)
      }
      if (pauseBtnRef.current) pauseBtnRef.current.dataset.paused = String(pausedAt !== null)
    }

    let W = 0
    let H = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      W = rect.width
      H = rect.height
      canvas.width = W * dpr
      canvas.height = H * dpr
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const geom = () => {
      const fieldW = Math.min(W - 24, 460)
      const left = (W - fieldW) / 2
      const laneW = fieldW / LANES
      const hitY = H - Math.max(90, H * 0.14)
      return { fieldW, left, laneW, hitY }
    }

    const burst = (lane: number, strong: boolean) => {
      const { left, laneW, hitY } = geom()
      const x = left + laneW * (lane + 0.5)
      const n = strong ? 16 : 9
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 80 + Math.random() * (strong ? 260 : 160)
        particles.push({
          x,
          y: hitY,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 120,
          life: 1,
          color: LANE_COLORS[lane],
          heart: strong && Math.random() < 0.45,
        })
      }
    }

    const judge = (text: string, color: string) => {
      judgement = { text, color, life: 1 }
    }

    const registerHit = (lane: number) => {
      const t = songTime()
      let best: Note | null = null
      let bestDiff = Infinity
      for (let i = nextNote; i < notes.length; i++) {
        const n = notes[i]
        if (n.t - t > WINDOWS.good) break
        if (n.hit || n.missed || n.lane !== lane) continue
        const d = Math.abs(n.t - t)
        if (d < bestDiff) {
          best = n
          bestDiff = d
        }
      }
      laneFlash[lane] = 1
      if (!best || bestDiff > WINDOWS.good) return
      best.hit = true
      combo++
      stats.maxCombo = Math.max(stats.maxCombo, combo)
      const mult = 1 + Math.min(combo, 50) / 25
      if (bestDiff <= WINDOWS.perfect) {
        stats.perfect++
        stats.score += Math.round(300 * mult)
        judge('PERFECT', '#ffe36e')
        burst(lane, true)
      } else if (bestDiff <= WINDOWS.great) {
        stats.great++
        stats.score += Math.round(200 * mult)
        judge('GREAT', '#7ef0c4')
        burst(lane, false)
      } else {
        stats.good++
        stats.score += Math.round(100 * mult)
        judge('GOOD', '#9cc9ff')
        burst(lane, false)
      }
      pulse = 1
      if (combo > 0 && combo % 15 === 0) {
        const { left, fieldW, hitY } = geom()
        popups.push({
          text: compliments[Math.floor(Math.random() * compliments.length)],
          x: left + fieldW / 2 + (Math.random() - 0.5) * fieldW * 0.4,
          y: hitY * 0.45,
          life: 1,
          color: LANE_COLORS[Math.floor(Math.random() * LANES)],
        })
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const k = e.key.toLowerCase()
      if (k === 'escape' || k === 'p' || k === ' ') {
        e.preventDefault()
        controls.current.togglePause()
        return
      }
      const lane = LANE_KEYS.findIndex((keys) => keys.includes(k))
      if (lane < 0 || pausedAt !== null) return
      e.preventDefault()
      pressed[lane] = true
      registerHit(lane)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const lane = LANE_KEYS.findIndex((keys) => keys.includes(e.key.toLowerCase()))
      if (lane >= 0) pressed[lane] = false
    }
    const pointerLanes = new Map<number, number>()
    const laneAt = (clientX: number) => {
      const rect = canvas.getBoundingClientRect()
      const { left, laneW } = geom()
      const lane = Math.floor((clientX - rect.left - left) / laneW)
      return Math.max(0, Math.min(LANES - 1, lane))
    }
    const onPointerDown = (e: PointerEvent) => {
      if (pausedAt !== null) return
      e.preventDefault()
      const lane = laneAt(e.clientX)
      pointerLanes.set(e.pointerId, lane)
      pressed[lane] = true
      registerHit(lane)
    }
    const onPointerUp = (e: PointerEvent) => {
      const lane = pointerLanes.get(e.pointerId)
      if (lane !== undefined) pressed[lane] = false
      pointerLanes.delete(e.pointerId)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath()
      g.roundRect(x, y, w, h, r)
    }
    const drawHeart = (x: number, y: number, s: number) => {
      g.beginPath()
      g.moveTo(x, y + s * 0.3)
      g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3)
      g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s)
      g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3)
      g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3)
      g.fill()
    }

    let raf = 0
    let lastFrame = performance.now()
    const songEnd = Math.max(
      song.buffer.duration,
      notes.length ? notes[notes.length - 1].t : 0,
    )

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000)
      lastFrame = now
      const t = songTime()
      const paused = pausedAt !== null
      const { fieldW, left, laneW, hitY } = geom()

      // auto-miss
      if (!paused) {
        while (nextNote < notes.length) {
          const n = notes[nextNote]
          if (n.hit) {
            nextNote++
            continue
          }
          if (t - n.t > WINDOWS.good) {
            n.missed = true
            stats.miss++
            combo = 0
            judge('miss', '#c9b6ff')
            nextNote++
            continue
          }
          break
        }
      }

      g.clearRect(0, 0, W, H)

      // field
      g.save()
      roundRect(left, -20, fieldW, H + 40, 28)
      g.fillStyle = 'rgba(28, 10, 48, 0.55)'
      g.fill()
      g.clip()
      for (let l = 0; l < LANES; l++) {
        const x = left + l * laneW
        if (pressed[l] || laneFlash[l] > 0) {
          const a = Math.max(pressed[l] ? 0.35 : 0, laneFlash[l] * 0.5)
          const grad = g.createLinearGradient(0, hitY, 0, 0)
          grad.addColorStop(0, hexA(LANE_COLORS[l], a))
          grad.addColorStop(1, hexA(LANE_COLORS[l], 0))
          g.fillStyle = grad
          g.fillRect(x, 0, laneW, hitY)
        }
        if (l > 0) {
          g.fillStyle = 'rgba(255,255,255,0.07)'
          g.fillRect(x - 1, 0, 2, H)
        }
        laneFlash[l] = Math.max(0, laneFlash[l] - dt * 4)
      }

      // beat lines for vibe
      g.fillStyle = 'rgba(255,255,255,0.05)'
      const beatSpacing = 0.5
      const firstBeat = Math.ceil(t / beatSpacing) * beatSpacing
      for (let bt = firstBeat; bt < t + hitY / speed; bt += beatSpacing) {
        const y = hitY - (bt - t) * speed
        g.fillRect(left, y, fieldW, 1)
      }

      // notes
      const noteH = 22
      for (let i = nextNote; i < notes.length; i++) {
        const n = notes[i]
        const y = hitY - (n.t - t) * speed
        if (y < -40) break
        if (n.hit) continue
        const x = left + n.lane * laneW + 8
        const w = laneW - 16
        const c = LANE_COLORS[n.lane]
        g.shadowColor = c
        g.shadowBlur = 16
        roundRect(x, y - noteH / 2, w, noteH, 11)
        g.fillStyle = c
        g.fill()
        g.shadowBlur = 0
        roundRect(x + 6, y - noteH / 2 + 4, w - 12, 6, 3)
        g.fillStyle = 'rgba(255,255,255,0.55)'
        g.fill()
      }
      g.restore()

      // hit line + receptors
      pulse = Math.max(0, pulse - dt * 5)
      for (let l = 0; l < LANES; l++) {
        const cx = left + laneW * (l + 0.5)
        const r = Math.min(laneW * 0.36, 30) * (pressed[l] ? 0.9 : 1)
        g.beginPath()
        g.arc(cx, hitY, r, 0, Math.PI * 2)
        g.lineWidth = 4
        g.strokeStyle = LANE_COLORS[l]
        g.fillStyle = pressed[l] ? hexA(LANE_COLORS[l], 0.45) : 'rgba(255,255,255,0.06)'
        g.fill()
        g.stroke()
        g.fillStyle = 'rgba(255,255,255,0.8)'
        g.font = '700 15px Fredoka, system-ui, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(KEY_LABELS[l], cx, hitY + r + 20)
      }

      // particles
      particles = particles.filter((p) => p.life > 0)
      for (const p of particles) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 520 * dt
        p.life -= dt * 1.4
        g.globalAlpha = Math.max(0, p.life)
        g.fillStyle = p.color
        if (p.heart) drawHeart(p.x, p.y, 12)
        else {
          g.beginPath()
          g.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
          g.fill()
        }
      }
      g.globalAlpha = 1

      // judgement + combo
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const midX = left + fieldW / 2
      if (judgement && judgement.life > 0) {
        const s = 1 + (1 - judgement.life) * 0.15
        g.globalAlpha = Math.min(1, judgement.life * 1.5)
        g.font = `700 ${Math.round(30 * s)}px Fredoka, system-ui, sans-serif`
        g.fillStyle = judgement.color
        g.fillText(judgement.text, midX, hitY - 150)
        judgement.life -= dt * 1.8
        g.globalAlpha = 1
      }
      if (combo >= 4) {
        g.font = `700 ${Math.round(54 + pulse * 10)}px Fredoka, system-ui, sans-serif`
        g.fillStyle = 'rgba(255,255,255,0.92)'
        g.fillText(String(combo), midX, hitY - 220)
        g.font = '600 13px Fredoka, system-ui, sans-serif'
        g.fillStyle = 'rgba(255,255,255,0.6)'
        g.fillText('COMBO', midX, hitY - 186)
      }

      popups = popups.filter((p) => p.life > 0)
      for (const p of popups) {
        p.y -= dt * 40
        p.life -= dt * 0.6
        g.globalAlpha = Math.min(1, p.life * 2)
        g.font = '700 34px Fredoka, system-ui, sans-serif'
        g.lineWidth = 6
        g.strokeStyle = 'rgba(40,10,60,0.8)'
        g.strokeText(p.text, p.x, p.y)
        g.fillStyle = p.color
        g.fillText(p.text, p.x, p.y)
      }
      g.globalAlpha = 1

      // HUD
      g.textAlign = 'left'
      g.font = '700 22px Fredoka, system-ui, sans-serif'
      g.fillStyle = '#fff'
      g.fillText(stats.score.toLocaleString(), 20, 34)
      g.font = '500 12px Fredoka, system-ui, sans-serif'
      g.fillStyle = 'rgba(255,255,255,0.6)'
      g.fillText('SCORE', 20, 56)

      const progress = Math.max(0, Math.min(1, t / songEnd))
      g.fillStyle = 'rgba(255,255,255,0.12)'
      roundRect(left, 8, fieldW, 6, 3)
      g.fill()
      const pg = g.createLinearGradient(left, 0, left + fieldW, 0)
      LANE_COLORS.forEach((c, i) => pg.addColorStop(i / 3, c))
      g.fillStyle = pg
      roundRect(left, 8, fieldW * progress, 6, 3)
      g.fill()

      if (t < 0 && !paused) {
        const n = Math.ceil(-t)
        g.textAlign = 'center'
        g.font = '700 26px Fredoka, system-ui, sans-serif'
        g.fillStyle = '#fff'
        g.fillText(`Ready, ${friendName}?`, midX, H * 0.32)
        g.font = '700 72px Fredoka, system-ui, sans-serif'
        g.fillStyle = LANE_COLORS[n % LANES]
        g.fillText(String(n), midX, H * 0.32 + 70)
      }

      if (paused) {
        g.fillStyle = 'rgba(20,6,36,0.6)'
        g.fillRect(0, 0, W, H)
        g.textAlign = 'center'
        g.fillStyle = '#fff'
        g.font = '700 40px Fredoka, system-ui, sans-serif'
        g.fillText('Paused', W / 2, H * 0.4)
        g.font = '500 16px Fredoka, system-ui, sans-serif'
        g.fillStyle = 'rgba(255,255,255,0.7)'
        g.fillText('Take a breath. Press Space or ▶ to keep going.', W / 2, H * 0.4 + 40)
      }

      if (!paused && t > songEnd + 0.8 && !finished) {
        finished = true
        onFinish(stats)
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      try {
        source?.stop()
      } catch {
        /* already stopped */
      }
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-40 select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Rhythm game. Press D, F, J and K, or tap the lanes, as notes reach the circles."
      />
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          ref={pauseBtnRef}
          data-paused="false"
          onClick={() => controls.current.togglePause()}
          className="group grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
          aria-label="Pause or resume"
        >
          <Pause className="size-5 group-data-[paused=true]:hidden" />
          <Play className="hidden size-5 group-data-[paused=true]:block" />
        </button>
        <button
          onClick={onQuit}
          className="grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
          aria-label="Quit to menu"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

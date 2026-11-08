/**
 * Audio + beat-chart engine.
 *
 * Every song (the built-in track or any real audio file) is reduced to a list of
 * candidate `ChartEvent`s, each tagged with a `level` (1 = essential, 3 = extra).
 * `buildChart` then picks the events that fit the chosen difficulty.
 */

export type Difficulty = 1 | 2 | 3

export const DIFFICULTIES: Record<
  Difficulty,
  { label: string; blurb: string; minGap: number; speed: number }
> = {
  1: { label: 'pussy', blurb: 'for down_syndrome', minGap: 0.42, speed: 380 },
  2: { label: 'normal', blurb: 'Just right', minGap: 0.26, speed: 480 },
  3: { label: 'masochist', blurb: 'do it :)', minGap: 0.14, speed: 600 },
}

export type ChartEvent = { t: number; lane: number; level: Difficulty }
export type Note = { t: number; lane: number; hit: boolean; missed: boolean }

export type LoadedSong = {
  title: string
  buffer: AudioBuffer
  events: ChartEvent[]
  builtIn: boolean
}

export const LANES = 4

let sharedCtx: AudioContext | null = null
export function getAudioContext() {
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    sharedCtx = new Ctor()
  }
  return sharedCtx
}

export function buildChart(events: ChartEvent[], difficulty: Difficulty): Note[] {
  const { minGap } = DIFFICULTIES[difficulty]
  const notes: Note[] = []
  let last = -Infinity
  let lastLane = -1
  let sameLaneRun = 0
  for (const e of events) {
    if (e.level > difficulty) continue
    if (e.t < 1.2) continue // give the player a moment
    if (e.t - last < minGap) continue
    let lane = e.lane
    if (lane === lastLane) {
      sameLaneRun++
      if (sameLaneRun >= 3) lane = (lane + 1 + Math.floor(e.t * 7) % 3) % LANES
    } else sameLaneRun = 0
    if (lane !== lastLane) sameLaneRun = 0
    notes.push({ t: e.t, lane, hit: false, missed: false })
    last = e.t
    lastLane = lane
  }
  return notes
}

/* ------------------------------------------------------------------ */
/* Loading real audio                                                  */
/* ------------------------------------------------------------------ */

export async function loadSongFromUrl(url: string, title: string) {
  const res = await fetch(url)
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || type.includes('text/html')) throw new Error('Song not found')
  const data = await res.arrayBuffer()
  return decodeSong(data, title)
}

export async function loadSongFromFile(file: File) {
  const data = await file.arrayBuffer()
  const title = file.name.replace(/\.[^.]+$/, '')
  return decodeSong(data, title)
}

async function decodeSong(data: ArrayBuffer, title: string): Promise<LoadedSong> {
  const ctx = getAudioContext()
  const buffer = await ctx.decodeAudioData(data)
  return { title, buffer, events: analyzeBeats(buffer), builtIn: false }
}

/**
 * Lightweight onset detection: energy flux with an adaptive threshold, then
 * peak picking. Lanes follow the brightness (zero-crossing rate) of each hit so
 * low sounds land on the left and bright sounds on the right.
 */
export function analyzeBeats(buffer: AudioBuffer): ChartEvent[] {
  const sr = buffer.sampleRate
  const len = buffer.length
  const mono = new Float32Array(len)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += ch[i] / buffer.numberOfChannels
  }

  const hop = 512
  const frames = Math.floor(len / hop)
  const energy = new Float32Array(frames)
  const zcr = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    let crossings = 0
    const start = f * hop
    for (let i = start; i < start + hop; i++) {
      const s = mono[i]
      sum += s * s
      if (i > start && (s >= 0) !== (mono[i - 1] >= 0)) crossings++
    }
    energy[f] = Math.sqrt(sum / hop)
    zcr[f] = crossings / hop
  }

  const flux = new Float32Array(frames)
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1])

  const win = 16
  const peaks: { f: number; strength: number }[] = []
  for (let f = 1; f < frames - 1; f++) {
    let mean = 0
    let n = 0
    for (let k = Math.max(0, f - win); k < Math.min(frames, f + win); k++) {
      mean += flux[k]
      n++
    }
    mean /= n
    const threshold = mean * 1.6 + 0.004
    if (flux[f] > threshold && flux[f] >= flux[f - 1] && flux[f] > flux[f + 1]) {
      peaks.push({ f, strength: flux[f] - mean })
    }
  }

  const sorted = [...peaks].sort((a, b) => b.strength - a.strength)
  const rank = new Map<number, number>()
  sorted.forEach((p, i) => rank.set(p.f, i / Math.max(1, sorted.length)))

  const zs = peaks.map((p) => zcr[p.f]).sort((a, b) => a - b)
  const q = (p: number) => zs[Math.floor(p * (zs.length - 1))] ?? 0
  const cuts = [q(0.25), q(0.5), q(0.75)]

  return peaks.map((p) => {
    const z = zcr[p.f]
    const lane = z < cuts[0] ? 0 : z < cuts[1] ? 1 : z < cuts[2] ? 2 : 3
    const r = rank.get(p.f) ?? 1
    const level: Difficulty = r < 0.35 ? 1 : r < 0.65 ? 2 : 3
    return { t: (p.f * hop) / sr, lane, level }
  })
}

/* ------------------------------------------------------------------ */
/* Built-in feel-good track, synthesized on the fly                     */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

export async function renderBuiltInSong(): Promise<LoadedSong> {
  const bpm = 120
  const beat = 60 / bpm
  const bar = beat * 4
  const bars = 32
  const sr = 44100
  const duration = bars * bar + 2.5
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr)

  const master = ctx.createGain()
  master.gain.value = 0.55
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)

  const noise = ctx.createBuffer(1, sr, sr)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

  const kick = (t: number) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    g.gain.setValueAtTime(1, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + 0.35)
  }
  const noiseHit = (
    t: number,
    type: BiquadFilterType,
    freq: number,
    vol: number,
    decay: number,
  ) => {
    const s = ctx.createBufferSource()
    s.buffer = noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    s.connect(f).connect(g).connect(master)
    s.start(t, Math.random() * 0.5)
    s.stop(t + decay + 0.02)
  }
  const tone = (
    t: number,
    midi: number,
    len: number,
    type: OscillatorType,
    vol: number,
    cutoff: number,
  ) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = midiHz(midi)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + len * 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    o.connect(f).connect(g).connect(master)
    o.start(t)
    o.stop(t + len + 0.05)
  }

  // I – V – vi – IV in C major: the happiest progression there is.
  const chords = [
    [60, 64, 67],
    [55, 59, 62],
    [57, 60, 64],
    [53, 57, 60],
  ]
  const roots = [36, 43, 45, 41]
  const rhythms = [
    [1, 0, 1, 0, 1, 1, 0, 1],
    [1, 1, 0, 1, 0, 1, 1, 0],
    [1, 0, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 1, 1, 0, 1, 1],
  ]
  const rand = mulberry32(2024)
  const events: ChartEvent[] = []
  const lead0 = 0.25 // small offset so the first beat isn't at t=0

  for (let b = 0; b < bars; b++) {
    const t0 = lead0 + b * bar
    const ci = b % 4
    const intro = b < 4
    const breakdown = b >= 20 && b < 24
    const chorus = (b >= 12 && b < 20) || b >= 24

    for (const m of chords[ci]) tone(t0, m, bar * 0.98, 'sawtooth', 0.035, 1400)

    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat
      if (!breakdown) kick(t)
      if (!intro) noiseHit(t + beat / 2, 'highpass', 7500, 0.12, 0.05)
      if (chorus && (q === 1 || q === 3)) noiseHit(t, 'bandpass', 1800, 0.45, 0.16)
      tone(t, roots[ci], beat * 0.9, 'triangle', breakdown ? 0.15 : 0.3, 900)
      if (intro || breakdown) {
        events.push({ t, lane: [0, 1, 2, 3, 3, 2, 1, 0][(b * 4 + q) % 8], level: 1 })
      }
    }

    if (intro || breakdown) continue
    const pattern = rhythms[Math.floor(rand() * rhythms.length)]
    let prev = chords[ci][Math.floor(rand() * 3)] + 12
    for (let s = 0; s < 8; s++) {
      if (!pattern[s] && !(chorus && rand() < 0.2)) continue
      const t = t0 + s * (beat / 2)
      const tones = chords[ci].map((m) => m + 12)
      tones.push(chords[ci][0] + 24)
      const pick = tones.reduce((best, m) =>
        Math.abs(m - prev) + rand() * 6 < Math.abs(best - prev) + rand() * 6 ? m : best,
      )
      prev = pick
      tone(t, pick, beat * 0.45, 'square', chorus ? 0.09 : 0.07, 3200)
      const lane = Math.max(0, Math.min(3, Math.floor((pick - 67) / 4.5)))
      const onBeat = s % 2 === 0
      events.push({ t, lane, level: onBeat ? 1 : chorus ? 2 : 3 })
    }
    if (chorus) {
      // sparkle notes for Wild mode
      events.push({ t: t0 + bar - beat / 4, lane: 3, level: 3 })
    }
  }

  // a final cheerful chord
  const end = lead0 + bars * bar
  for (const m of [60, 64, 67, 72]) tone(end, m, 2, 'sawtooth', 0.05, 2000)
  kick(end)
  events.push({ t: end, lane: 1, level: 1 })
  events.push({ t: end + 0.001, lane: 2, level: 1 })

  events.sort((a, b) => a.t - b.t)
  const buffer = await ctx.startRendering()
  return { title: 'Sunshine Mixtape (built-in)', buffer, events, builtIn: true }
}

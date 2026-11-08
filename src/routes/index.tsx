import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Copy,
  Heart,
  Loader2,
  Music2,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cheer, readCheer } from '@/config'
import type { CheerConfig } from '@/config'
import {
  DIFFICULTIES,
  buildChart,
  getAudioContext,
  loadSongFromFile,
  loadSongFromUrl,
  renderBuiltInSong,
} from '@/game/audio'
import type { Difficulty, LoadedSong, Note } from '@/game/audio'
import { RhythmGame } from '@/game/RhythmGame'
import type { GameStats } from '@/game/RhythmGame'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
  component: Home,
})

type Screen = 'menu' | 'playing' | 'results'
type SongState =
  | { status: 'loading' }
  | { status: 'ready'; song: LoadedSong }
  | { status: 'error'; message: string }

function Home() {
  const [config, setConfig] = useState<CheerConfig>(cheer)
  const [screen, setScreen] = useState<Screen>('menu')
  const [songState, setSongState] = useState<SongState>({ status: 'loading' })
  const [difficulty, setDifficulty] = useState<Difficulty>(2)
  const [chart, setChart] = useState<Note[]>([])
  const [stats, setStats] = useState<GameStats | null>(null)
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    const cfg = readCheer(window.location.search)
    setConfig(cfg)
    let cancelled = false
    loadSongFromUrl(cfg.songUrl, cfg.songTitle)
      .catch(() => renderBuiltInSong())
      .then((song) => !cancelled && setSongState({ status: 'ready', song }))
      .catch(() =>
        setSongState({ status: 'error', message: 'Your browser could not play audio.' }),
      )
    return () => {
      cancelled = true
    }
  }, [])

  const onPickFile = async (file: File) => {
    setSongState({ status: 'loading' })
    try {
      const song = await loadSongFromFile(file)
      setSongState({ status: 'ready', song })
      toast.success(`Loaded “${song.title}” — beats mapped!`)
    } catch {
      toast.error("Hmm, that file couldn't be read. Try an MP3, WAV or OGG.")
      renderBuiltInSong().then((song) => setSongState({ status: 'ready', song }))
    }
  }

  const start = () => {
    if (songState.status !== 'ready') return
    void getAudioContext().resume()
    setChart(buildChart(songState.song.events, difficulty))
    setRunId((n) => n + 1)
    setScreen('playing')
  }

  return (
    <div className="cheer-bg relative min-h-screen overflow-hidden text-white">
      <FloatingBits />

      {screen === 'menu' && (
        <Menu
          config={config}
          songState={songState}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStart={start}
          onPickFile={onPickFile}
        />
      )}

      {screen === 'playing' && songState.status === 'ready' && (
        <RhythmGame
          key={runId}
          song={songState.song}
          notes={chart}
          difficulty={difficulty}
          compliments={config.compliments}
          friendName={config.friendName}
          onFinish={(s) => {
            setStats(s)
            setScreen('results')
          }}
          onQuit={() => setScreen('menu')}
        />
      )}

      {screen === 'results' && stats && (
        <Results
          config={config}
          stats={stats}
          onReplay={start}
          onMenu={() => setScreen('menu')}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Menu({
  config,
  songState,
  difficulty,
  setDifficulty,
  onStart,
  onPickFile,
}: {
  config: CheerConfig
  songState: SongState
  difficulty: Difficulty
  setDifficulty: (d: Difficulty) => void
  onStart: () => void
  onPickFile: (f: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const ready = songState.status === 'ready'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && ready) onStart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, onStart])

  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 py-14 text-center">
      <p className="pop-in mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold backdrop-blur">
        <Heart className="size-4 fill-[#ff6b8b] text-[#ff6b8b]" />
        Made with love by {config.fromName}
      </p>

      <h1 className="pop-in font-display text-5xl leading-[1.05] font-bold tracking-tight [animation-delay:80ms] sm:text-7xl">
        Hey <span className="text-[#ffc93c]">{config.friendName}</span>,
        <br />
        this one's for{' '}
        <span className="bg-gradient-to-r from-[#ff6b8b] via-[#ffc93c] to-[#4fd1a5] bg-clip-text text-transparent">
          you
        </span>
        .
      </h1>

      <p className="pop-in mt-5 max-w-xl text-lg text-white/80 [animation-delay:160ms]">
        Tap along to the beat, rack up a combo, and stick around until the end —
        there's a little message waiting for you.
      </p>

      <LaneLogo />

      {/* song card */}
      <div className="pop-in mt-2 w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-left backdrop-blur [animation-delay:240ms]">
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#ff6b8b] to-[#ffc93c] shadow-lg shadow-[#ff6b8b]/30">
            {songState.status === 'loading' ? (
              <Loader2 className="size-6 animate-spin text-[#2a0c3f]" />
            ) : (
              <Music2 className="size-6 text-[#2a0c3f]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-widest text-white/50 uppercase">
              Now playing
            </p>
            <p className="font-display truncate text-xl font-semibold">
              {songState.status === 'ready'
                ? songState.song.title
                : songState.status === 'loading'
                  ? 'Tuning up & mapping beats…'
                  : songState.message}
            </p>
            {ready && (
              <p className="text-sm text-white/60">
                {formatTime(songState.song.buffer.duration)} ·{' '}
                {buildChart(songState.song.events, difficulty).length} notes
              </p>
            )}
            {ready && songState.song.builtIn && (
              <p className="mt-1 text-xs text-[#ffc93c]/90">
                Tap <Upload className="inline size-3" /> to play your own song instead
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full text-white hover:bg-white/15"
            onClick={() => fileRef.current?.click()}
            aria-label="Use a different song"
            title="Use a different song"
          >
            <Upload className="size-5" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPickFile(f)
              e.target.value = ''
            }}
          />
        </div>

        {/* difficulty */}
        <div className="mt-5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
          {([1, 2, 3] as Difficulty[]).map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={difficulty === d}
              onClick={() => setDifficulty(d)}
              className={cn(
                'rounded-2xl border px-3 py-2.5 text-center transition',
                difficulty === d
                  ? 'border-[#ffc93c] bg-[#ffc93c]/15'
                  : 'border-white/10 bg-white/5 hover:bg-white/10',
              )}
            >
              <span className="font-display block text-base font-semibold">
                {DIFFICULTIES[d].label}
              </span>
              <span className="block text-xs text-white/60">{DIFFICULTIES[d].blurb}</span>
            </button>
          ))}
        </div>

        <Button
          onClick={onStart}
          disabled={!ready}
          className="font-display mt-5 h-14 w-full rounded-2xl text-xl font-semibold shadow-lg shadow-[#ffc93c]/25 transition hover:scale-[1.02]"
        >
          <Play className="size-5 fill-current" /> Let's go!
        </Button>
      </div>

      <div className="pop-in mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/60 [animation-delay:320ms]">
        <span>
          Keys{' '}
          {['D', 'F', 'J', 'K'].map((k) => (
            <kbd
              key={k}
              className="mx-0.5 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white"
            >
              {k}
            </kbd>
          ))}{' '}
          or tap the lanes
        </span>
        <span>Space to pause</span>
        <PersonalizeDialog config={config} />
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ */

function Results({
  config,
  stats,
  onReplay,
  onMenu,
}: {
  config: CheerConfig
  stats: GameStats
  onReplay: () => void
  onMenu: () => void
}) {
  const accuracy = stats.total
    ? (stats.perfect + stats.great * 0.8 + stats.good * 0.5) / stats.total
    : 1
  const grade =
    accuracy >= 0.92
      ? { letter: 'S', title: 'Absolute superstar' }
      : accuracy >= 0.8
        ? { letter: 'A', title: 'Amazing rhythm' }
        : accuracy >= 0.65
          ? { letter: 'B', title: 'Brilliant groove' }
          : accuracy >= 0.45
            ? { letter: 'C', title: 'Certified cool' }
            : { letter: '♥', title: 'Best effort, best friend' }

  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 py-14 text-center">
      <Confetti />
      <div className="pop-in relative grid size-32 place-items-center rounded-[2rem] bg-gradient-to-br from-[#ff6b8b] via-[#ffc93c] to-[#4fd1a5] shadow-2xl shadow-[#ff6b8b]/40">
        <span className="font-display text-7xl font-bold text-[#2a0c3f]">{grade.letter}</span>
      </div>
      <h2 className="pop-in font-display mt-6 text-4xl font-bold [animation-delay:100ms] sm:text-5xl">
        {grade.title}!
      </h2>
      <p className="pop-in mt-2 text-white/70 [animation-delay:150ms]">
        {stats.score.toLocaleString()} points · {Math.round(accuracy * 100)}% accuracy ·
        best combo {stats.maxCombo}
      </p>

      <div className="pop-in mt-5 flex gap-2 text-sm [animation-delay:200ms]">
        <Stat label="Perfect" value={stats.perfect} color="#ffe36e" />
        <Stat label="Great" value={stats.great} color="#7ef0c4" />
        <Stat label="Good" value={stats.good} color="#9cc9ff" />
        <Stat label="Miss" value={stats.miss} color="#c9b6ff" />
      </div>

      <figure className="pop-in mt-8 w-full rounded-3xl border border-white/10 bg-white/[0.08] p-6 text-left backdrop-blur [animation-delay:400ms] sm:p-8">
        <Sparkles className="bob mb-3 size-7 text-[#ffc93c]" />
        <p className="font-display text-sm font-semibold tracking-widest text-white/50 uppercase">
          A message for {config.friendName}
        </p>
        <blockquote className="mt-3 text-lg leading-relaxed text-white/90 sm:text-xl">
          {config.message}
        </blockquote>
        <figcaption className="mt-4 font-semibold text-[#ff9db1]">— {config.fromName}</figcaption>
      </figure>

      <div className="pop-in mt-8 flex flex-wrap justify-center gap-3 [animation-delay:500ms]">
        <Button onClick={onReplay} className="font-display h-12 rounded-2xl px-6 text-lg">
          <RotateCcw className="size-5" /> Play again
        </Button>
        <Button
          variant="outline"
          onClick={onMenu}
          className="font-display h-12 rounded-2xl border-white/20 bg-white/5 px-6 text-lg text-white hover:bg-white/15"
        >
          Change song or level
        </Button>
      </div>
    </main>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="min-w-18 rounded-2xl bg-white/[0.07] px-3 py-2">
      <div className="font-display text-xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function PersonalizeDialog({ config }: { config: CheerConfig }) {
  const [to, setTo] = useState('')
  const [from, setFrom] = useState('')
  const [msg, setMsg] = useState('')
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const link = useMemo(() => {
    const p = new URLSearchParams()
    if (to.trim()) p.set('to', to.trim())
    if (from.trim()) p.set('from', from.trim())
    if (msg.trim()) p.set('msg', msg.trim())
    const q = p.toString()
    return `${origin}/${q ? `?${q}` : ''}`
  }, [to, from, msg, origin])

  return (
    <Dialog>
      
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Make it personal</DialogTitle>
          <DialogDescription>
            Fill these in and send your friend the link. They'll see their name and your
            message when the song ends.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="to">Friend's name</Label>
            <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder={config.friendName} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="from">Your name</Label>
            <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={config.fromName} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="msg">Your message</Label>
            <Textarea
              id="msg"
              rows={4}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="You're going to get through this, and I'm right here with you…"
            />
          </div>
          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" aria-label="Your link" />
            <Button
              onClick={() => {
                navigator.clipboard
                  .writeText(link)
                  .then(() => toast.success('Link copied — go make their day!'))
                  .catch(() => toast.error('Could not copy. Select the link and copy it manually.'))
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */

const LANE_COLORS = ['#ff6b8b', '#ffc93c', '#4fd1a5', '#5fb4ff']

function LaneLogo() {
  return (
    <div className="my-10 flex items-end gap-3" aria-hidden>
      {LANE_COLORS.map((c, i) => (
        <div key={c} className="bob flex flex-col items-center gap-2" style={{ animationDelay: `${i * 0.18}s` }}>
          <div className="h-4 w-12 rounded-full sm:w-14" style={{ background: c, boxShadow: `0 0 22px ${c}` }} />
          <div className="size-10 rounded-full border-4 sm:size-12" style={{ borderColor: c }} />
        </div>
      ))}
    </div>
  )
}

const BITS = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 53) % 100,
  size: 14 + ((i * 7) % 18),
  duration: 12 + ((i * 5) % 11),
  delay: -((i * 3.7) % 20),
  glyph: ['♥', '♪', '✦', '♫'][i % 4],
  color: LANE_COLORS[i % 4],
}))

function FloatingBits() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {BITS.map((b, i) => (
        <span
          key={i}
          className="floaty absolute -bottom-10 opacity-0"
          style={{
            left: `${b.left}%`,
            fontSize: b.size,
            color: b.color,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        >
          {b.glyph}
        </span>
      ))}
    </div>
  )
}

const CONFETTI = Array.from({ length: 40 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 10) * 0.12,
  duration: 2.6 + (i % 5) * 0.4,
  color: LANE_COLORS[i % 4],
  rotate: (i * 47) % 360,
}))

function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="confetti absolute -top-4 h-3 w-2 rounded-sm"
          style={{
            left: `${c.left}%`,
            background: c.color,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            rotate: `${c.rotate}deg`,
          }}
        />
      ))}
    </div>
  )
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

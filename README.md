# Cheer Beats 🎵💛

A small rhythm game made to cheer up someone special. Notes fall down four colourful lanes in time with a song. Your friend taps along, builds a combo, sees little compliments pop up, and at the end of the song a personal message is revealed.

## Add your song

1. Put your audio file at `public/music/song.mp3`, or change `songUrl` in `src/config.ts` to point at it. MP3, WAV, OGG and M4A all work.
2. Set `songTitle` in `src/config.ts`.

The beat chart is built automatically from the audio, so you don't have to map notes by hand. If no song file is found, a built-in feel-good track plays instead. Players can also load any song from their own device with the upload button on the start screen.

## Personalize it

Edit `src/config.ts` to set your friend's name, your name, the end-of-song message and the compliments. You can also do it without code: click **Make a personal link** on the start screen, or build the URL yourself:

```
/?to=Sam&from=Alex&msg=You've%20got%20this!
```

## How to play

- **Keys:** D F J K (or the arrow keys). **Mobile:** tap the lanes.
- **Space / Esc:** pause.
- Three levels: Chill, Groovy and Wild.

## Tech

TanStack Start (React 19), Tailwind CSS 4, the Web Audio API (playback, beat detection and the synthesized fallback track) and a `<canvas>` renderer, deployed on Netlify. There is no backend: everything runs in the browser.

## Run locally

```bash
pnpm install
pnpm dev        # or: netlify dev
```

/**
 * ✨ Personalize everything here. ✨
 *
 * Every field can also be overridden from the URL, so you can share a custom
 * link without touching code, e.g.
 *   /?to=Sam&from=Alex&msg=You%20got%20this!
 */
export const cheer = {
  /** Your friend's name (URL: ?to=) */
  friendName: 'Asmae',
  /** Your name (URL: ?from=) */
  fromName: 'Mehdi',
  /** The message revealed at the end of the song (URL: ?msg=) */
  message:
    "Whatever today threw at you, you kept going — and that's seriously impressive. You make everything around you brighter, and I'm so lucky to have you. This little song is for you. 💛",
  /**
   * The song to play. Drop your audio file into `public/music/` and point at it here.
   * If the file is missing, a built-in feel-good track plays instead.
   */
  songUrl: '/music/song.mp3',
  songTitle: 'Your Song',
  /** Little pop-ups that appear while your friend plays. */
  compliments: [
    'You rock!',
    'So good!',
    'Amazing!',
    'Unstoppable!',
    'Superstar!',
    "You've got this!",
    'Brilliant!',
    'Legend!',
    'Smile!',
    'Proud of you!',
    'Keep shining!',
    'Wow!',
  ],
}

export function readCheer(search: string) {
  const params = new URLSearchParams(search)
  return {
    ...cheer,
    friendName: params.get('to')?.trim() || cheer.friendName,
    fromName: params.get('from')?.trim() || cheer.fromName,
    message: params.get('msg')?.trim() || cheer.message,
  }
}

export type CheerConfig = ReturnType<typeof readCheer>

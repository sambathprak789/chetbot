/** YouTube search link — needs no API key and never breaks (Spec 4.6). */
export function youtubeSearchUrl(title: string, artist: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist}`)}`;
}

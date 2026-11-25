import { normalizeText } from '../music';

/** Strips remaster/live/feat. decorations that make catalog search fail. */
export function cleanSearchTitle(title: string): string {
  const decoration =
    /remaster|remastered|live|version|edit|remix|mix|demo|mono|stereo|deluxe|bonus|soundtrack|\bost\b|prod|feat|ft\.|\bwith\b/i;
  let value = title.normalize('NFC').replace(/[«»“”„]/g, '"');
  value = value.replace(/\([^()]*\)|\[[^\]]*\]|\{[^}]*\}/g, (chunk) =>
    decoration.test(chunk) ? ' ' : chunk,
  );
  value = value.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, ' ');
  value = value.replace(
    /\s+[-–—]\s+.*(?:remaster|live|version|edit|mix|demo|mono|stereo|deluxe|bonus).*$/i,
    ' ',
  );
  return value.replace(/[.,;:!?…·•]+$/u, '').replace(/\s+/g, ' ').trim() || title.trim();
}

export function primaryArtist(artist: string): string {
  return artist.split(/\s*(?:,|&|feat\.?|ft\.?|x)\s*/i)[0]?.trim() || artist;
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(' ').filter(Boolean));
}

/** Jaccard similarity over normalized tokens, 0..1. */
export function similarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / (a.size + b.size - common);
}

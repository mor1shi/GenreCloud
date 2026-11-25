import type { GenreCount } from './music';

export type CloudTheme = 'light' | 'dark';

export type CloudWord = {
  name: string;
  count: number;
  /** 0 = rarest word, 1 = most frequent. */
  weight: number;
  size: number;
  color: string;
};

export type CloudOptions = {
  limit?: number;
  minSize?: number;
  maxSize?: number;
  theme?: CloudTheme;
};

function normalizeWeight(count: number, max: number): number {
  if (max <= 1) return 1;
  return Math.log(1 + count) / Math.log(1 + max);
}

// The classic look used a handful of ink-like hues instead of one accent, so
// adjacent words stay distinguishable while size still carries the count.
const WORD_HUES_LIGHT = [350, 168, 36, 218, 18];
const WORD_HUES_DARK = [350, 165, 40, 218, 20];

function wordHue(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash % 5;
}

export function wordColor(weight: number, theme: CloudTheme, name = ''): string {
  const clamped = Math.min(1, Math.max(0, weight));
  const hue = (theme === 'dark' ? WORD_HUES_DARK : WORD_HUES_LIGHT)[wordHue(name)];
  if (theme === 'dark') {
    // Stronger = lighter on the dark paper; 58–82% keeps AA contrast.
    const lightness = 58 + Math.round(clamped * 24);
    return `hsl(${hue} 46% ${lightness}%)`;
  }
  // Stronger = deeper on the warm paper; 47% down to 31% stays above 5:1.
  const lightness = 47 - Math.round(clamped * 16);
  return `hsl(${hue} 52% ${lightness}%)`;
}

export function buildCloudWords(
  counts: GenreCount[],
  { limit = 80, minSize = 13, maxSize = 44, theme = 'light' }: CloudOptions = {},
): CloudWord[] {
  const visible = limit === Number.POSITIVE_INFINITY ? counts : counts.slice(0, limit);
  const max = Math.max(1, ...visible.map((item) => item.count));
  return visible.map((item) => {
    const weight = normalizeWeight(item.count, max);
    return {
      name: item.name,
      count: item.count,
      weight,
      size: Math.round(minSize + weight * (maxSize - minSize)),
      color: wordColor(weight, theme, item.name),
    };
  });
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min';
  if (seconds < 60) return '1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export type PositionedWord = {
  name: string;
  count: number;
  size: number;
  color: string;
  x: number;
  y: number;
  width: number;
};

export type CloudLayout = {
  width: number;
  height: number;
  words: PositionedWord[];
};

/** Rough advance width for the system UI sans at a given size. */
function measure(name: string, size: number): number {
  return Math.max(size, name.length * size * 0.56);
}

/**
 * Row-based layout used by the SVG and PNG exports. Words keep the cloud order
 * (frequency, then alphabet) and rows are centred. Sizes shrink uniformly if
 * the content does not fit the canvas.
 */
export function layoutCloud(
  words: CloudWord[],
  width: number,
  height: number,
  scale = 1,
): CloudLayout {
  const padding = 32 * scale;
  const gap = 14 * scale;
  const available = width - padding * 2;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const shrink = 1 - attempt * 0.08;
    const rows: Array<Array<{ word: CloudWord; size: number; width: number }>> = [];
    let row: Array<{ word: CloudWord; size: number; width: number }> = [];
    let rowWidth = 0;

    for (const word of words) {
      const size = Math.max(9 * scale, word.size * scale * shrink);
      const wordWidth = measure(word.name, size);
      if (row.length && rowWidth + gap + wordWidth > available) {
        rows.push(row);
        row = [];
        rowWidth = 0;
      }
      row.push({ word, size, width: wordWidth });
      rowWidth += (row.length > 1 ? gap : 0) + wordWidth;
    }
    if (row.length) rows.push(row);

    const rowHeights = rows.map((items) => Math.max(...items.map((item) => item.size)) * 1.28);
    const totalHeight = rowHeights.reduce((sum, value) => sum + value, 0);
    if (totalHeight <= height - padding * 2 || attempt === 5) {
      let y = padding + (height - padding * 2 - totalHeight) / 2;
      const positioned: PositionedWord[] = [];
      rows.forEach((items, index) => {
        const itemsWidth =
          items.reduce((sum, item) => sum + item.width, 0) + gap * (items.length - 1);
        let x = (width - itemsWidth) / 2;
        const baseline = y + rowHeights[index] / 2 + Math.max(...items.map((i) => i.size)) / 3;
        for (const item of items) {
          positioned.push({
            name: item.word.name,
            count: item.word.count,
            size: item.size,
            color: item.word.color,
            x,
            y: baseline,
            width: item.width,
          });
          x += item.width + gap;
        }
        y += rowHeights[index];
      });
      return { width, height, words: positioned };
    }
  }

  return { width, height, words: [] };
}

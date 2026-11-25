import { buildCloudWords, layoutCloud, type CloudOptions, type CloudWord } from './cloud';
import type { GenreCount, TrackResult } from './music';

export type ExportPayload = {
  version: string;
  results: TrackResult[];
  counts: GenreCount[];
};

export const JSON_FILENAME = 'genrecloud-export.json';
export const SVG_FILENAME = 'genrecloud-cloud.svg';
export const PNG_FILENAME = 'genrecloud-cloud.png';

export function buildExportJson({ version, results, counts }: ExportPayload): string {
  return JSON.stringify(
    {
      app: 'GenreCloud',
      version,
      exportedAt: new Date().toISOString(),
      countingRule:
        'One contribution per liked track for each unique genre. Catalog genres replace the coarse Yandex album genre when found.',
      genres: counts,
      tracks: results,
    },
    null,
    2,
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type CloudImageOptions = CloudOptions & {
  title?: string;
  subtitle?: string;
  width?: number;
  height?: number;
  theme?: 'light' | 'dark';
};

export function buildCloudSvg(
  counts: GenreCount[],
  {
    title = 'GenreCloud',
    subtitle = '',
    width = 1200,
    height = 800,
    theme = 'light',
    limit = 80,
  }: CloudImageOptions = {},
): string {
  const words: CloudWord[] = buildCloudWords(counts, {
    limit,
    minSize: 15,
    maxSize: 64,
    theme,
  });
  const layout = layoutCloud(words, width, height);

  const background = theme === 'dark' ? '#15171b' : '#ffffff';
  const foreground = theme === 'dark' ? '#e7e9ee' : '#17191e';
  const muted = theme === 'dark' ? '#a7aeba' : '#565d6b';
  const border = theme === 'dark' ? '#2c3138' : '#d8dbe1';

  const text = layout.words
    .map(
      (word) =>
        `<text x="${word.x.toFixed(1)}" y="${word.y.toFixed(1)}" font-size="${word.size.toFixed(1)}" fill="${word.color}" font-weight="600">${escapeXml(word.name)}</text>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <text x="32" y="48" font-family="-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="22" font-weight="600" fill="${foreground}">${escapeXml(title)}</text>
  ${
    subtitle
      ? `<text x="32" y="72" font-family="-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="13" fill="${muted}">${escapeXml(subtitle)}</text>`
      : ''
  }
  <line x1="32" y1="88" x2="${width - 32}" y2="88" stroke="${border}" stroke-width="1"/>
  <g font-family="-apple-system, 'Segoe UI', Roboto, Arial, sans-serif">${text}</g>
  <text x="32" y="${height - 24}" font-family="-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="12" fill="${muted}">Word size = number of liked tracks · GenreCloud</text>
</svg>`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(text: string): void {
  downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), JSON_FILENAME);
}

export function downloadSvg(svg: string): void {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), SVG_FILENAME);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not rasterize SVG.'));
    image.src = url;
  });
}

export async function downloadPng(svg: string, scale = 2): Promise<void> {
  const widthMatch = /width="(\d+)"/.exec(svg);
  const heightMatch = /height="(\d+)"/.exec(svg);
  const width = Number(widthMatch?.[1] ?? 1200);
  const height = Number(heightMatch?.[1] ?? 800);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Could not encode PNG.');
    downloadBlob(png, PNG_FILENAME);
  } finally {
    URL.revokeObjectURL(url);
  }
}

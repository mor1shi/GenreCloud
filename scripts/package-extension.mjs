import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'dist', 'public');
const outFile = path.join(publicDir, 'genrecloud-chrome.zip');
const devOutFile = path.join(root, 'public', 'genrecloud-chrome.zip');
const excluded = new Set(['popup.html', 'genrecloud-chrome.zip', 'robots.txt']);

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (excluded.has(relative)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(fullPath, relative)));
    else if ((await stat(fullPath)).isFile()) output.push({ name: relative, fullPath });
  }
  return output;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function makeZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const data = await readFile(file.fullPath);
    const compressed = deflateRawSync(data, { level: 6 });
    const name = Buffer.from(file.name.replaceAll(path.sep, '/'));
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime(new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

await mkdir(publicDir, { recursive: true });
const files = await listFiles(publicDir);
if (!files.some((file) => file.name === 'manifest.json')) {
  throw new Error('Extension package is missing manifest.json.');
}
if (!files.some((file) => file.name === 'index.html')) {
  throw new Error('Extension package is missing index.html.');
}

const zip = await makeZip(files);
await writeFile(outFile, zip);
await writeFile(devOutFile, zip);
const digest = createHash('sha256').update(zip).digest('hex').slice(0, 12);
console.log(`Packaged ${files.length} extension files (${digest}).`);

// Firefox has no service worker background pages and rejects DNR header
// modifications, so it gets its own manifest and an unpacked build.
const firefoxDir = path.join(root, 'dist', 'firefox');
await rm(firefoxDir, { recursive: true, force: true });
await mkdir(firefoxDir, { recursive: true });
for (const file of files) {
  if (file.name === 'rules.json') continue;
  const target = path.join(firefoxDir, file.name);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(file.fullPath, target);
}

const manifest = JSON.parse(
  await readFile(path.join(publicDir, 'manifest.json'), 'utf8'),
);
manifest.permissions = (manifest.permissions ?? []).filter(
  (permission) => permission !== 'declarativeNetRequest',
);
delete manifest.declarative_net_request;
manifest.background = { scripts: ['background.js'] };
manifest.browser_specific_settings = {
  gecko: {
    id: '5f2c9d3a-7b1e-4c8a-9d6f-2a4b6c8e0f13',
    strict_min_version: '128.0',
  },
};
await writeFile(
  path.join(firefoxDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const firefoxFiles = await listFiles(firefoxDir);
const firefoxZip = await makeZip(firefoxFiles);
const firefoxOutFile = path.join(root, 'dist', 'genrecloud-firefox.zip');
await writeFile(firefoxOutFile, firefoxZip);
const firefoxDigest = createHash('sha256')
  .update(firefoxZip)
  .digest('hex')
  .slice(0, 12);
console.log(
  `Packaged ${firefoxFiles.length} Firefox files (${firefoxDigest}) at dist/firefox.`,
);

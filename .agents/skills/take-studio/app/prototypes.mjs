import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const types = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8'
};

export const projectHeaders = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; worker-src blob:; form-action 'self'; frame-ancestors http://127.0.0.1:* https://stage.invalid; object-src 'none'; base-uri 'self'; sandbox allow-scripts allow-same-origin allow-forms",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store'
};

export function projectAsset(files, url, destination) {
  const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
  const path = [pathname, `${pathname.replace(/\/$/, '')}/index.html`.replace(/^\//, '')]
    .find(key => files.has(key)) ?? (destination === 'document' && !extname(pathname) ? 'index.html' : '');
  const body = files.get(path);
  return body ? { body, contentType: types[extname(path).toLowerCase()] || 'application/octet-stream' } : null;
}

export function unpack(entries) {
  if (!Array.isArray(entries) || entries.length > 2500) throw Error('Choose a prototype folder with at most 2,500 files.');
  const files = new Map();
  let bytes = 0;
  for (const [path, encoded] of entries) {
    if (typeof path !== 'string' || path.length > 1024 || path.split('/').some(part => !part || part.startsWith('.') || part === 'node_modules' || /[\\\x00-\x1f]/.test(part)) ||
      typeof encoded !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw Error('The folder contains an invalid file path or asset.');
    const body = Buffer.from(encoded, 'base64');
    bytes += body.length;
    if (bytes > 40_000_000) throw Error('Choose a prototype folder under 40 MB.');
    files.set(path, body);
  }
  return files;
}

export async function serveProject(files) {
  const server = createServer((req, res) => {
    try {
      const asset = ['GET', 'HEAD'].includes(req.method) && projectAsset(files, `http://127.0.0.1${req.url}`, req.headers['sec-fetch-dest'] === 'iframe' ? 'document' : req.headers['sec-fetch-dest']);
      res.writeHead(asset ? 200 : 404, { ...projectHeaders, 'Content-Type': asset?.contentType || 'text/plain' });
      res.end(req.method === 'HEAD' ? undefined : asset?.body || 'File not found.');
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

const run = promisify(execFile);

async function readBuild(folder, prefix = '', files = new Map(), budget = { bytes: 0 }) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(folder, entry.name);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) await readBuild(path, relative + '/', files, budget);
    if (entry.isFile()) {
      const asset = await readFile(path);
      budget.bytes += asset.length;
      if (files.size >= 2500 || budget.bytes > 40_000_000) throw Error('The build exceeds 40 MB or 2,500 files.');
      files.set(relative, asset);
    }
  }
  return files;
}

export async function prepareProject(files) {
  const manifest = files.get('package.json');
  if (manifest && typeof JSON.parse(manifest.toString()).scripts?.build === 'string') {
    const folder = await mkdtemp(join(tmpdir(), 'take-studio-build-'));
    try {
      for (const [name, content] of files) {
        const path = join(folder, name);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content);
      }
      const options = { cwd: folder, timeout: 120_000, maxBuffer: 1_000_000 };
      try {
        await run('npm', [files.has('package-lock.json') ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund'], options);
      } catch (error) {
        throw Error('Dependency installation failed. ' + (error.stderr || error.message).trim().slice(-600));
      }
      try {
        await run('npm', ['run', 'build', '--ignore-scripts'], options);
      } catch (error) {
        throw Error('Prototype build failed. ' + (error.stderr || error.message).trim().slice(-600));
      }
      for (const name of ['dist', 'build', 'out']) {
        const assets = await readBuild(join(folder, name)).catch(error => {
          if (error.code !== 'ENOENT') throw error;
        });
        if (assets?.get('index.html')?.length) return assets;
      }
      throw Error('The build finished without a browser-ready index.html in dist, build, or out.');
    } finally {
      await rm(folder, { force: true, recursive: true });
    }
  }
  if (files.get('index.html')?.length) return files;
  throw Error('Choose a folder with index.html or a package.json containing an npm build script.');
}

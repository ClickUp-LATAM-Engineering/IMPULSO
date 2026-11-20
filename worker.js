// IMPULSO Worker
// - /media/<file> is streamed from the R2 bucket bound as MEDIA (dubbed videos).
// - Everything else is the static site (bound as ASSETS).
// The whole workers.dev hostname sits behind Cloudflare Access, so media needs the
// same partner login as the site; a copied /media/ link does not work without it.

// Letters, digits, spaces and . _ - ( ) / (R2 names uploaded from the dashboard keep their spaces)
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9 ._\/()-]{0,200}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/media/')) return serveMedia(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

async function serveMedia(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (url.pathname === '/media/_check') return checkMedia(env, url.searchParams.get('f') || '');
  let key;
  try { key = decodeURIComponent(url.pathname.slice('/media/'.length)); } catch { key = ''; }
  if (!SAFE_KEY.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });

  // Resolve the stored name first (exact, else tolerant match), and get its size
  let meta = await env.MEDIA.head(key);
  if (!meta) {
    const real = await findKey(env, key);
    if (real) { key = real; meta = await env.MEDIA.head(real); }
  }
  if (!meta) return new Response('Not found', { status: 404 });
  const size = meta.size;

  const headers = new Headers();
  meta.writeHttpMetadata(headers);
  if (!headers.get('content-type') || headers.get('content-type') === 'application/octet-stream') {
    headers.set('content-type', /\.mov$/i.test(key) ? 'video/quicktime' : 'video/mp4');
  }
  headers.set('etag', meta.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');

  // Parse the Range header ourselves so the bytes, status and Content-Range always agree
  const rh = request.headers.get('range');
  let start = 0, end = size - 1, partial = false;
  if (rh) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rh.trim());
    if (!m || (m[1] === '' && m[2] === '')) {
      headers.set('content-range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(Number(m[2]), size - 1); }
    if (start >= size || start > end) {
      headers.set('content-range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    partial = true;
  }
  const length = end - start + 1;
  headers.set('content-length', String(length));
  if (partial) headers.set('content-range', `bytes ${start}-${end}/${size}`);
  const status = partial ? 206 : 200;
  if (request.method === 'HEAD') return new Response(null, { status, headers });

  const object = await env.MEDIA.get(key, { range: { offset: start, length } });
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { status, headers });
}

const norm = (name) => name.normalize('NFC')
  .replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/g, ' ')
  .replace(/\s+(\.[A-Za-z0-9]+)$/, '$1')
  .trim().toLowerCase();
const base = (name) => name.slice(name.lastIndexOf('/') + 1);

let keyCache = null; // { at, keys } per isolate, refreshed every 5 minutes
async function findKey(env, wanted) {
  if (!keyCache || Date.now() - keyCache.at > 300000) {
    const keys = [];
    let cursor;
    do {
      const page = await env.MEDIA.list({ cursor, limit: 1000 });
      for (const o of page.objects) keys.push(o.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor && keys.length < 5000);
    keyCache = { at: Date.now(), keys };
  }
  const w = norm(wanted), wb = norm(base(wanted));
  return keyCache.keys.find((k) => norm(k) === w)
    || keyCache.keys.find((k) => norm(base(k)) === wb)
    || null;
}

// Diagnostics (needs the partner login like everything else): which object a name
// resolves to, its size and type, and the first bytes of the file.
async function checkMedia(env, name) {
  const out = { asked: name, bucketBound: !!env.MEDIA };
  if (!env.MEDIA) return json(out);
  let real = null;
  const exact = await env.MEDIA.head(name);
  if (exact) real = name; else real = await findKey(env, name);
  out.resolvedTo = real;
  if (real) {
    const h = exact || await env.MEDIA.head(real);
    out.size = h.size;
    out.contentType = h.httpMetadata && h.httpMetadata.contentType;
    const head = await env.MEDIA.get(real, { range: { offset: 0, length: 64 } });
    const bytes = new Uint8Array(await head.arrayBuffer());
    const ascii = Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    out.firstBytes = ascii; // "ftyp" near the start = MP4/MOV container
    out.moovFirst = ascii.indexOf('moov') !== -1 ? 'yes' : 'not in the first 64 bytes';
  }
  const list = await env.MEDIA.list({ limit: 100 });
  out.bucket = list.objects.map((o) => ({ key: o.key, size: o.size }));
  return json(out);
}
const json = (o) => new Response(JSON.stringify(o, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

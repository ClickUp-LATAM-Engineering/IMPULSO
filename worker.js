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
  let key;
  try { key = decodeURIComponent(url.pathname.slice('/media/'.length)); } catch { key = ''; }
  if (!SAFE_KEY.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });

  // R2 parses the Range and conditional headers itself; video players need Range to seek.
  const opts = { range: request.headers, onlyIf: request.headers };
  let object = await env.MEDIA.get(key, opts);
  if (object === null) {
    // Names typed in the dashboard often differ invisibly (double or trailing spaces,
    // non-breaking spaces, case, a folder). Find the object whose normalised name matches.
    const real = await findKey(env, key);
    if (real) object = await env.MEDIA.get(real, opts);
  }
  if (object === null) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, max-age=3600');
  headers.set('x-content-type-options', 'nosniff');
  if (!headers.has('content-type') && /\.mp4$/i.test(key)) headers.set('content-type', 'video/mp4');

  // Precondition matched (e.g. If-None-Match): no body
  if (!('body' in object)) return new Response(null, { status: 304, headers });

  let status = 200;
  let length = object.size;
  const r = object.range;
  if (r && request.headers.has('range')) {
    let start, end;
    if ('suffix' in r) { start = Math.max(0, object.size - r.suffix); end = object.size - 1; }
    else { start = r.offset || 0; end = r.length !== undefined ? start + r.length - 1 : object.size - 1; }
    end = Math.min(end, object.size - 1);
    length = end - start + 1;
    headers.set('content-range', `bytes ${start}-${end}/${object.size}`);
    status = 206;
  }
  headers.set('content-length', String(length));
  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
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

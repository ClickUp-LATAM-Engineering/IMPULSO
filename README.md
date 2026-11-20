# IMPULSO

Partner enablement site for ClickUp LATAM: a single static page in Portuguese, Spanish and English
covering the IMPULSO manifesto, the method (Strategy, Intake, Execution, Reporting, PTA), resources
and governance, plus a built-in FAQ assistant.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole site: markup, styles, translations and scripts |
| `faq.js` | FAQ assistant content (`FAQ_DATA`) and its topic menu (`FAQ_TOPICS`) |
| `epic-release/index.html` | EPIC November 4 Release guide, partner edition (shown in the Epic Release tab) |
| `*.png`, `*.jpg`, `*.svg` | Images. `_PT` / `_ES` pairs swap with the language toggle (EN uses ES) |

There is no build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Editing content

- **Page text** lives in the `translations` object in `index.html` (`pt`, `es`, `en`). Elements pick it
  up via `data-i18n="key"`. A key missing in one language falls back to Spanish.
- **FAQ answers** live only in `faq.js`. When you add, remove or reorder entries, update the `idx`
  lists in `FAQ_TOPICS` at the bottom of the same file so every question stays reachable from the menu.
- **Prices in the FAQ** are quoted to customers by partners. Re-check them against
  clickup.com/pricing whenever pricing changes.
- **Videos** are referenced by their 11-character YouTube ID (`openVideoPlayer('XXXXXXXXXXX')`).
  Invalid IDs are ignored on purpose.
- **External links** on resource cards use `openExternal('https://...')`, which opens a new tab
  without giving it access to this page.
- **Unfinished resource cards** are kept in a commented block in the Sales category of the Resources
  tab, with steps for publishing them.

## Epic Release tab

`epic-release/index.html` is an export of the internal ClickUp Artifact "The EPIC November 4 Release",
edited to be partner ready: the confidentiality banner reads "Partner Ready", internal tools (Ask a
question, Notes, Key points, Questions and answers, Admin/analytics) are hidden, employee names,
internal-doc links, internal readiness notes and unannounced pricing plans were removed, and videos
show a "localized video coming soon" placeholder. The tab loads it on first open and keeps it in the
same language as IMPULSO (via the `epic-lang` browser setting and a message to the frame).

To publish localized videos later, re-export the Artifact with the new video files and repeat the
partner-ready edits, or ask for the placeholder layer (`#partner-ready-layer`) to be adjusted.

## Dubbed videos (Cloudflare R2)

Videos are stored in the R2 bucket `impulso-media` and served by `worker.js` at
`/media/<file>`, behind the same Cloudflare Access login as the site. A copied
`/media/` link does not work without signing in.

- `wrangler.jsonc` binds the bucket as `MEDIA` and the site files as `ASSETS`.
  Its `name` must stay `impulso-clickup`.
- `.assetsignore` keeps `worker.js`, `wrangler.jsonc` and this README off the site.
- File names: lower case, no spaces, e.g. `workflows-es.mp4`, `workflows-pt.mp4`.
- Recommended encoding: 1080p H.264 MP4 (about 60 MB per minute). 4K works but
  uses the 10 GB free storage roughly six times faster.

## Security notes

The page sets a Content-Security-Policy in a `<meta>` tag. If you add a new external script, font,
image host or embed, add its origin to that policy or the browser will block it.

# IMPULSO

Partner enablement site for ClickUp LATAM: a single static page in Portuguese, Spanish and English
covering the IMPULSO manifesto, the method (Strategy, Intake, Execution, Reporting, PTA), resources
and governance, plus a built-in FAQ assistant.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole site: markup, styles, translations and scripts |
| `faq.js` | FAQ assistant content (`FAQ_DATA`) and its topic menu (`FAQ_TOPICS`) |
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

## Security notes

The page sets a Content-Security-Policy in a `<meta>` tag. If you add a new external script, font,
image host or embed, add its origin to that policy or the browser will block it.

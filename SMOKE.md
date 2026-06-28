# Smoke checklist — Khiip plugin

Manual test to run before cutting any release. ~2-3 minutes end-to-end.

## Setup

- [ ] Daemon running on `http://127.0.0.1:8478` (start with `khiipd serve` in the daemon repo)
- [ ] `~/.config/khiip/auth.toml` exists (created by daemon on first launch)
- [ ] Obsidian open with a vault that matches the daemon's `vault_path` (default `~/khiip-vault`)
- [ ] Plugin installed at `<vault>/.obsidian/plugins/khiip/` (symlink during dev, BRAT once a tagged release exists)
- [ ] Plugin enabled: Settings → Community plugins → **Khiip** toggle on

## Daemon connection

- [ ] Open the right-pane sidebar via the ribbon link icon (or run `Khiip: Recall by query`)
- [ ] Status row shows a **green dot** + `daemon ok · 6 sources · v<version>` (source count tracks the daemon's registered extractors — x, reddit, youtube, wiki, pdf, web at v0.1.5)
- [ ] Stop the daemon (`pkill -f 'khiipd serve'`); within 30s the dot turns **red** + reads `daemon unreachable`
- [ ] Restart the daemon; dot returns to green within 30s

## Capture (command palette)

- [ ] `cmd+P` → `Khiip: Capture URL`
- [ ] Modal opens with URL input focused
- [ ] Paste `https://example.com/` → Enter (or click **Capture**)
- [ ] Notice appears: `Captured: Example Domain` (or similar title)
- [ ] The captured note opens in the active leaf with YAML frontmatter + body
- [ ] Sidebar **Recent captures** refreshes to show the new entry at top

## Capture (cross-source spot check)

Repeat with at least 2 of the 6 v0 extractors to exercise the dispatch. Web is the catch-all fallback and the most-common path for new users — exercise it explicitly:

- [ ] Web article (e.g. an MDN page) — source pill shows `web`
- [ ] X post (e.g. `https://x.com/jack/status/20`) — source pill shows `x`
- [ ] Reddit thread (e.g. an `old.reddit.com` or `reddit.com` link) — source pill shows `reddit`
- [ ] Wikipedia article (e.g. `https://en.wikipedia.org/wiki/Khipu`) — source pill shows `wiki`
- [ ] PDF (e.g. an arXiv PDF link) — source pill shows `pdf`
- [ ] YouTube (e.g. `https://www.youtube.com/watch?v=...`) — source pill shows `youtube`

Each capture should land within a few seconds; the daemon's fallback chain handles upstream failures.

## Recall

- [ ] Type a query into the sidebar **Recall** box → press Enter (or click **Search**)
- [ ] Results render with title + source pill + cosine score
- [ ] Click any result → file opens in the active leaf
- [ ] Empty query: button + Enter both no-op silently (no error)

## Settings tab

- [ ] `cmd+P` → `Khiip: Open daemon settings` opens the Khiip settings tab
- [ ] **Daemon URL** field shows `http://127.0.0.1:8478` by default
- [ ] **API key override** field is empty (password input — typing should show dots)
- [ ] **Daemon status** section populates with: version · schema version · vault path · extractors list · embedder
- [ ] Set daemon URL to a bogus value (e.g. `http://127.0.0.1:1`) → reload the sidebar → status dot turns red. Revert.

## Error paths

- [ ] Capture an invalid URL (e.g. `ftp://nothing.invalid/`, or a bare host like `x.com/jack` with no scheme) → Notice shows a readable daemon detail (e.g. `422: URL scheme should be 'http' or 'https'`), NOT `[object Object]` and NOT a thrown exception in console
- [ ] Stop daemon → try to capture → Notice shows network-error message that includes the host but NOT any embedded credentials (the message should mention the host like `127.0.0.1:8478` without echoing any token)
- [ ] Restart daemon → next capture succeeds

## Pre-release verification (before tag-cutting)

- [ ] `npm run build` finishes clean (typecheck + esbuild production)
- [ ] `main.js` is non-empty (`wc -l main.js` > 0)
- [ ] `manifest.json` `version` matches the intended tag (no `v` prefix)
- [ ] `versions.json` includes the new version mapped to the current `minAppVersion`
- [ ] No uncommitted changes on `main` other than the version bump

## Cutting the release

```bash
npm version patch    # or minor / major / explicit semver
git push origin main
# Push the SPECIFIC tag only — NOT `--tags` (which would push every stray local tag):
VERSION=$(node -e "console.log(require('./package.json').version)")
git push origin "$VERSION"
```

GitHub Actions `release.yml` runs:

- [ ] Tag↔manifest.version check passes
- [ ] Build succeeds
- [ ] Release page created with `main.js`, `manifest.json`, `styles.css` attached as flat assets
- [ ] BRAT polls and offers the update on next refresh

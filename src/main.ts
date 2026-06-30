import { Notice, Plugin, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { KhiipClient, KhiipError, discoverApiKey } from "./client";
import { DEFAULT_SETTINGS, KhiipSettings, KhiipSettingTab } from "./settings";
import { KHIIP_VIEW_TYPE, KhiipSidebarView } from "./sidebar";
import { CaptureUrlModal, RecaptureChoiceModal } from "./commands";
import { normalizeCaptureUrl, urlAtCursor, isCaptureUrl, isLoopbackUrl } from "./url";
import { registerKhiipIcons, sourceMeta, parseIso } from "./brand";
import type { Capture } from "./types";

export default class KhiipPlugin extends Plugin {
	settings!: KhiipSettings;
	client!: KhiipClient;
	// Cached daemon vault root, populated on first /api/v1/meta success.
	// Used to make the cross-vault open-capture notice point at the real
	// on-disk path rather than just the daemon-vault-relative fragment.
	private daemonVaultRoot: string | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.rebuildClient();
		registerKhiipIcons();

		// Paint the source glyph on every `[!khiip-*]` callout imperatively, so the
		// icon never depends on the CSS `--callout-icon` resolving AFTER the custom
		// glyphs are registered. A note already open at app launch paints its callout
		// before onload registers the glyphs, so it would otherwise fall back to
		// Obsidian's default pencil until a manual reload. This runs on every render
		// (incl. restored notes) and reuses SOURCE_META as the single icon source.
		this.registerMarkdownPostProcessor((el) => {
			el.querySelectorAll<HTMLElement>('.callout[data-callout^="khiip-"]').forEach((callout) => {
				const src = callout.dataset.callout?.slice("khiip-".length) ?? "";
				const iconEl = callout.querySelector<HTMLElement>(".callout-icon");
				if (iconEl) setIcon(iconEl, sourceMeta(src).icon);
			});
		});

		this.registerView(KHIIP_VIEW_TYPE, leaf => new KhiipSidebarView(leaf, this));

		this.addCommand({
			id: "capture-url",
			name: "Capture URL",
			callback: () => { void this.openCaptureModal(); },
		});

		this.addCommand({
			id: "recall",
			name: "Recall by query",
			callback: async () => {
				await this.activateSidebar();
				this.focusSidebarSearch();
			},
		});

		this.addCommand({
			id: "open-settings",
			name: "Open daemon settings",
			callback: () => {
				// Obsidian's settings dialog isn't on the public API surface;
				// the (app as any).setting cast matches the convention used
				// across community plugins (LinkPlanet, Templater, etc.).
				const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
				if (!setting) {
					new Notice("Khiip: settings UI unavailable on this Obsidian version.");
					return;
				}
				setting.open();
				setting.openTabById(this.manifest.id);
			},
		});

		this.addRibbonIcon("khiip-mark", "Khiip — open sidebar", () => { void this.activateSidebar(); });

		// Capture-while-writing: right-click a link (selection, markdown link, or
		// bare URL under the cursor) in the editor to capture it into the substrate
		// without leaving the note.
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const cur = editor.getCursor();
				const sel = editor.getSelection().trim();
				const url = sel && isCaptureUrl(sel)
					? sel
					: urlAtCursor(editor.getLine(cur.line), cur.ch);
				if (!url) return;
				menu.addItem(item =>
					item
						.setTitle("Capture this link with Khiip")
						.setIcon("link")
						.onClick(() => { void this.captureUrl(url); }),
				);
			}),
		);

		this.addSettingTab(new KhiipSettingTab(this.app, this));

		// Best-effort warm: lets openCapture render the absolute on-disk path
		// in cross-vault notices. Failure is silent — sidebar will show
		// "daemon unreachable" if it matters.
		void this.refreshDaemonMeta();
	}

	onunload(): void {
		// Obsidian detaches registered views on plugin disable automatically.
	}

	async refreshDaemonMeta(): Promise<void> {
		try {
			const meta = await this.client.meta();
			this.daemonVaultRoot = meta.config.vault_path;
		} catch {
			// Leave the cache alone; previous value (or null) is still useful.
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<KhiipSettings>);
		// Defensive: a hand-edited / partially-written data.json could carry
		// non-string values; coerce so downstream trims / URL parsing can't throw.
		this.settings.daemonUrl = String(this.settings.daemonUrl || DEFAULT_SETTINGS.daemonUrl);
		this.settings.apiKeyOverride = String(this.settings.apiKeyOverride ?? "");
	}

	// One place for "what should we show the user when a request failed". KhiipError
	// extends Error, so the single Error branch covers both.
	private errMsg(e: unknown, fallback: string): string {
		return e instanceof Error ? e.message : fallback;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.rebuildClient();
		void this.refreshDaemonMeta();
	}

	rebuildClient(): void {
		const override = this.settings.apiKeyOverride.trim();
		// Only auto-discover the local on-disk key when the daemon is loopback. A
		// remote/Tailscale Daemon URL must use an explicitly-pasted key — otherwise
		// the locally-discovered key would be sent as a Bearer token to a host the
		// user merely typed in. (Settings documents pasting a key for remote setups.)
		const local = isLoopbackUrl(this.settings.daemonUrl);
		const apiKey = override || (local ? discoverApiKey() ?? "" : "");
		if (!apiKey) {
			new Notice(
				local
					? "Khiip: no API key found. Start the daemon (it auto-generates ~/.config/khiip/auth.toml) or paste a key in plugin settings."
					: "Khiip: remote daemon URL set — paste the daemon's API key in plugin settings (the local key isn't sent to remote hosts).",
				8000,
			);
		}
		this.client = new KhiipClient(this.settings.daemonUrl, apiKey);
	}

	// Open the capture modal, pre-filling from the clipboard when it holds a web
	// link — the common "I just copied a URL, now capture it" flow becomes a single
	// confirm instead of paste-then-enter. Shared by the command + sidebar button.
	async openCaptureModal(): Promise<void> {
		new CaptureUrlModal(this.app, async (url) => { await this.captureUrl(url); }, await this.clipboardUrl()).open();
	}

	private async clipboardUrl(): Promise<string> {
		try {
			const text = (await navigator.clipboard.readText()).trim();
			if (text && isCaptureUrl(text)) return text;
		} catch {
			// Clipboard unavailable or permission denied — open an empty modal.
		}
		return "";
	}

	async captureUrl(rawUrl: string): Promise<void> {
		// Browser-style normalization: accept bare hosts ("x.com/jack") by
		// prepending a scheme, so a missing https:// never looks "broken".
		const normalized = normalizeCaptureUrl(rawUrl);
		if ("error" in normalized) {
			new Notice(`Khiip: ${normalized.error}`, 6000);
			return;
		}
		let capture: Capture;
		try {
			capture = await this.client.capture({ url: normalized.url });
		} catch (e) {
			// Normalization handles the common no-scheme case, so a 422 here means
			// the daemon couldn't make sense of the link — show a plain-English
			// line instead of the raw validation detail / status code.
			if (e instanceof KhiipError && e.status === 422) {
				new Notice(`Khiip: couldn't read that link — check it's a valid web URL (e.g. https://example.com).`, 8000);
				return;
			}
			const msg = this.errMsg(e, "Capture failed");
			new Notice(`Khiip: ${msg}`, 8000);
			return;
		}

		// The daemon dedups by URL: a known URL returns the EXISTING capture and
		// writes no new note. There's no status signal for that, so we infer it
		// from the record's age — a freshly-created capture is recorded ~now,
		// while a dedup hit returns a record minutes/hours/days old. On a hit we
		// don't lie with "Captured"; we let the user open it or re-capture fresh.
		if (this.captureIsPreexisting(capture)) {
			new RecaptureChoiceModal(this.app, capture, {
				onOpen: () => { void this.openCapture(capture); },
				onRecapture: () => { void this.refreshCapture(capture); },
			}).open();
			return;
		}

		new Notice(`Captured: ${capture.title ?? capture.url}`, 4000);
		await this.openCapture(capture);
		this.refreshSidebar();
	}

	// A capture recorded more than this long before the response arrived must
	// be a dedup hit, not something we just created. 60s comfortably exceeds any
	// single extraction (slowest sources finish well under that).
	private captureIsPreexisting(capture: Capture): boolean {
		const recorded = parseIso(capture.recorded_at);
		if (recorded === null) return false;
		return Date.now() - recorded > 60_000;
	}

	// Capture ids with an in-flight refetch — guards against rapid repeat ↻
	// clicks firing multiple refetches for one capture (each would create a
	// redundant version). The daemon resolves refetch to the chain head so this
	// can't fork the history, but debouncing avoids the redundant versions.
	private refreshing = new Set<string>();

	// Re-capture a fresh version of an existing capture (refetch → new capture
	// supersedes the old; history preserved). Used by the recapture prompt and
	// the sidebar ↻ button.
	async refreshCapture(existing: Capture): Promise<void> {
		if (this.refreshing.has(existing.id)) return;
		this.refreshing.add(existing.id);
		new Notice(`Re-capturing ${existing.title ?? existing.url}…`, 3000);
		try {
			const fresh = await this.client.refetch(existing.id, "extraction");
			new Notice(`Refreshed: ${fresh.title ?? fresh.url} — new version saved`, 4000);
			await this.openCapture(fresh);
			this.refreshSidebar();
		} catch (e) {
			const msg = this.errMsg(e, "Re-capture failed");
			new Notice(`Khiip: ${msg}`, 8000);
		} finally {
			this.refreshing.delete(existing.id);
		}
	}

	async openCapture(capture: Capture): Promise<void> {
		const path = capture.vault_path;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.openInReadingView(file);
			return;
		}
		// Not in Obsidian's in-memory index. A capture the daemon just wrote may
		// not be indexed yet — the file-watcher lags a beat behind an external
		// write — so a null here does NOT mean "wrong vault". If the file is
		// physically inside this vault, poll briefly for the index to catch up.
		if (await this.app.vault.adapter.exists(path)) {
			const indexed = await this.waitForFile(path);
			if (indexed) {
				await this.openInReadingView(indexed);
				return;
			}
			// On disk in this vault, but Obsidian still hasn't indexed it (rare).
			// Accurate message — it's saved, just not yet visible in the file tree.
			new Notice(`Saved to ${path} — Obsidian is still indexing it; it'll appear in a moment.`, 6000);
			return;
		}
		// Genuinely not under this Obsidian vault (daemon vault ≠ Obsidian vault).
		// vault_path is daemon-vault-relative; compose with the cached root so the
		// notice points at a real on-disk path.
		const absolute = this.daemonVaultRoot
			? `${this.daemonVaultRoot.replace(/\/+$/, "")}/${path}`
			: path;
		new Notice(
			`Capture saved at ${absolute} — not in this Obsidian vault. ` +
			`Point the daemon's vault at this Obsidian vault (or a subfolder) to open captures inline.`,
			10000,
		);
	}

	// Open a capture in Reading view. Captures are read artifacts (recall → open →
	// read), so they land fully rendered — no Live-Preview source-flip when you
	// click into a callout card, and no accidental edits. Only OUR captures get
	// this; every other file you open uses Obsidian's global default. Cmd-E drops
	// into edit mode any time you want to annotate.
	private openInReadingView(file: TFile): Promise<void> {
		return this.app.workspace.getLeaf().openFile(file, { state: { mode: "preview" } });
	}

	// Poll Obsidian's file index for a path known to exist on disk, giving the
	// watcher time to pick up a just-written file. ~1.8s max; returns early.
	private async waitForFile(path: string, tries = 12, delayMs = 150): Promise<TFile | null> {
		for (let i = 0; i < tries; i++) {
			const f = this.app.vault.getAbstractFileByPath(path);
			if (f instanceof TFile) return f;
			await new Promise(resolve => window.setTimeout(resolve, delayMs));
		}
		const f = this.app.vault.getAbstractFileByPath(path);
		return f instanceof TFile ? f : null;
	}

	async activateSidebar(): Promise<WorkspaceLeaf | null> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(KHIIP_VIEW_TYPE);
		let leaf: WorkspaceLeaf | null;
		if (existing.length > 0) {
			leaf = existing[0] ?? null;
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: KHIIP_VIEW_TYPE, active: true });
			}
		}
		if (leaf) await workspace.revealLeaf(leaf);
		return leaf;
	}

	focusSidebarSearch(): void {
		const leaves = this.app.workspace.getLeavesOfType(KHIIP_VIEW_TYPE);
		const view = leaves[0]?.view;
		if (view instanceof KhiipSidebarView) {
			view.focusSearch();
		}
	}

	refreshSidebar(): void {
		const leaves = this.app.workspace.getLeavesOfType(KHIIP_VIEW_TYPE);
		for (const leaf of leaves) {
			if (leaf.view instanceof KhiipSidebarView) {
				void leaf.view.refreshRecents();
			}
		}
	}
}

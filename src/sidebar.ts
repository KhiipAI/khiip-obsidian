import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type KhiipPlugin from "./main";
import type { Capture } from "./types";
import { renderKhiipMark, sourceMeta, formatRelative, dayBucket } from "./brand";

export const KHIIP_VIEW_TYPE = "khiip-sidebar";
const STATUS_POLL_MS = 30_000;

// Shown in the daemon-down setup card. `uv tool install` auto-downloads its own Python, so
// this is the lowest-prereq path for the technical launch cohort; pip is the documented fallback.
const SETUP_CMD = "uv tool install khiip\nkhiipd serve";
const SETUP_GUIDE_URL = "https://docs.khiip.com/start/installation/";

export class KhiipSidebarView extends ItemView {
	private statusDot!: HTMLElement;
	private statusText!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private resultsContainer!: HTMLElement;
	private recentsContainer!: HTMLElement;
	private recentsCount!: HTMLElement;
	private setupEl!: HTMLElement;
	private connectedEl!: HTMLElement;
	// Monotonic request tokens — drop a stale response when a newer search/refresh
	// has been issued, so out-of-order completion can't overwrite fresh results.
	private searchGen = 0;
	private recentsGen = 0;

	constructor(leaf: WorkspaceLeaf, private plugin: KhiipPlugin) {
		super(leaf);
	}

	getViewType(): string { return KHIIP_VIEW_TYPE; }
	getDisplayText(): string { return "Khiip"; }
	getIcon(): string { return "khiip-mark"; }

	async onOpen(): Promise<void> {
		this.buildUI();
		void this.refreshStatus();
		void this.refreshRecents();
		// Obsidian clears registered intervals on view detach, but it does NOT
		// detach hidden sidebar tabs — so we gate inside the callback to avoid
		// burning health requests while the user has Khiip behind another tab.
		this.registerInterval(window.setInterval(() => {
			if (this.containerEl.isShown()) void this.refreshStatus();
		}, STATUS_POLL_MS));

		// Live memory feed: when the user switches to the Khiip tab, pull the latest
		// recents so captures made by an agent / CLI / MCP since they last looked
		// show up without a manual refresh.
		this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
			if (leaf === this.leaf) void this.refreshRecents();
		}));
	}

	async onClose(): Promise<void> {
		// nothing extra — interval is cleared by Component lifecycle
	}

	focusSearch(): void {
		this.searchInput?.focus();
	}

	refreshRecents(): Promise<void> {
		return this.doRefreshRecents();
	}

	private buildUI(): void {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass("khiip-sidebar");

		// Brand header — khipu mark + wordmark, with the daemon status dot pinned
		// right and the detailed status line beneath.
		const header = root.createDiv({ cls: "khiip-header" });
		const brandRow = header.createDiv({ cls: "khiip-brand-row" });
		const brand = brandRow.createDiv({ cls: "khiip-brand" });
		renderKhiipMark(brand, "khiip-mark");
		brand.createSpan({ cls: "khiip-wordmark", text: "Khiip" });
		this.statusDot = brandRow.createSpan({ cls: "khiip-status-dot khiip-status-unknown" });
		this.statusText = header.createDiv({ cls: "khiip-status-text", text: "checking daemon…" });

		// Setup card — shown only when the daemon is unreachable (toggled in refreshStatus).
		// Built once here so the copy command + Test-connection button stay wired.
		this.setupEl = root.createDiv({ cls: "khiip-setup" });
		this.setupEl.hide();
		this.buildSetupCard(this.setupEl);

		// Connected surface — capture + recall + recents. Hidden while the daemon is down,
		// so a daemon-less user sees the setup card instead of failing actions.
		const connected = root.createDiv({ cls: "khiip-connected" });
		this.connectedEl = connected;

		// Primary action lives on the persistent surface — not just the command
		// palette. Pre-fills from the clipboard via the plugin's openCaptureModal.
		const captureSection = connected.createDiv({ cls: "khiip-section" });
		const captureBtn = captureSection.createEl("button", { cls: "khiip-capture-btn mod-cta", attr: { "aria-label": "Capture a URL" } });
		setIcon(captureBtn.createSpan({ cls: "khiip-capture-btn-icon" }), "plus");
		captureBtn.createSpan({ text: "Capture URL" });
		captureBtn.onclick = () => { void this.plugin.openCaptureModal(); };

		const searchSection = connected.createDiv({ cls: "khiip-section" });
		searchSection.createEl("h4", { text: "Recall" });
		const searchRow = searchSection.createDiv({ cls: "khiip-search-row" });
		this.searchInput = searchRow.createEl("input", {
			type: "text",
			cls: "khiip-search-input",
			attr: { placeholder: "Search captures…" },
		});
		const searchBtn = searchRow.createEl("button", { cls: "khiip-search-btn mod-cta", attr: { "aria-label": "Search" } });
		setIcon(searchBtn, "search");
		searchBtn.onclick = () => { void this.doSearch(); };
		this.registerDomEvent(this.searchInput, "keydown", (ev) => {
			if (ev.key === "Enter") {
				ev.preventDefault();
				void this.doSearch();
			}
		});
		this.resultsContainer = searchSection.createDiv({ cls: "khiip-results" });

		const recentsSection = connected.createDiv({ cls: "khiip-section" });
		const recentsHeader = recentsSection.createDiv({ cls: "khiip-section-header" });
		const recentsTitle = recentsHeader.createEl("h4", { text: "Recent captures" });
		this.recentsCount = recentsTitle.createSpan({ cls: "khiip-section-count" });
		// (No manual refresh button — recents auto-refresh on tab focus + status poll;
		// per-row re-capture lives in the row right-click menu.)
		this.recentsContainer = recentsSection.createDiv({ cls: "khiip-recents" });
	}

	// Daemon-down setup card: tells a plugin-first user how to install + start the daemon,
	// with a one-click connection re-check and a docs deep-link. Built with createEl (no
	// innerHTML / inline styles) per Obsidian's plugin guidelines.
	private buildSetupCard(parent: HTMLElement): void {
		parent.empty();
		parent.createDiv({ cls: "khiip-setup-title", text: "Start the Khiip daemon" });
		parent.createEl("p", {
			cls: "khiip-setup-lead",
			text: "Khiip captures and recalls through a small daemon on your machine. Install it once, then start it:",
		});

		const cmdBox = parent.createDiv({ cls: "khiip-setup-cmd" });
		cmdBox.createEl("code", { cls: "khiip-setup-cmd-text", text: SETUP_CMD });
		const copyBtn = cmdBox.createEl("button", { cls: "khiip-setup-copy", attr: { "aria-label": "Copy commands" } });
		setIcon(copyBtn, "copy");
		copyBtn.onclick = () => {
			void navigator.clipboard.writeText(SETUP_CMD);
			new Notice("Copied install commands");
		};

		const actions = parent.createDiv({ cls: "khiip-setup-actions" });
		const testBtn = actions.createEl("button", { cls: "khiip-setup-test mod-cta", text: "Test connection" });
		testBtn.onclick = () => {
			testBtn.disabled = true;
			testBtn.setText("Checking…");
			void (async () => {
				await this.refreshStatus();
				await this.refreshRecents();
				testBtn.setText("Test connection");
				testBtn.disabled = false;
			})();
		};
		const guide = actions.createEl("a", {
			cls: "khiip-setup-guide",
			text: "Setup guide ↗",
			href: SETUP_GUIDE_URL,
		});
		guide.setAttr("target", "_blank");
		guide.setAttr("rel", "noopener");

		parent.createEl("p", {
			cls: "khiip-setup-note",
			text: "Runs locally on 127.0.0.1:8478 — nothing leaves your machine. On Tailscale or a remote host? Set the daemon URL in settings.",
		});
	}

	private async doSearch(): Promise<void> {
		const q = this.searchInput.value.trim();
		if (!q) return;
		const gen = ++this.searchGen;
		this.resultsContainer.empty();
		this.resultsContainer.createEl("div", { text: "Searching…", cls: "khiip-loading" });
		try {
			const resp = await this.plugin.client.recall(q, 10);
			if (gen !== this.searchGen) return; // a newer search superseded this one
			this.resultsContainer.empty();
			// Recall is score-ranked, not chronological — show the score, no day grouping.
			this.renderResults(this.resultsContainer, resp.results.map(h => ({ capture: h.capture, score: h.score })), {
				empty: `No matches for “${q}”`,
			});
		} catch (e) {
			if (gen !== this.searchGen) return;
			this.resultsContainer.empty();
			this.resultsContainer.createEl("div", {
				text: e instanceof Error ? e.message : "Recall failed",
				cls: "khiip-error",
			});
		}
	}

	private async doRefreshRecents(): Promise<void> {
		const gen = ++this.recentsGen;
		this.recentsContainer.empty();
		this.recentsContainer.createEl("div", { text: "Loading…", cls: "khiip-loading" });
		try {
			const recents = await this.plugin.client.listCaptures({ limit: 10, offset: 0 });
			if (gen !== this.recentsGen) return; // a newer refresh superseded this one
			this.recentsContainer.empty();
			this.recentsCount.setText(recents.length ? ` · ${recents.length}` : "");
			// Recents are newest-first — group by day so the list reads like a timeline.
			this.renderResults(this.recentsContainer, recents.map(c => ({ capture: c })), {
				grouped: true,
				empty: "No captures yet — capture a URL to get started",
			});
		} catch (e) {
			if (gen !== this.recentsGen) return;
			this.recentsContainer.empty();
			this.recentsCount.setText("");
			this.recentsContainer.createEl("div", {
				text: e instanceof Error ? e.message : "Could not load recent captures",
				cls: "khiip-error",
			});
		}
	}

	private renderResults(
		parent: HTMLElement,
		items: Array<{ capture: Capture; score?: number }>,
		opts: { grouped?: boolean; empty?: string } = {},
	): void {
		if (items.length === 0) {
			parent.createEl("div", { text: opts.empty ?? "Nothing yet", cls: "khiip-empty" });
			return;
		}
		let lastBucket = "";
		for (const item of items) {
			if (opts.grouped) {
				const bucket = dayBucket(item.capture.recorded_at);
				if (bucket !== lastBucket) {
					parent.createDiv({ cls: "khiip-day-divider", text: bucket });
					lastBucket = bucket;
				}
			}
			this.renderRow(parent, item);
		}
	}

	private renderRow(parent: HTMLElement, { capture, score }: { capture: Capture; score?: number }): void {
		const meta = sourceMeta(capture.source);
		const row = parent.createDiv({ cls: "khiip-result-row" });

		// Leading source icon — tinted to the platform colour via the source class.
		const icon = row.createSpan({ cls: `khiip-row-icon khiip-source-${capture.source}` });
		setIcon(icon, meta.icon);

		const body = row.createDiv({ cls: "khiip-result-body" });
		body.createDiv({ cls: "khiip-result-title", text: capture.title ?? capture.url });
		const metaRow = body.createDiv({ cls: "khiip-result-meta" });
		metaRow.createSpan({ cls: `khiip-source khiip-source-${capture.source}`, text: meta.label });
		// Author of the captured post — sits between the source and the timestamp so you
		// can scan WHO wrote each capture at a glance (X → display name, YouTube → channel,
		// Reddit → poster, Web → byline). Omitted when the source carries no single author
		// (e.g. Wikipedia), so the row gracefully reads "Wikipedia · 6h".
		if (capture.author) {
			metaRow.createSpan({ cls: "khiip-row-author", text: capture.author });
		}
		const rel = formatRelative(capture.recorded_at);
		if (rel) metaRow.createSpan({ cls: "khiip-time", text: rel });
		if (typeof score === "number") {
			metaRow.createSpan({ cls: "khiip-score", text: score.toFixed(2) });
		}
		body.onclick = () => { void this.plugin.openCapture(capture); };

		// Re-capture lives behind a right-click menu, not an always-present icon —
		// refreshing re-fetches the source and writes a new version, so it shouldn't
		// be a stray hover-click away.
		this.registerDomEvent(row, "contextmenu", (ev) => {
			ev.preventDefault();
			const menu = new Menu();
			menu.addItem((item) =>
				item.setTitle("Open").setIcon("file-text").onClick(() => { void this.plugin.openCapture(capture); }),
			);
			menu.addItem((item) =>
				item
					.setTitle("Re-capture a fresh version")
					.setIcon("refresh-cw")
					.onClick(() => { void this.plugin.refreshCapture(capture); }),
			);
			menu.addItem((item) =>
				item
					.setTitle("Copy source URL")
					.setIcon("link")
					.onClick(() => { void navigator.clipboard.writeText(capture.url); }),
			);
			menu.showAtMouseEvent(ev);
		});
	}

	private async refreshStatus(): Promise<void> {
		try {
			const h = await this.plugin.client.health();
			this.statusDot.removeClass("khiip-status-unknown", "khiip-status-down", "khiip-status-degraded", "khiip-status-ok");
			if (h.status === "ok") {
				this.statusDot.addClass("khiip-status-ok");
				this.statusText.setText(`daemon ok · ${h.extractors.length} sources · v${h.version}`);
			} else {
				this.statusDot.addClass("khiip-status-degraded");
				const degraded = h.extractors.filter(e => !e.ok).map(e => e.source).join(", ") || "(unknown)";
				this.statusText.setText(`degraded · ${degraded}`);
			}
			// Daemon reachable (ok or degraded) → show the connected surface, hide setup.
			this.showConnected(true);
		} catch {
			this.statusDot.removeClass("khiip-status-ok", "khiip-status-unknown", "khiip-status-degraded");
			this.statusDot.addClass("khiip-status-down");
			this.statusText.setText("daemon unreachable");
			// Daemon down → surface the setup card, hide the (would-fail) actions.
			this.showConnected(false);
		}
	}

	// Toggle between the connected surface and the daemon-down setup card. Guarded because
	// refreshStatus() can be scheduled before buildUI() wires the elements on some lifecycles.
	private showConnected(connected: boolean): void {
		if (!this.setupEl || !this.connectedEl) return;
		if (connected) {
			this.setupEl.hide();
			this.connectedEl.show();
		} else {
			this.connectedEl.hide();
			this.setupEl.show();
		}
	}
}

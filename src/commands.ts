import { App, Modal, Setting } from "obsidian";
import { renderKhiipMark, parseIso } from "./brand";
import type { Capture } from "./types";

// Shown when Capture URL hits a link already in the vault. Dedup means no new
// note was written — so instead of a misleading "Captured" notice, we let the
// user open the existing note or re-capture a fresh version (old one kept).
export class RecaptureChoiceModal extends Modal {
	constructor(
		app: App,
		private capture: Capture,
		private actions: { onOpen: () => void; onRecapture: () => void },
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Already in your vault" });
		contentEl.createEl("p", {
			text:
				`"${this.capture.title ?? this.capture.url}" was captured ${this.formatWhen(this.capture.recorded_at)}. ` +
				`Open the existing note, or re-capture a fresh version? (The old version is kept in history.)`,
		});

		const row = new Setting(contentEl);
		row.addButton(b => b.setButtonText("Open existing").setCta().onClick(() => { this.close(); this.actions.onOpen(); }));
		row.addButton(b => b.setButtonText("Re-capture (new version)").onClick(() => { this.close(); this.actions.onRecapture(); }));
		row.addButton(b => b.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private formatWhen(iso: string): string {
		const t = parseIso(iso);
		if (t === null) return "earlier";
		return `on ${new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
	}
}

export class CaptureUrlModal extends Modal {
	private url = "";

	constructor(app: App, private onSubmit: (url: string) => Promise<void>, initialUrl = "") {
		super(app);
		this.url = initialUrl;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("khiip-modal");
		const header = contentEl.createDiv({ cls: "khiip-modal-header" });
		renderKhiipMark(header, "khiip-mark");
		header.createEl("h3", { text: "Capture URL" });

		// Full-width input (not an Obsidian Setting row — that boxes the field into
		// a narrow control column) so the user can see most of the URL they're
		// about to save.
		const input = contentEl.createEl("input", {
			type: "text",
			cls: "khiip-url-input",
			attr: { placeholder: "https://…  or  x.com/jack/status/20" },
		});
		input.value = this.url;
		input.addEventListener("input", () => { this.url = input.value.trim(); });
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void this.submit();
			}
		});
		setTimeout(() => {
			input.focus();
			// Pre-filled from the clipboard: select it so Enter captures as-is while
			// a keystroke replaces it.
			if (this.url) input.select();
		}, 0);

		contentEl.createDiv({ cls: "khiip-url-hint", text: "Paste a URL to capture." });

		const btnRow = new Setting(contentEl);
		btnRow.addButton(b => b.setButtonText("Capture").setCta().onClick(() => { void this.submit(); }));
		btnRow.addButton(b => b.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (!this.url) return;
		const captured = this.url;
		this.close();
		await this.onSubmit(captured);
	}
}

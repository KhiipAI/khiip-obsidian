import { App, PluginSettingTab, Setting } from "obsidian";
import type KhiipPlugin from "./main";

export interface KhiipSettings {
	daemonUrl: string;
	apiKeyOverride: string;
}

export const DEFAULT_SETTINGS: KhiipSettings = {
	daemonUrl: "http://127.0.0.1:8478",
	apiKeyOverride: "",
};

export class KhiipSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: KhiipPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Daemon URL")
			.setDesc("Where the Khiip daemon is listening. Default for local installs: http://127.0.0.1:8478. Override for Tailscale or remote hosts.")
			.addText(text => text
				.setPlaceholder("http://127.0.0.1:8478")
				.setValue(this.plugin.settings.daemonUrl)
				.onChange(async (v) => {
					this.plugin.settings.daemonUrl = v.trim() || DEFAULT_SETTINGS.daemonUrl;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("API key override")
			.setDesc("Leave empty to auto-discover from ~/.config/khiip/auth.toml. Paste a key only for Tailscale / multi-host setups where the daemon's config dir isn't reachable. Note: a pasted key is stored in plaintext in this vault's plugin data.")
			.addText(text => {
				text.inputEl.type = "password";
				text.setPlaceholder("khiip_…")
					.setValue(this.plugin.settings.apiKeyOverride)
					.onChange(async (v) => {
						this.plugin.settings.apiKeyOverride = v.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Daemon status").setHeading();
		const status = containerEl.createDiv({ cls: "khiip-settings-status" });
		const loading = status.createEl("div", { text: "Checking…" });
		this.plugin.client.meta()
			.then(meta => {
				if (!status.isConnected) return; // tab closed / re-rendered before meta resolved
				loading.remove();
				status.createEl("div", { text: `Version: ${meta.version}` });
				status.createEl("div", { text: `Schema version: ${meta.schema_version}` });
				status.createEl("div", { text: `Vault path (daemon-controlled): ${meta.config.vault_path}` });
				status.createEl("div", { text: `Extractors: ${meta.extractors.join(", ")}` });
				status.createEl("div", { text: `Embedder: ${meta.embedder.model} (${meta.embedder.dimension}-dim)` });
				const hint = status.createEl("div", { cls: "khiip-settings-hint" });
				hint.setText("Captures land in this vault if it matches your Obsidian vault (or a subfolder of it). Otherwise click-to-open won't resolve and you'll see the path in a notice instead.");
			})
			.catch(e => {
				if (!status.isConnected) return;
				loading.remove();
				status.createEl("div", {
					text: `Could not reach daemon: ${e instanceof Error ? e.message : String(e)}`,
					cls: "khiip-settings-error",
				});
			});
	}
}

import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
	Capture,
	CaptureCreatePayload,
	HealthResponse,
	MetaResponse,
	RecallResponse,
	RefetchDimension,
} from "./types";

export class KhiipError extends Error {
	constructor(public status: number, public detail: string) {
		super(`khiip ${status}: ${detail || "(no detail)"}`);
		this.name = "KhiipError";
	}
}

// Render an HTTP error body's `detail` into a human message.
// Two shapes reach us: the daemon's own HTTPException returns a string
// (e.g. "Invalid API key"), while FastAPI request-body validation returns
// a LIST of {loc, msg, type} objects (HTTP 422 — e.g. a URL pasted without
// a scheme). String(list) would flatten to "[object Object]", so pull each
// entry's `msg` instead. Returns "" when there's no usable detail.
function extractErrorDetail(json: unknown): string {
	if (!json || typeof json !== "object" || !("detail" in json)) return "";
	const detail = (json as Record<string, unknown>).detail;
	if (typeof detail === "string") return detail;
	if (Array.isArray(detail)) {
		return detail
			.map(item =>
				item && typeof item === "object" && "msg" in item
					? String((item as Record<string, unknown>).msg)
					: String(item),
			)
			.filter(Boolean)
			.join("; ");
	}
	return detail == null ? "" : String(detail);
}

export function discoverApiKey(): string | null {
	const candidates: string[] = [];
	const xdg = process.env.XDG_CONFIG_HOME;
	if (xdg) candidates.push(path.join(xdg, "khiip", "auth.toml"));
	candidates.push(path.join(os.homedir(), ".config", "khiip", "auth.toml"));

	for (const p of candidates) {
		try {
			const data = fs.readFileSync(p, "utf8");
			// auth.toml shape: `api_key = "khiip_..."` on its own line.
			// Daemon writer uses double quotes; we also accept single quotes
			// so a hand-edited config doesn't silently fail discovery.
			// Allow an optional trailing inline comment (TOML permits them).
			const m = data.match(/^\s*api_key\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/m);
			if (m && m[1]) return m[1];
		} catch {
			// next candidate
		}
	}
	return null;
}

export class KhiipClient {
	constructor(private hostUrl: string, private apiKey: string) {}

	private normalizedHost(): string {
		return this.hostUrl.replace(/\/+$/, "");
	}

	private safeHostForErrors(): string {
		// Strip userinfo before surfacing the host in error messages.
		// requestUrl errors may echo the URL; a misconfigured
		// "https://user:pass@host" would otherwise leak embedded creds.
		try {
			const u = new URL(this.normalizedHost());
			u.username = "";
			u.password = "";
			return u.toString().replace(/\/+$/, "");
		} catch {
			return "(invalid daemon URL)";
		}
	}

	private async send<T>(
		method: "GET" | "POST",
		pathAndQuery: string,
		opts: { auth: boolean; body?: unknown; timeoutMs?: number } = { auth: true },
	): Promise<T> {
		const url = `${this.normalizedHost()}${pathAndQuery}`;
		const headers: Record<string, string> = { "Accept": "application/json" };
		if (opts.auth) {
			if (!this.apiKey) {
				throw new KhiipError(0, "no API key configured");
			}
			headers["Authorization"] = `Bearer ${this.apiKey}`;
		}
		if (opts.body !== undefined) {
			headers["Content-Type"] = "application/json";
		}
		const params: RequestUrlParam = {
			url,
			method,
			headers,
			throw: false,
		};
		if (opts.body !== undefined) {
			params.body = JSON.stringify(opts.body);
		}
		let response: RequestUrlResponse;
		try {
			response = await this.withTimeout(requestUrl(params), opts.timeoutMs);
		} catch (e) {
			// withTimeout rejects with a KhiipError on timeout — pass it through.
			if (e instanceof KhiipError) throw e;
			const msg = e instanceof Error ? e.message : String(e);
			throw new KhiipError(0, `network error reaching ${this.safeHostForErrors()}: ${msg}`);
		}
		// response.json is a lazy getter that JSON.parses response.text and THROWS
		// on a non-JSON body (e.g. an HTML 502 from a proxy, or the wrong server on
		// the port). Parse the text ourselves so a non-JSON body degrades to the
		// text fallback instead of escaping as an unhandled SyntaxError.
		let parsed: unknown;
		try {
			parsed = response.text ? JSON.parse(response.text) : undefined;
		} catch {
			parsed = undefined;
		}
		if (response.status >= 400) {
			const detail = extractErrorDetail(parsed) || response.text || `HTTP ${response.status}`;
			throw new KhiipError(response.status, detail);
		}
		return parsed as T;
	}

	// requestUrl exposes no timeout or abort hook, so race it against a timer. On
	// timeout we surface a clear error and stop waiting; the underlying request
	// may still finish in the background (its result is simply discarded).
	private withTimeout<R>(p: Promise<R>, timeoutMs = 15_000): Promise<R> {
		return new Promise<R>((resolve, reject) => {
			const timer = window.setTimeout(
				() => reject(new KhiipError(0, `timed out after ${Math.round(timeoutMs / 1000)}s reaching ${this.safeHostForErrors()}`)),
				timeoutMs,
			);
			p.then(
				(v) => { window.clearTimeout(timer); resolve(v); },
				(e: unknown) => { window.clearTimeout(timer); reject(e instanceof Error ? e : new KhiipError(0, String(e))); },
			);
		});
	}

	health(): Promise<HealthResponse> {
		return this.send<HealthResponse>("GET", "/health", { auth: false });
	}

	meta(): Promise<MetaResponse> {
		return this.send<MetaResponse>("GET", "/api/v1/meta", { auth: true });
	}

	capture(payload: CaptureCreatePayload): Promise<Capture> {
		// Live extraction can take a while (slow sources) — give it a generous budget.
		return this.send<Capture>("POST", "/api/v1/captures", { auth: true, body: payload, timeoutMs: 90_000 });
	}

	recall(query: string, limit = 10): Promise<RecallResponse> {
		const params = new URLSearchParams({ q: query, limit: String(limit) });
		return this.send<RecallResponse>("GET", `/api/v1/recall?${params.toString()}`, { auth: true });
	}

	// Re-run extraction against the original URL: creates a NEW capture and
	// marks the old one's superseded_by pointer (append-only history). The prior
	// version is preserved, not overwritten.
	refetch(captureId: string, dimension: RefetchDimension = "extraction"): Promise<Capture> {
		const params = new URLSearchParams({ dimension });
		return this.send<Capture>(
			"POST",
			`/api/v1/captures/${encodeURIComponent(captureId)}/refetch?${params.toString()}`,
			{ auth: true, timeoutMs: 90_000 },
		);
	}

	listCaptures(opts: { source?: string; limit?: number; offset?: number } = {}): Promise<Capture[]> {
		const params = new URLSearchParams();
		if (opts.source) params.set("source", opts.source);
		params.set("limit", String(opts.limit ?? 10));
		params.set("offset", String(opts.offset ?? 0));
		return this.send<Capture[]>("GET", `/api/v1/captures?${params.toString()}`, { auth: true });
	}
}

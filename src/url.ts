// Browser-style URL normalization for the capture flow.
//
// Regular users paste links the way they type them into a browser address bar:
// often WITHOUT a scheme ("x.com/jack/status/20", "example.com"). Browsers
// silently prepend a scheme and go; a capture tool should do the same rather
// than surface an HTTP 422 the user can't act on. So: if the input has no
// scheme but looks like a host/URL, prepend https:// and capture. The actual
// fetched URL is recorded in the note's frontmatter, so the normalization is
// inspectable after the fact — no interruptive "we added https://" notice.
//
// Only genuinely unusable input (whitespace, no dot, or a non-web scheme)
// returns a plain-English error.

export type NormalizedUrl = { url: string } | { error: string };

const INVALID_HINT = "That doesn't look like a web link — paste a full URL, e.g. https://example.com";

export function normalizeCaptureUrl(raw: string): NormalizedUrl {
	const trimmed = raw.trim();
	if (!trimmed) return { error: "Paste a URL to capture." };

	// Already carries a scheme? Accept http(s); reject anything else with a
	// readable reason rather than letting the daemon 422.
	const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i);
	if (schemeMatch) {
		const scheme = schemeMatch[1]!.toLowerCase();
		if (scheme === "http" || scheme === "https") return { url: trimmed };
		return { error: `Khiip captures web links — "${scheme}://" isn't supported. Paste an http(s) URL.` };
	}

	// A single-colon scheme with no authority (mailto:/tel:/data:/file:) won't
	// match the ://-check above; left alone it would fall through and get mangled
	// into an "https://mailto:…" host. Reject it — but NOT a bare host:port, where
	// the colon is followed by a port number (e.g. "localhost:8478").
	const single = trimmed.match(/^([a-z][a-z0-9+.-]*):(.*)$/i);
	if (single && !/^\d+(?:\/|$)/.test(single[2]!)) {
		return { error: `Khiip captures web links — "${single[1]!.toLowerCase()}:" isn't supported. Paste an http(s) URL.` };
	}

	// No scheme. Whitespace means it's almost certainly not a URL (e.g. a
	// search phrase the user pasted by mistake).
	if (/\s/.test(trimmed)) return { error: INVALID_HINT };

	// Does the authority (everything before the first slash) look like a host?
	const host = trimmed.split("/")[0]!.toLowerCase();
	const isLocal = host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1");
	const looksLikeHost = host.includes(".") || isLocal;
	if (!looksLikeHost) return { error: INVALID_HINT };

	// Browser-style: bare hosts default to https; loopback is almost always http.
	const scheme = isLocal ? "http" : "https";
	return { url: `${scheme}://${trimmed}` };
}

// True when the input normalizes to a capturable http(s) URL. Thin predicate
// over normalizeCaptureUrl so the "is this a link?" check lives in one place.
export function isCaptureUrl(raw: string): boolean {
	return !("error" in normalizeCaptureUrl(raw));
}

// True when a daemon URL points at the local machine (loopback). Gates
// auto-discovery of the local API key: a non-loopback Daemon URL must use an
// explicitly-pasted key, so the locally-discovered key is never sent to a remote
// host the user merely typed into settings.
export function isLoopbackUrl(raw: string): boolean {
	try {
		const host = new URL(raw).hostname.toLowerCase();
		return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1" || host.endsWith(".localhost");
	} catch {
		return false;
	}
}

// Find a link under the cursor in an editor line — used by the right-click
// "Capture this link" editor menu. Prefers a markdown link target [label](url)
// when the cursor is anywhere inside the link, else a bare http(s)/www token the
// cursor sits within. Returns the raw URL (the daemon-side normalization handles
// scheme-fixing) or null when there's nothing link-like under the cursor.
export function urlAtCursor(line: string, ch: number): string | null {
	const mdLink = /\[[^\]]*\]\(([^)\s]+)\)/g;
	let m: RegExpExecArray | null;
	while ((m = mdLink.exec(line)) !== null) {
		if (ch >= m.index && ch <= m.index + m[0].length) return m[1]!;
	}
	// Whitespace/paren-delimited so we don't swallow trailing prose or the ) of a
	// surrounding markdown link. Strip trailing sentence punctuation so a URL at
	// the end of a sentence ("…see https://example.com.") doesn't capture the dot.
	const bare = /https?:\/\/[^\s)]+|www\.[^\s)]+/gi;
	while ((m = bare.exec(line)) !== null) {
		if (ch >= m.index && ch <= m.index + m[0].length) return m[0].replace(/[.,;:!?]+$/, "");
	}
	return null;
}

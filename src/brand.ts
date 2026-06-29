// Khiip brand surface for the Obsidian plugin — single source of truth for the
// khipu mark, per-source identity (icon + label), and the small time helpers the
// sidebar uses. The source COLOURS themselves live in styles.css as CSS custom
// properties (--khiip-src-*), shared by BOTH the sidebar pills/icons here and the
// in-note `> [!khiip-<source>]` banner callouts, so a source reads the same colour
// wherever it appears. PROVISIONAL — first design iteration, up for debate;
// nothing here is locked.

import { addIcon, type IconName } from "obsidian";

// Brand glyphs for the platforms that have an iconic mark (Simple Icons paths,
// CC0; the trademarks remain the platforms'). Registered as Obsidian icons so the
// SAME id works in the sidebar rows (setIcon) AND the in-note `[!khiip-<source>]`
// callout banners (--callout-icon in styles.css). The paths are 24×24; addIcon
// expects a 0 0 100 100 viewBox, so each is scaled ×4.16667. fill=currentColor so
// the icon takes the source colour. Type/utility sources (web/wiki/pdf) keep
// generic lucide icons — they're file types, not brands.
const BRAND_ICONS: Record<string, string> = {
	"khiip-x":
		"M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
	"khiip-reddit":
		"M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12c-.688 0-1.25.561-1.25 1.25 0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z",
	"khiip-youtube":
		"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
};

let iconsRegistered = false;

// Register the brand glyphs once (idempotent — Obsidian keeps icons global, and a
// plugin can reload). Call from the plugin's onload.
export function registerKhiipIcons(): void {
	if (iconsRegistered) return;
	for (const [id, path] of Object.entries(BRAND_ICONS)) {
		addIcon(id, `<path fill="currentColor" transform="scale(4.16667)" d="${path}"/>`);
	}
	// The khipu fan mark as a registered glyph — used for the ribbon button and the
	// sidebar tab/leaf icon so Khiip's most persistent UI carries the brand, not a
	// generic lucide "link". Multi-element (cords + primary + knots), so it can't ride
	// the single-path BRAND_ICONS loop; built from the same CORD_PATHS/KNOT_POINTS
	// geometry as renderKhiipMark, scaled from the mark's "-1 -1 50 50" viewBox into
	// addIcon's "0 0 100 100" space (×2, then +2 to absorb the -1 origin).
	addIcon("khiip-mark", khiipMarkGlyph());
	iconsRegistered = true;
}

// Per-source identity. Brand sources point at the registered glyphs above; type
// sources use lucide. The icon ids mirror the callout `--callout-icon` values in
// styles.css so the sidebar row icon matches the note banner icon. Labels are the
// human-facing platform names (the raw source string is e.g. "x").
export const SOURCE_META: Record<string, { icon: IconName; label: string }> = {
	x:       { icon: "khiip-x",       label: "X" },
	reddit:  { icon: "khiip-reddit",  label: "Reddit" },
	youtube: { icon: "khiip-youtube", label: "YouTube" },
	web:     { icon: "globe",         label: "Web" },
	wiki:    { icon: "book-open",     label: "Wikipedia" },
	pdf:     { icon: "file-text",     label: "PDF" },
};

export function sourceMeta(source: string): { icon: IconName; label: string } {
	return SOURCE_META[source] ?? { icon: "link", label: source };
}

// Khipu fan mark (7 pendant cords from a curved primary, 2 knots per cord,
// cords-under-the-top-cord). Geometry kept IN SYNC with the canonical
// www/src/components/Mark.astro. Drawn with currentColor so it adapts to the teal
// accent (light) / brighter teal (dark) set on .khiip-mark in styles.css.
const CORD_PATHS = [
	"M14 16 L1.27 28.73", "M17.33 19.05 L7.48 37.6", "M20.67 20.89 L16.09 42.4",
	"M24 21.5 L24 44.5", "M27.33 20.89 L31.91 42.4", "M30.67 19.05 L40.52 37.6",
	"M34 16 L46.73 28.73",
];
const KNOT_POINTS: Array<[number, number]> = [
	[8.27, 21.73], [4.83, 25.17], [12.90, 27.40], [10.24, 32.41],
	[18.61, 30.57], [17.37, 36.38], [24, 31.85], [24, 38.06],
	[29.39, 30.57], [30.63, 36.38], [35.10, 27.40], [37.76, 32.41],
	[39.73, 21.73], [43.17, 25.17],
];

// The khipu fan mark as inner SVG content for `addIcon` (Obsidian wraps it in a
// 0 0 100 100 <svg>). Same geometry as renderKhiipMark, scaled from the "-1 -1 50 50"
// viewBox into 0..100: translate(2,2) scale(2) maps -1→0 and 49→100. currentColor so
// the glyph tints with the ribbon/tab foreground.
function khiipMarkGlyph(): string {
	const cords = CORD_PATHS.map((d) => `<path d="${d}"/>`).join("");
	const knots = KNOT_POINTS.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="1.9"/>`).join("");
	return (
		`<g transform="translate(2,2) scale(2)" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
		`<g stroke="currentColor" stroke-width="3">${cords}</g>` +
		`<path d="M14 16 Q24 27 34 16" stroke="currentColor" stroke-width="4"/>` +
		`<g fill="currentColor">${knots}</g>` +
		`</g>`
	);
}

export function renderKhiipMark(parent: HTMLElement, cls?: string): SVGElement {
	const svg = parent.createSvg("svg", {
		cls,
		attr: {
			viewBox: "-1 -1 50 50",
			fill: "none",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			role: "img",
			"aria-label": "Khiip",
		},
	});
	const cords = svg.createSvg("g", { attr: { stroke: "currentColor", "stroke-width": "3" } });
	for (const d of CORD_PATHS) cords.createSvg("path", { attr: { d } });
	svg.createSvg("path", { attr: { d: "M14 16 Q24 27 34 16", stroke: "currentColor", "stroke-width": "4" } });
	const knots = svg.createSvg("g", { attr: { fill: "currentColor" } });
	for (const [cx, cy] of KNOT_POINTS) {
		knots.createSvg("circle", { attr: { cx: String(cx), cy: String(cy), r: "1.9" } });
	}
	return svg;
}

// Parse an ISO 8601 timestamp to epoch ms, or null when unparseable. The one
// date-parse contract the plugin's time helpers share.
export function parseIso(iso: string): number | null {
	const t = Date.parse(iso);
	return Number.isNaN(t) ? null : t;
}

// Compact relative age for a capture row ("just now" / "5m" / "3h" / "2d" / "4w";
// falls back to a short date past ~5 weeks). Empty string on an unparseable date.
export function formatRelative(iso: string): string {
	const t = parseIso(iso);
	if (t === null) return "";
	const sec = Math.floor((Date.now() - t) / 1000);
	if (sec < 45) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h`;
	const day = Math.floor(hr / 24);
	if (day < 7) return `${day}d`;
	const wk = Math.floor(day / 7);
	if (wk < 5) return `${wk}w`;
	return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Day-bucket label for grouping recents ("Today" / "Yesterday" / weekday within a
// week / "June 9" this year / full date otherwise). Compares calendar days, not
// 24h windows, so a capture from 11pm yesterday reads "Yesterday".
export function dayBucket(iso: string): string {
	const t = parseIso(iso);
	if (t === null) return "Earlier";
	const d = new Date(t);
	const now = new Date();
	const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
	if (days <= 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
	if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
	return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

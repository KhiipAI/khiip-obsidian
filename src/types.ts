// TypeScript surface mirroring khiip/src/khiip/models.py — keep in sync.
// Authority for shapes: github.com/KhiipAI/khiip src/khiip/models.py + daemon.py.
//
// Drift caveat: MetaResponse below is hand-mirrored from the daemon's
// /api/v1/meta route, which today returns a bare dict (not a Pydantic model).
// If you add a key to that route, update MetaResponse here too. The Capture /
// RecallResponse / HealthResponse / ExtractorHealth shapes ARE bound to the
// daemon's Pydantic models and are pinned by extra="forbid".
//
// Capture.url note: the daemon stores HttpUrl which Pydantic normalizes
// (trailing-slash for bare-domain, host lowercased). Do not byte-compare
// against the originally-POSTed URL.
//
// v0.1.0 additive update (2026-05-25): mirrors the daemon Pydantic models. All
// new fields are optional / nullable / default-defaulted on the daemon side;
// this surface is purely additive (no breaking changes to the v0.0.x plugin
// call sites).

// ─── Source enum + P-δ status family ──────────────────────────────────────

export type SourceName = "x" | "web" | "wiki" | "pdf" | "youtube" | "reddit";

export type ExtractionStatus =
	| "success"
	| "partial"
	| "pending-retry"
	| "failed-permanent";

// ─── Cross-platform primitives ────────────────────────────────────────────

export interface EngagementCounts {
	likes?: number | null;       // X / Instagram / Threads / Mastodon
	net_score?: number | null;   // Reddit / HN / Stack Overflow / Lobste.rs (M2)
	shares?: number | null;
	comments?: number | null;
	views?: number | null;
	saves?: number | null;
	extras?: Record<string, number>;
}

export interface UrlEntity {
	short_url: string;
	expanded_url: string;
	display_url?: string | null;
	unwound_url?: string | null;
	preview_title?: string | null;
	preview_description?: string | null;
	preview_image_url?: string | null;
	start?: number | null;
	end?: number | null;
}

export type MediaType =
	| "photo"
	| "video"
	| "gif"
	| "animated_gif"
	| "audio"
	| "document"
	| "embed";

export type MediaDownloadStatus =
	| "not-attempted"
	| "downloaded"
	| "pending-retry"
	| "failed-permanent"
	| "skipped-video";

export interface Media {
	url: string;
	type: MediaType;
	local_path?: string | null;        // vault-relative POSIX when downloaded
	download_status: MediaDownloadStatus;
	download_error?: string | null;
	download_attempts?: number;
	last_attempted?: string | null;    // ISO 8601 UTC
	retry_after?: string | null;       // ISO 8601 UTC
	bytes_written?: number | null;
	width?: number | null;
	height?: number | null;
	duration_seconds?: number | null;
	alt_text?: string | null;
	extras?: Record<string, unknown>;
}

export interface CommentNode {
	id: string;
	author?: string | null;
	body_markdown: string;
	posted_at: string;                 // ISO 8601 UTC
	edited?: string | null;
	parent_id?: string | null;
	depth?: number;
	engagement?: EngagementCounts | null;
	removed_status?: "active" | "removed-by-mod" | "deleted-by-author";
	is_op?: boolean | null;
	is_verified?: boolean | null;
	is_creator?: boolean | null;
	moderator_badge?: boolean | null;
	follower_count_at_capture?: number | null;
	author_url?: string | null;
	platform_extras?: Record<string, string | number | boolean>;
	replies?: CommentNode[];
}

// ─── X / Twitter platform primitives ──────────────────────────────────────

export type XArticleBlockType =
	| "heading-1"
	| "heading-2"
	| "heading-3"
	| "paragraph"
	| "blockquote"
	| "list-item"
	| "image"
	| "video"
	| "code-block"
	| "embed"
	| "table"
	| "divider";

export interface XArticleBlock {
	type: XArticleBlockType;
	text?: string | null;
	media?: Media | null;
	level?: number | null;
	list_marker?: "bullet" | "numbered" | null;
	language?: string | null;
	embed_url?: string | null;
	table_headers?: string[] | null;
	table_rows?: string[][] | null;
}

export interface XArticle {
	id: string;
	title: string;
	preview?: string | null;
	created_at?: string | null;       // ISO 8601 UTC
	cover_url?: string | null;
	cover_alt_text?: string | null;
	cover_local_path?: string | null;
	blocks?: XArticleBlock[];
	body_chars?: number;
	block_count?: number;
	block_type_counts?: Record<string, number>;
	media_count?: number;
	has_code_block?: boolean;
	has_blockquote?: boolean;
	extras?: Record<string, unknown>;
}

// ─── Per-source typed payloads (discriminated by `kind`) ──────────────────

export interface TweetPayload {
	kind: "x";
	handle?: string | null;
	text?: string | null;             // null for bare-Article URLs
	hashtags?: string[];
	mentions?: string[];
	engagement?: EngagementCounts | null;
	quoted_tweet?: TweetPayload | null;
	in_reply_to_tweet_id?: string | null;
	article?: XArticle | null;
	community_note?: string | null;
	media?: Media[];
	urls?: UrlEntity[];
	top_replies?: CommentNode[];
	extractor_source?: "fxtwitter" | "vxtwitter" | null;
	extras?: Record<string, unknown>;
}

export type RedditPostType =
	| "text"
	| "link"
	| "image"
	| "video"
	| "gallery"
	| "poll";

export interface RedditPayload {
	kind: "reddit";
	post_id: string;
	title: string;
	post_type: RedditPostType;
	body_text?: string | null;
	link_url?: string | null;
	poll_data?: Record<string, unknown> | null;
	subreddit: string;
	flair?: string | null;
	author_username?: string | null;
	author_url?: string | null;
	author_flair?: string | null;
	nsfw?: boolean;
	spoiler?: boolean;
	locked?: boolean;
	stickied?: boolean;
	engagement?: EngagementCounts | null;
	media?: Media[];
	urls?: UrlEntity[];
	comments?: CommentNode[];
	comments_truncated?: boolean;
	comment_count_total?: number | null;
	crosspost_parent?: RedditPayload | null;
	crosspost_parent_id?: string | null;
	// "reddit-html" is the credential-free default (old.reddit.com) since
	// daemon v0.1.3; "reddit-json" is the OAuth/.json upgrade path.
	extractor_source?: "reddit-html" | "reddit-json";
	extras?: Record<string, unknown>;
}

export interface WikiPayload {
	kind: "wiki";
	title: string;
	sections?: Record<string, unknown>[];
	references?: string[];
	infobox?: Record<string, unknown> | null;
	contributors_attribution?: string | null;
	hero_image_url?: string | null;
	site_name?: string | null;
	language?: string | null;
	media?: Media[];
	extras?: Record<string, unknown>;
}

export interface WebPayload {
	kind: "web";
	title: string;
	body_text: string;
	description?: string | null;
	hero_image_url?: string | null;
	site_name?: string | null;
	author_url?: string | null;
	section?: string | null;
	tags?: string[];                  // OG-derived; excluded from embedding text
	article_type?: string | null;
	language?: string | null;
	media?: Media[];
	extras?: Record<string, unknown>;
}

export interface PDFPayload {
	kind: "pdf";
	title: string;
	authors?: string[];
	pages?: Record<string, unknown>[];
	figures?: Record<string, unknown>[];
	tables?: Record<string, unknown>[];
	media?: Media[];                  // empty at v0.1 (PDF maintenance-mode)
	metadata?: Record<string, unknown> | null;
	extras?: Record<string, unknown>;
}

export interface YouTubePayload {
	kind: "youtube";
	title: string;
	description?: string;             // default "" per 2026-05-24 amendment
	duration_seconds?: number | null;
	uploader?: string | null;
	chapters?: Record<string, unknown>[];
	transcript?: Record<string, unknown>[];
	engagement?: EngagementCounts | null;
	is_short?: boolean;
	media?: Media[];
	top_comments?: CommentNode[];
	extras?: Record<string, unknown>;
}

export type SourcePayload =
	| TweetPayload
	| RedditPayload
	| WikiPayload
	| WebPayload
	| PDFPayload
	| YouTubePayload;

// ─── Capture-level metadata ───────────────────────────────────────────────

export interface AutoMetadata {
	host: string;
	year: number;
	filetype: string;
}

// ─── REST surface — Capture record + refetch dimensions ───────────────────

export type RefetchDimension = "extraction" | "re-extract" | "re-render" | "media" | "wayback";

export interface Capture {
	id: string;
	url: string;
	source: SourceName | (string & {});   // string fallback for forward-compat (preserves literal autocomplete)
	vault_path: string;
	title: string | null;
	description: string | null;
	author: string | null;
	recorded_at: string;
	valid_from: string;
	archived: boolean;
	superseded_by: string | null;
	// v0.1.0 additive fields (all optional / nullable to preserve v0.0.x compat)
	payload?: SourcePayload | null;
	structured_schema_version?: number;
	auto_metadata?: AutoMetadata | null;
	user_tags?: string[];
	archive_urls?: Record<string, string | null>;
	extraction_status?: ExtractionStatus;
	extraction_error?: string | null;
	extraction_attempts?: number;
	extraction_retry_after?: string | null;
	attempted_at?: string | null;
	// Source-tier (option (ii) URI-shape)
	source_artifact_path?: string | null;       // file:// at v0.1; s3:// / notion:// at v0.5+
	source_artifact_content_type?: string | null;
}

export interface RecallHit {
	capture: Capture;
	score: number;
}

export interface RecallResponse {
	query: string;
	embedder_model: string;
	embedder_dimension: number;
	results: RecallHit[];
}

export interface ExtractorHealth {
	source: string;
	ok: boolean;
	degraded_reason: string | null;
	fallback_count: number | null;
}

export interface HealthResponse {
	status: "ok" | "degraded";
	version: string;
	schema_version: number;
	db_path: string;
	extractors: ExtractorHealth[];
}

export interface MetaResponse {
	version: string;
	schema_version: number;
	config: {
		host: string;
		port: number;
		vault_path: string;
	};
	extractors: string[];
	embedder: {
		model: string;
		dimension: number;
	};
}

export interface CaptureCreatePayload {
	url: string;
	source_hint?: string;
	instruction?: string;
	destination_path?: string;   // multi-surface substrate hook
}

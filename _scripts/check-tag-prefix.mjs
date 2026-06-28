// Assert that npm's tag-version-prefix is empty, so `npm version` produces
// bare-version tags (Obsidian convention; required by release.yml).
//
// Repo .npmrc sets it empty, but user-level ~/.npmrc or NPM_CONFIG_TAG_VERSION_PREFIX
// env var would override silently and produce `v0.0.2`-style tags that the
// release workflow's strict-semver gate would reject AFTER the tag is already
// pushed. Fail fast here instead.

import { execSync } from "child_process";

const raw = execSync("npm config get tag-version-prefix").toString().trim();
// `npm config get` may return the literal empty string OR a quoted empty
// string depending on how it was set. Accept either as "empty."
const empty = raw === "" || raw === '""' || raw === "''";

if (!empty) {
	console.error(`tag-version-prefix is "${raw}" but must be empty for Obsidian-convention tags.`);
	console.error(`The repo .npmrc sets it empty; check ~/.npmrc or the NPM_CONFIG_TAG_VERSION_PREFIX env var for an override.`);
	process.exit(1);
}
console.log("tag-version-prefix check ok");

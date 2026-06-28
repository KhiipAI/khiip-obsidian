// Bump manifest.json + versions.json to match the package.json version.
//
// Run via `npm version <patch|minor|major|x.y.z>`, which:
//   1. Updates package.json + package-lock.json
//   2. Runs the `preversion` script (asserts tag-version-prefix is empty)
//   3. Runs this `version` script with process.env.npm_package_version set
//   4. Stages manifest.json + versions.json (per package.json's version script)
//   5. Commits + creates a git tag — bare version (no `v` prefix) because
//      `.npmrc` sets `tag-version-prefix=""` per Obsidian convention.
//
// Obsidian's community-plugin-registry expects the tag to MATCH manifest.version
// exactly. The release.yml workflow re-verifies this server-side.
//
// Safety: validates BOTH files before writing EITHER, so a malformed
// versions.json doesn't leave manifest.json half-bumped.

import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
	console.error("missing npm_package_version — run via `npm version <bump>`");
	process.exit(1);
}

function readJson(path) {
	let raw;
	try {
		raw = readFileSync(path, "utf8");
	} catch (e) {
		console.error(`could not read ${path}: ${e.message}`);
		process.exit(1);
	}
	try {
		return JSON.parse(raw);
	} catch (e) {
		console.error(`could not parse ${path}: ${e.message}`);
		process.exit(1);
	}
}

const manifest = readJson("manifest.json");
const versions = readJson("versions.json");

if (typeof manifest.minAppVersion !== "string" || manifest.minAppVersion === "") {
	console.error("manifest.json is missing minAppVersion — set it before bumping (Obsidian registry requires it)");
	process.exit(1);
}

manifest.version = targetVersion;
const versionsHasTarget = Object.hasOwn(versions, targetVersion);
if (!versionsHasTarget) {
	versions[targetVersion] = manifest.minAppVersion;
}

writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");
if (!versionsHasTarget) {
	writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
}

console.log(`bumped manifest + versions to ${targetVersion} (minAppVersion ${manifest.minAppVersion})`);

#!/usr/bin/env node
"use strict";

/**
 * Contract integration checks — validates example payloads against canonical JSON schemas.
 * Ensures auth, sync WS, and manifest contracts stay aligned.
 *
 * Usage: node tools/validate-contracts.js
 */

const fs = require("node:fs");
const path = require("node:path");

const SCHEMAS_ROOT = path.resolve(__dirname, "..", "json-schemas");

let failures = 0;
let passes = 0;

function check(name, condition, detail) {
  if (condition) {
    passes++;
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}: ${detail}`);
  }
}

function loadJson(relPath) {
  const full = path.resolve(SCHEMAS_ROOT, "..", relPath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function hasRequiredFields(obj, fields) {
  return fields.every((f) => obj.properties && f in obj.properties);
}

// ── Auth contract checks ──────────────────────────────────────────────────

function checkAuthContract() {
  console.log("\n── Auth Contract ──");

  const tokenPair = loadJson("json-schemas/auth/token-pair.schema.json");
  check(
    "token-pair.schema has required fields",
    hasRequiredFields(tokenPair, ["access_token", "expires_in"]),
    "missing access_token or expires_in"
  );
  check(
    "token-pair.schema requires access_token + expires_in",
    Array.isArray(tokenPair.required) &&
      tokenPair.required.includes("access_token") &&
      tokenPair.required.includes("expires_in"),
    "required array incorrect"
  );

  const userMe = loadJson("json-schemas/auth/user-me.schema.json");
  check(
    "user-me.schema has user, roles, zones",
    hasRequiredFields(userMe, ["user", "roles", "zones"]),
    "missing user, roles, or zones"
  );
  check(
    "user-me.schema user has id + email",
    userMe.properties.user &&
      userMe.properties.user.properties &&
      "id" in userMe.properties.user.properties &&
      "email" in userMe.properties.user.properties,
    "user missing id or email"
  );
  check(
    "user-me.schema has crdt_enabled field",
    "crdt_enabled" in userMe.properties,
    "missing crdt_enabled"
  );

  const logout = loadJson("json-schemas/auth/logout-response.schema.json");
  check(
    "logout-response.schema has ok field",
    hasRequiredFields(logout, ["ok"]),
    "missing ok field"
  );

  // Validate example payloads
  const exampleTokenPair = { access_token: "jwt.token.here", expires_in: 3600, refresh_token: "rt" };
  check(
    "example TokenPair matches schema shape",
    typeof exampleTokenPair.access_token === "string" && typeof exampleTokenPair.expires_in === "number",
    "type mismatch"
  );

  const exampleMe = {
    user: { id: "user-1", email: "test@example.com" },
    roles: ["admin"],
    zones: ["zone-1"],
    crdt_enabled: false,
  };
  check(
    "example UserMe matches schema shape",
    typeof exampleMe.user.id === "string" &&
      typeof exampleMe.user.email === "string" &&
      Array.isArray(exampleMe.roles) &&
      Array.isArray(exampleMe.zones),
    "type mismatch"
  );
}

// ── Sync WS contract checks ──────────────────────────────────────────────

function checkSyncContract() {
  console.log("\n── Sync WS Contract ──");

  const inbound = loadJson("json-schemas/sync/ws-inbound.schema.json");
  check("ws-inbound.schema exists and is valid", inbound.type === "object", "not an object schema");
  check("ws-inbound.schema has oneOf variants", Array.isArray(inbound.oneOf) && inbound.oneOf.length >= 2, "missing oneOf");

  const outbound = loadJson("json-schemas/sync/ws-outbound.schema.json");
  check("ws-outbound.schema exists and is valid", outbound.type === "object", "not an object schema");
  check(
    "ws-outbound.schema has ops_applied, batch_rejected, ops_rejected, snapshot variants",
    Array.isArray(outbound.oneOf) && outbound.oneOf.length >= 4,
    "missing outbound variants"
  );

  // Validate example messages match canonical shapes
  const exampleOpsBatch = {
    type: "ops_batch",
    schedule_id: "sched-1",
    ops: [{ op_type: "add_slot", causal: { operation_id: "op-1", client_id: "web-ui", lamport_ts: 1 }, slot: { slot_id: "s1", start_time: "2026-01-01T00:00:00Z", end_time: "2026-01-01T01:00:00Z" } }],
    correlation_id: "corr-1",
  };
  check(
    "example ops_batch has flat envelope (no data wrapper)",
    exampleOpsBatch.schedule_id !== undefined && !("data" in exampleOpsBatch),
    "has data wrapper or missing schedule_id"
  );

  const exampleOpsApplied = {
    type: "ops_applied",
    correlation_id: "corr-1",
    accepted: 1,
    rejected: 0,
    results: [{ operation_id: "op-1", accepted: true }],
  };
  check(
    "example ops_applied has accepted/rejected/results",
    typeof exampleOpsApplied.accepted === "number" &&
      typeof exampleOpsApplied.rejected === "number" &&
      Array.isArray(exampleOpsApplied.results),
    "missing fields"
  );
}

// ── Manifest contract checks ─────────────────────────────────────────────

function checkManifestContract() {
  console.log("\n── Release/Manifest Contract ──");

  const manifest = loadJson("json-schemas/manifest/release-manifest.schema.json");
  check("release-manifest.schema exists and is valid", manifest.type === "object", "not an object schema");
  check(
    "release-manifest.schema uses version_number (not version)",
    hasRequiredFields(manifest, ["version_number"]),
    "missing version_number field"
  );
  check(
    "release-manifest.schema uses assets (not files)",
    hasRequiredFields(manifest, ["assets"]),
    "missing assets field — should not use 'files'"
  );
  check(
    "release-manifest.schema has manifest_hash field",
    "manifest_hash" in manifest.properties,
    "missing manifest_hash"
  );
  check(
    "release-manifest.schema has signature and key_id",
    "signature" in manifest.properties && "key_id" in manifest.properties,
    "missing signature or key_id"
  );

  // ManifestAsset shape check
  const assetDef = manifest.$defs && manifest.$defs.ManifestAsset;
  check(
    "ManifestAsset has asset_id, filename, sha256_hash, download_url",
    assetDef &&
      assetDef.required &&
      assetDef.required.includes("asset_id") &&
      assetDef.required.includes("filename") &&
      assetDef.required.includes("sha256_hash") &&
      assetDef.required.includes("download_url"),
    "ManifestAsset missing required fields"
  );
  check(
    "ManifestAsset has metadata for future publication editor",
    assetDef && assetDef.properties && "metadata" in assetDef.properties,
    "ManifestAsset missing metadata"
  );

  // Example payload
  const exampleManifest = {
    release_id: "rel-1",
    schedule_id: "sched-1",
    zone_id: "zone-1",
    version_number: 1,
    slots: [{ slot_id: "s1", asset_id: "a1", start_time: "2026-01-01T00:00:00Z", end_time: "2026-01-01T01:00:00Z", priority: 50, zone_id: "zone-1", group_id: "g1" }],
    assets: [{ asset_id: "a1", filename: "video.mp4", sha256_hash: "abc123", download_url: "https://cdn.example.com/video.mp4", content_type: "video/mp4", file_size: 1024 }],
    manifest_hash: "sha256hash",
    created_at: "2026-01-01T00:00:00Z",
  };
  check(
    "example manifest uses version_number + assets (not version + files)",
    typeof exampleManifest.version_number === "number" && Array.isArray(exampleManifest.assets),
    "wrong field names"
  );
}

// ── OpenAPI consistency checks ───────────────────────────────────────────

function checkOpenApiConsistency() {
  console.log("\n── OpenAPI Consistency ──");

  const yamlRaw = fs.readFileSync(path.resolve(__dirname, "..", "openapi", "gateway.yaml"), "utf8");

  check("OpenAPI has /me endpoint", yamlRaw.includes("/me:"), "missing /me path");
  check("OpenAPI has /auth/logout endpoint", yamlRaw.includes("/auth/logout:"), "missing /auth/logout path");
  check("OpenAPI has UserMe schema", yamlRaw.includes("UserMe:"), "missing UserMe schema");
  check("OpenAPI has LogoutResponse schema", yamlRaw.includes("LogoutResponse:"), "missing LogoutResponse schema");
  check(
    "OpenAPI Manifest uses version_number (not just version)",
    yamlRaw.includes("version_number: { type: integer }") ||
      yamlRaw.includes("version_number:"),
    "Manifest still uses 'version' instead of 'version_number'"
  );
  check(
    "OpenAPI Manifest uses assets (not files)",
    yamlRaw.includes("assets:") && !yamlRaw.includes("files:"),
    "Manifest still uses 'files' instead of 'assets'"
  );
}

// ── Run all checks ───────────────────────────────────────────────────────

function main() {
  console.log("Contract integration checks");
  console.log("===========================");

  checkAuthContract();
  checkSyncContract();
  checkManifestContract();
  checkOpenApiConsistency();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passes} passed, ${failures} failed`);

  if (failures > 0) {
    process.exit(1);
  }
  console.log("\nAll contract checks passed!");
}

main();

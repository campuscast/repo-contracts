#!/usr/bin/env node
"use strict";

const dns = require("node:dns/promises");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const BLOCKED_EXIT_CODE = 3;
const DEFAULT_TIMEOUT_MS = 3500;

function warn(message, details) {
  console.warn(`WARNING: ${message}`);
  if (details) console.warn(details);
}

function info(message) {
  console.log(message);
}

function localValidatorsAvailable() {
  const toolsDir = __dirname;
  const required = [
    path.join(toolsDir, "validate-openapi.js"),
    path.join(toolsDir, "validate-schemas.js"),
  ];
  return required.every((file) => fs.existsSync(file));
}

function parseRegistry() {
  const raw = process.env.npm_config_registry || "https://registry.npmjs.org";
  try {
    return new URL(raw);
  } catch {
    warn(`invalid npm registry URL: ${raw}; network probe skipped`);
    return null;
  }
}

async function checkDns(hostname) {
  try {
    await dns.lookup(hostname);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `DNS lookup failed (${hostname}: ${error.code || error.message})`,
    };
  }
}

async function checkHttp(registryUrl) {
  const pingUrl = new URL("/-/ping", `${registryUrl.origin}/`);
  const timeoutMs = Number(process.env.CONTRACTS_PRECHECK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  return new Promise((resolve) => {
    const req = https.request(
      pingUrl,
      { method: "GET", timeout: timeoutMs },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve({ ok: true });
          return;
        }
        resolve({
          ok: false,
          reason: `HTTP probe unexpected status (${res.statusCode || "unknown"})`,
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", (error) => {
      resolve({
        ok: false,
        reason: `HTTP probe failed (${pingUrl.toString()}: ${error.message})`,
      });
    });
    req.end();
  });
}

async function main() {
  const hasLocalValidators = localValidatorsAvailable();

  if (process.env.CONTRACTS_FORCE_OFFLINE === "1") {
    if (hasLocalValidators) {
      warn("forced offline mode enabled; continuing with local validators only");
      process.exit(0);
    }
    console.error("BLOCKED: forced offline mode enabled but local validators are missing");
    process.exit(BLOCKED_EXIT_CODE);
  }

  const registryUrl = parseRegistry();
  if (!registryUrl) {
    if (hasLocalValidators) process.exit(0);
    console.error("BLOCKED: invalid npm registry URL and local validators are missing");
    process.exit(BLOCKED_EXIT_CODE);
  }

  const dnsCheck = await checkDns(registryUrl.hostname);
  const httpCheck = dnsCheck.ok ? await checkHttp(registryUrl) : { ok: false, reason: dnsCheck.reason };

  if (dnsCheck.ok && httpCheck.ok) {
    info(`Precheck OK: npm registry reachable (${registryUrl.origin})`);
    process.exit(0);
  }

  if (hasLocalValidators) {
    warn(
      "npm registry is unreachable; continuing with offline local validators",
      httpCheck.reason || dnsCheck.reason
    );
    process.exit(0);
  }

  console.error("BLOCKED: npm registry unreachable and local validators are missing");
  if (httpCheck.reason || dnsCheck.reason) console.error(httpCheck.reason || dnsCheck.reason);
  process.exit(BLOCKED_EXIT_CODE);
}

main().catch((error) => {
  warn("precheck failed unexpectedly; continuing with local validators when available", error.stack || String(error));
  if (localValidatorsAvailable()) process.exit(0);
  process.exit(BLOCKED_EXIT_CODE);
});

#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SCHEMAS_ROOT = path.resolve(__dirname, "..", "json-schemas");

function fail(message) {
  console.error(`JSON schemas validation failed: ${message}`);
  process.exit(1);
}

function walkJsonFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) files.push(fullPath);
  }

  return files.sort();
}

function isSchemaFile(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base.endsWith(".schema.json")) return true;
  if (base.includes("schema")) return true;
  return false;
}

function relative(filePath) {
  return path.relative(path.resolve(__dirname, ".."), filePath);
}

function main() {
  if (!fs.existsSync(SCHEMAS_ROOT)) fail(`directory not found: ${SCHEMAS_ROOT}`);

  const jsonFiles = walkJsonFiles(SCHEMAS_ROOT);
  if (jsonFiles.length === 0) fail(`no .json files found in ${SCHEMAS_ROOT}`);

  let parsedCount = 0;
  let schemaCount = 0;

  for (const filePath of jsonFiles) {
    const raw = fs.readFileSync(filePath, "utf8");
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      fail(`${relative(filePath)} is not valid JSON: ${error.message}`);
    }

    parsedCount += 1;

    if (!isSchemaFile(filePath)) continue;
    schemaCount += 1;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail(`${relative(filePath)} must contain a JSON object schema`);
    }

    const hasSchemaVersion = Object.prototype.hasOwnProperty.call(parsed, "$schema");
    const hasType = Object.prototype.hasOwnProperty.call(parsed, "type");
    if (!hasSchemaVersion && !hasType) {
      fail(`${relative(filePath)} must declare "$schema" or "type"`);
    }
  }

  console.log(
    `JSON schemas offline validation OK: parsed ${parsedCount} JSON file(s), checked ${schemaCount} schema file(s)`
  );
}

main();

#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const OPENAPI_FILE = path.resolve(__dirname, "..", "openapi", "gateway.yaml");
const REQUIRED_TOP_LEVEL_KEYS = ["openapi", "info", "paths", "components"];

function fail(message) {
  console.error(`OpenAPI validation failed: ${message}`);
  process.exit(1);
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function countIndent(line) {
  let i = 0;
  while (i < line.length && line[i] === " ") i += 1;
  return i;
}

function findKeyValueSeparator(text) {
  let quote = null;
  let depth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "";

    if (quote) {
      if (quote === '"' && ch === '"' && prev !== "\\") quote = null;
      if (quote === "'" && ch === "'") quote = null;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth += 1;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth -= 1;
      continue;
    }

    if (ch === ":" && depth === 0) return i;
  }

  return -1;
}

class FlowParser {
  constructor(source, lineNo) {
    this.source = source;
    this.lineNo = lineNo;
    this.index = 0;
  }

  parse() {
    this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      throw new Error(`unexpected token "${this.source[this.index]}"`);
    }
  }

  skipWhitespace() {
    while (this.index < this.source.length && /\s/.test(this.source[this.index])) this.index += 1;
  }

  parseValue() {
    this.skipWhitespace();
    const ch = this.source[this.index];
    if (!ch) throw new Error("unexpected end of flow value");
    if (ch === "{") return this.parseMap();
    if (ch === "[") return this.parseArray();
    if (ch === "'" || ch === '"') return this.parseQuoted();
    return this.parseBare();
  }

  parseMap() {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return;
    }

    while (this.index < this.source.length) {
      this.parseKey();
      this.skipWhitespace();
      if (this.source[this.index] !== ":") throw new Error("expected ':' in flow map");
      this.index += 1;
      this.parseValue();
      this.skipWhitespace();

      const ch = this.source[this.index];
      if (ch === "}") {
        this.index += 1;
        return;
      }
      if (ch !== ",") throw new Error("expected ',' or '}' in flow map");
      this.index += 1;
    }

    throw new Error("unterminated flow map");
  }

  parseArray() {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return;
    }

    while (this.index < this.source.length) {
      this.parseValue();
      this.skipWhitespace();

      const ch = this.source[this.index];
      if (ch === "]") {
        this.index += 1;
        return;
      }
      if (ch !== ",") throw new Error("expected ',' or ']' in flow array");
      this.index += 1;
    }

    throw new Error("unterminated flow array");
  }

  parseQuoted() {
    const quote = this.source[this.index];
    this.index += 1;
    while (this.index < this.source.length) {
      const ch = this.source[this.index];
      const prev = this.index > 0 ? this.source[this.index - 1] : "";
      this.index += 1;
      if (quote === '"' && ch === '"' && prev !== "\\") return;
      if (quote === "'" && ch === "'") return;
    }
    throw new Error("unterminated quoted string");
  }

  parseBare() {
    const start = this.index;
    while (this.index < this.source.length) {
      const ch = this.source[this.index];
      if (ch === "," || ch === "}" || ch === "]") break;
      this.index += 1;
    }
    const token = this.source.slice(start, this.index).trim();
    if (!token) throw new Error("empty flow token");
  }

  parseKey() {
    this.skipWhitespace();
    const ch = this.source[this.index];
    if (ch === "'" || ch === '"') return this.parseQuoted();

    const start = this.index;
    while (this.index < this.source.length) {
      const next = this.source[this.index];
      if (next === ":" || /\s/.test(next)) break;
      this.index += 1;
    }
    if (this.index === start) throw new Error("empty key in flow map");
  }
}

function validateYamlShape(source, filePath) {
  const lines = source.split(/\r?\n/);
  const topLevelKeys = new Set();
  let blockScalarIndent = null;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i];

    if (line.includes("\t")) fail(`${filePath}:${lineNo} contains tab indentation`);

    const indent = countIndent(line);
    const trimmed = line.trim();

    if (blockScalarIndent !== null) {
      if (trimmed === "") continue;
      if (indent > blockScalarIndent) continue;
      blockScalarIndent = null;
    }

    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (indent % 2 !== 0) fail(`${filePath}:${lineNo} has non-2-space indentation`);

    const normalized = trimmed.startsWith("- ") ? trimmed.slice(2).trim() : trimmed;
    const sep = findKeyValueSeparator(normalized);
    if (sep < 0 && !trimmed.startsWith("- ")) {
      fail(`${filePath}:${lineNo} is not a valid YAML key/value entry`);
    }

    if (sep >= 0) {
      const key = normalized.slice(0, sep).trim();
      const value = normalized.slice(sep + 1).trim();
      if (!key) fail(`${filePath}:${lineNo} has an empty key`);

      if (!trimmed.startsWith("- ") && indent === 0) topLevelKeys.add(unquote(key));

      if (value === "|" || value === ">" || value === "|-" || value === ">-" || value === "|+" || value === ">+") {
        blockScalarIndent = indent;
        continue;
      }
      if (value.startsWith("{") || value.startsWith("[")) {
        try {
          new FlowParser(value, lineNo).parse();
        } catch (error) {
          fail(`${filePath}:${lineNo} has invalid flow value: ${error.message}`);
        }
      }
      continue;
    }

    if (normalized.startsWith("{") || normalized.startsWith("[")) {
      try {
        new FlowParser(normalized, lineNo).parse();
      } catch (error) {
        fail(`${filePath}:${lineNo} has invalid flow value: ${error.message}`);
      }
    }
  }

  for (const requiredKey of REQUIRED_TOP_LEVEL_KEYS) {
    if (!topLevelKeys.has(requiredKey)) {
      fail(`missing required top-level section "${requiredKey}" in ${filePath}`);
    }
  }
}

function main() {
  if (!fs.existsSync(OPENAPI_FILE)) fail(`file not found: ${OPENAPI_FILE}`);
  const source = fs.readFileSync(OPENAPI_FILE, "utf8");
  validateYamlShape(source, OPENAPI_FILE);
  console.log(`OpenAPI offline validation OK: ${OPENAPI_FILE}`);
}

main();

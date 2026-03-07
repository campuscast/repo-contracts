# repo-contracts

Shared contract definitions for Distributed Media CMS (CampusCast).

## Structure

```
proto/              # gRPC / Protobuf definitions
  common.proto      # Shared types: Timestamp, CausalMetadata, Signature
  auth/             # Auth & IAM service
  zone/             # Zone & Policy service
  device/           # Device Management service
  content/          # Content service
  schedule/         # Schedule service (core + CRDT ops)
  sync/             # Sync service (WS + MQTT)
  audit/            # Audit service
  signing/          # Signing/KMS service
  validation/       # Validation/QA service

openapi/            # OpenAPI 3.1 specs
  gateway.yaml      # API Gateway/BFF external REST API

json-schemas/       # JSON Schemas
  operations/       # CRDT operation schemas
  events/           # Audit event schemas
```

## Usage

```bash
npm ci
npm run proto:generate    # Generate TS types from protos
npm run openapi:validate  # Validate OpenAPI spec
npm run schemas:validate  # Validate JSON schemas
```

## Validation behavior

- Local binaries only: `@redocly/cli` and `ajv-cli` are installed in `devDependencies` and executed from npm scripts (no global tools, no `npx`).
- Every validation command runs a network precheck first.
  - If npm registry is unreachable, command exits with code `3` and message:
    - `BLOCKED: npm registry unreachable ...`
  - If contracts are invalid, command exits non-zero (`!= 0`, `!= 3`) and should be treated as `FAIL`.

## Restricted network / corporate environment

If your network blocks direct access to `registry.npmjs.org`, configure npm before running validation:

```bash
# Use internal mirror
npm config set registry https://<your-npm-mirror>/

# Or configure proxy
npm config set proxy http://<proxy-host>:<proxy-port>
npm config set https-proxy http://<proxy-host>:<proxy-port>
```

CI also reports blocked precheck explicitly and skips contract validation when registry is unreachable.

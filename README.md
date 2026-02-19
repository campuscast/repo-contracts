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
npm install
npm run proto:generate    # Generate TS types from protos
npm run openapi:validate  # Validate OpenAPI spec
```

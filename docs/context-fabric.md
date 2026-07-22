# Context Fabric development

`dev-health-web` is the human inspection surface for Context Fabric/ACR. The Web
server calls the hosted ACR API through its BFF routes using short-lived Ed25519
assertions; browser code never receives an ACR service credential or assertion
private key.

## Choose the right local path

### MCP service and bundled client plugins

Keep `dev-health-{ops,acr,web}` as sibling checkouts. For the complete Docker
service and plugin fixture, run from Ops:

```bash
cd ../dev-health-ops
bash scripts/context-fabric-local.sh
```

The launcher renders the real Ops `compose.yml`, layers the canonical ACR
Compose services and generated TLS configuration, runs `acr-api` in Docker, and
builds the host-local `acr-mcp` for OpenCode, Claude Code, Codex, and Cursor. It
uses a unique project and does not replace the Ops Compose stack.

To run the ACR service in Kubernetes instead, use the Ops-owned Helm lifecycle:

```bash
cd ../dev-health-ops
bash scripts/context-fabric-kubernetes.sh render \
  --image "$ACR_IMAGE" \
  --entitlement-url "$OPS_HTTPS_ORIGIN"

bash scripts/context-fabric-kubernetes.sh apply \
  --image "$ACR_IMAGE" \
  --entitlement-url "$OPS_HTTPS_ORIGIN"
```

Kubernetes requires existing ACR Secrets, TLS PostgreSQL, TLS-native ClickHouse,
and an HTTPS Ops entitlement origin. The host plugin reaches the ACR ClusterIP
through the documented loopback port-forward; `acr-mcp` is not deployed as a
Pod.

Neither service path copies a Web assertion key into this checkout or launches
the Web application. The complete setup and client-package commands are in
`dev-health-ops/docs/context-fabric-local.md` and
`dev-health-acr/docs/local-development.md`.

### Web UI and BFF behavior

Use the dedicated Playwright configuration:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test:e2e:context-fabric
```

The suite validates loading, unavailable, degraded, incompatible, unauthorized,
forbidden, rate-limited, failed, empty, partial, and ready states; it also keeps
Context Fabric traces and named screenshots as its evidence bundle.

The complete live Web-to-ACR assertion path is owned by the private ACR SVS
suite. Developers with access to `dev-health-acr` should follow
`docs/local-development.md` and `docs/operations.md` there rather than creating
an ad-hoc assertion or placing a long-lived ACR token in Web configuration.

## Local Web configuration

Copy `.env.example` to `.env.local`, then set the server-only ACR values when a
live assertion-enabled ACR environment is available:

```dotenv
ACR_API_ORIGIN=https://acr.example.test
ACR_WEB_ASSERTION_KEY_FILE=<path-to-mode-0600-ed25519-private-key>
ACR_WEB_ASSERTION_KID=web-local-1
ACR_WEB_ASSERTION_ISSUER=dev-health-web
ACR_WEB_ASSERTION_AUDIENCE=dev-health-acr
ACR_REQUEST_TIMEOUT_MS=5000
```

Requirements:

- `ACR_API_ORIGIN` must be a fixed HTTPS origin without a path or query.
- The assertion key is an Ed25519 private key in a regular mode-`0600` file.
- The key is server-only and must never use a `NEXT_PUBLIC_*` variable.
- Key ID, issuer, and audience must match the ACR JWKS/runtime configuration.
- The browser must use Web BFF routes; it does not call ACR itself.

## Contract and repository checks

```bash
pnpm acr:contracts:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e:context-fabric
```

The ACR contract check validates Web's checked-in Context Fabric contract copies
against the private ACR source when `ACR_REPO_PATH` is available.

#!/usr/bin/env -S pnpm exec tsx
/**
 * live-e2e-graphql-body — CHAOS-7554.
 *
 * Prints the JSON body of one REGISTERED query-api document (CatalogValues) exactly as this
 * repo's pinned urql puts it on the wire (createRequest + formatDocument + stringifyDocument,
 * the same three steps as scripts/graphql-wire-parity.ts), so the live-e2e smoke can POST it to
 * the Go /graphql: query-api resolves a request by the digest of its raw query text and answers
 * UNREGISTERED_DOCUMENT for anything else, so an ad-hoc `{ __typename }` cannot prove the path.
 *
 * Usage: tsx ci/live-e2e-graphql-body.ts <orgId>
 */
import { createRequest, formatDocument, stringifyDocument } from "@urql/core";

import { CATALOG_VALUES_QUERY } from "../src/lib/graphql/queries";

const orgId = process.argv[2];
if (!orgId) {
    console.error("usage: live-e2e-graphql-body.ts <orgId>");
    process.exit(2);
}
const request = createRequest(CATALOG_VALUES_QUERY, { orgId, dimension: "TEAM" });
const query = stringifyDocument(formatDocument(request.query));
process.stdout.write(JSON.stringify({ query, variables: { orgId, dimension: "TEAM" } }));

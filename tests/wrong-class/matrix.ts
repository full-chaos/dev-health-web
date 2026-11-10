// The two axes of the wrong-credential-class gate, built from the contract files: the web endpoint-profile rows
// and the ops credential classes with the request carrier each class is presented in. A TypeScript port of the ops
// package internal/testsupport/wrongclass (LoadClasses, CarrierFor, Baseline, Census).
import { createHmac, generateKeyPairSync, sign } from "node:crypto";

export const FILLER = "A".repeat(43);
export const AUTHORIZATION = "Authorization";

// carrierKinds make a request carrier; qualifierKinds only narrow one. A marker kind outside both fails loadClasses.
export const CARRIER_KINDS = [
    "credential_prefix",
    "authorization_scheme",
    "dedicated_header",
    "signature_header",
    "body_field",
] as const;
export const QUALIFIER_KINDS = [
    "jwt_header_alg",
    "jwt_header_typ",
    "content_type",
    "subject_token_type",
    "grant_type",
] as const;

export interface Marker {
    kind: string;
    name: string;
    shape?: string;
}

export interface CredentialClass {
    class_id: string;
    status?: string;
    markers: Marker[];
    markers_none_reason?: string;
}

function names(c: CredentialClass, kind: string): string[] {
    return c.markers.filter((m) => m.kind === kind).map((m) => m.name);
}

export function loadClasses(raw: string): CredentialClass[] {
    const known: readonly string[] = [...CARRIER_KINDS, ...QUALIFIER_KINDS];
    const document = JSON.parse(raw) as { classes?: CredentialClass[] };
    const classes = document.classes ?? [];
    if (classes.length === 0) throw new Error("wrongclass: no credential class");
    for (const c of classes) {
        if (!c.class_id) throw new Error("wrongclass: a class has no class_id");
        const markers = c.markers ?? [];
        if (markers.length === 0 && !(c.markers_none_reason ?? "").trim()) {
            throw new Error(
                `wrongclass: class ${c.class_id} has no marker and no markers_none_reason`,
            );
        }
        for (const m of markers) {
            if (!known.includes(m.kind)) {
                throw new Error(
                    `wrongclass: class ${c.class_id}: marker kind "${m.kind}" has no carrier rule`,
                );
            }
        }
        c.markers = markers;
    }
    return classes;
}

export type Mint = (alg: string, typ: string) => string;

export interface Carrier {
    classId: string;
    header?: string;
    value: string;
    bodyField?: string;
}

// null: no carrier kind presents the class (no marker, or only qualifiers). A throw: markers that cannot make a
// carrier distinct from the baseline, which must fail the gate rather than drop out of it.
export function carrierFor(c: CredentialClass, mint: Mint): Carrier | null {
    const prefix = names(c, "credential_prefix");
    if (prefix.length > 0) {
        return {
            classId: c.class_id,
            header: AUTHORIZATION,
            value: `Bearer ${prefix[0]}${FILLER}`,
        };
    }
    const scheme = names(c, "authorization_scheme");
    if (scheme.length > 0) {
        if (scheme.length !== 1 || scheme[0] !== "Bearer") {
            throw new Error(
                `wrongclass: class ${c.class_id}: authorization scheme ${scheme} has no carrier rule`,
            );
        }
        const algs = names(c, "jwt_header_alg");
        const typs = names(c, "jwt_header_typ");
        if (algs.length !== 1 || typs.length > 1) {
            throw new Error(
                `wrongclass: class ${c.class_id}: a Bearer class needs a prefix or one alg`,
            );
        }
        const token = mint(algs[0], typs[0] ?? "");
        if (token.split(".").length !== 3) {
            throw new Error(
                `wrongclass: class ${c.class_id}: the minter made no JWT for alg ${algs[0]}`,
            );
        }
        return { classId: c.class_id, header: AUTHORIZATION, value: `Bearer ${token}` };
    }
    const dedicated = names(c, "dedicated_header");
    if (dedicated.length > 0) return { classId: c.class_id, header: dedicated[0], value: FILLER };
    const signature = names(c, "signature_header");
    if (signature.length > 0) {
        return { classId: c.class_id, header: signature[0], value: `sha256=${FILLER}` };
    }
    const body = c.markers.find((m) => m.kind === "body_field");
    if (body)
        return { classId: c.class_id, bodyField: body.name, value: shaped(c.class_id, body.shape) };
    return null;
}

function shaped(classId: string, shape: string | undefined): string {
    if (shape === "jwt") {
        const enc = (s: string) => Buffer.from(s).toString("base64url");
        return `${enc('{"alg":"HS256","typ":"JWT"}')}.${enc('{"sub":"wrongclass"}')}.${FILLER}`;
    }
    if (shape?.startsWith("prefix:")) return shape.slice("prefix:".length) + FILLER;
    if (shape?.startsWith("opaque:")) return shape.slice("opaque:".length) + FILLER;
    throw new Error(
        `wrongclass: class ${classId}: body_field shape "${shape}" has no carrier rule`,
    );
}

// The carrier's garbage twin: the same Authorization header with a credential of no class, the same body field
// with a value of no class, or no credential at all for any other header.
export function baselineOf(c: Carrier): Carrier {
    if (c.header === AUTHORIZATION) {
        return {
            classId: "baseline:authorization",
            header: AUTHORIZATION,
            value: `Bearer ${FILLER}`,
        };
    }
    if (c.bodyField)
        return { classId: `baseline:body:${c.bodyField}`, bodyField: c.bodyField, value: FILLER };
    return { classId: "baseline:none", value: "" };
}

// A JWT with the class's header, signed for real: Ed25519 for EdDSA, HMAC-SHA256 for HS256.
export function newMinter(): Mint {
    const { privateKey } = generateKeyPairSync("ed25519");
    const hmacKey = Buffer.alloc(32, 7);
    const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
    return (alg, typ) => {
        const now = Math.floor(Date.now() / 1000);
        const header = enc({ alg, ...(typ ? { typ } : {}), kid: "wrong-class" });
        const payload = enc({
            iss: "https://auth.wrong-class.test",
            aud: "dev-health-api",
            sub: "prn_AAAAAAAAAAAAAAAAAAAAAA",
            iat: now - 10,
            nbf: now - 10,
            exp: now + 3600,
        });
        const input = Buffer.from(`${header}.${payload}`);
        let signature: Buffer;
        if (alg === "EdDSA") signature = sign(null, input, privateKey);
        else if (alg === "HS256") signature = createHmac("sha256", hmacKey).update(input).digest();
        else throw new Error(`wrongclass: no signer for alg ${alg}`);
        return `${header}.${payload}.${signature.toString("base64url")}`;
    };
}

export interface ProfileRow {
    id: string;
    surface_kind: string;
    method: string | null;
    route: string | null;
    service: string;
    source: { file: string; line: number };
    classification: string;
    accepted_credential_classes: string[];
}

export function loadRows(raw: string): ProfileRow[] {
    const rows = (JSON.parse(raw) as { rows?: ProfileRow[] }).rows ?? [];
    if (rows.length === 0) throw new Error("wrongclass: no endpoint-profile row");
    return rows;
}

const ACTION_ID = /^server_action:(.+)#([A-Za-z_$][\w$]*)$/;

export function actionTarget(row: ProfileRow): { file: string; exportName: string } {
    const m = ACTION_ID.exec(row.id);
    if (!m || m[1] !== row.source.file) {
        throw new Error(`wrongclass: row ${row.id} is not server_action:<source.file>#<export>`);
    }
    return { file: m[1], exportName: m[2] };
}

export const COMPARED_HEADERS = [
    "Allow",
    "Content-Type",
    "Retry-After",
    "WWW-Authenticate",
    "Location",
];

export interface Census {
    service: string;
    rows: number;
    classes: number;
    driven: number;
    wrongCells: number;
    acceptCells: number;
    notDriven: string[];
}

export function censusLine(c: Census): string {
    return (
        `WRONG_CLASS_GATE_EXECUTED service=${c.service} rows=${c.rows} classes=${c.classes} driven=${c.driven} ` +
        `wrong_cells=${c.wrongCells} accept_cells=${c.acceptCells} not_driven=${[...c.notDriven].sort().join(",")}`
    );
}

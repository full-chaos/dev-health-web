// The access tokens the ops mock answers with. The web server reads `exp` and `sid` from an
// access token it receives (CHAOS-10876), so a mock token has the shape of the HS256 compat token:
// three base64url parts, header alg HS256. The signature is not checked under that class.
const b64u = (value: string) => Buffer.from(value).toString("base64url");

const FAR_FUTURE_EXP = 4_102_444_800; // 2100-01-01

function mockHs256Token(subject: string, exp: number = FAR_FUTURE_EXP): string {
    const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64u(
        JSON.stringify({ sub: subject, sid: "ses_MockSessionAAAAAAAAAAAAAA", exp }),
    );
    return `${header}.${payload}.${b64u("mock-signature")}`;
}

/** An access token web refreshes at once: it ends 301 s from now, inside the 5 min refresh window. */
export function mockExpiringAccessToken(
    nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
    return mockHs256Token("mock-expiring-access-token-e2e", nowSeconds + 301);
}

export const MOCK_ACCESS_TOKEN = mockHs256Token("mock-access-token-e2e");
export const MOCK_MEMBER_ACCESS_TOKEN = mockHs256Token("mock-member-access-token-e2e");
export const MOCK_REFRESHED_ACCESS_TOKEN = mockHs256Token("mock-refreshed-token-e2e");

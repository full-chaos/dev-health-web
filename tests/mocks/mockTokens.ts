// The access tokens the ops mock answers with. The web server reads `exp` and `sid` from an
// access token it receives (CHAOS-10876), so a mock token has the shape of the HS256 compat token:
// three base64url parts, header alg HS256. The signature is not checked under that class.
const b64u = (value: string) => Buffer.from(value).toString("base64url");

const FAR_FUTURE_EXP = 4_102_444_800; // 2100-01-01

function mockHs256Token(subject: string): string {
    const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64u(
        JSON.stringify({ sub: subject, sid: "ses_MockSessionAAAAAAAAAAAAAA", exp: FAR_FUTURE_EXP }),
    );
    return `${header}.${payload}.${b64u("mock-signature")}`;
}

export const MOCK_ACCESS_TOKEN = mockHs256Token("mock-access-token-e2e");
export const MOCK_MEMBER_ACCESS_TOKEN = mockHs256Token("mock-member-access-token-e2e");
export const MOCK_REFRESHED_ACCESS_TOKEN = mockHs256Token("mock-refreshed-token-e2e");

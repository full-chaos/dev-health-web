import { DefaultSession } from "next-auth";

declare module "next-auth" {
    /**
     * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
     */
    interface Session {
        user: {
            id: string;
            /** EFFECTIVE org: the impersonation target's org while impersonating, else the user's own org. */
            org_id?: string;
            /** The user's own org, regardless of impersonation. For identity-semantic checks only. */
            real_org_id?: string;
            role?: string;
            is_superuser?: boolean;
            permissions?: string[];
            needs_onboarding?: boolean;
            /** True for the sign-in that created the account (social sign-in only). */
            is_new_user?: boolean;
            is_impersonating?: boolean;
            impersonated_user_id?: string;
            impersonated_email?: string;
            impersonated_org_id?: string;
        } & DefaultSession["user"];
        access_token?: string;
        /** The service session token (aud auth-service). In-process only; never served to a browser. */
        session_access_token?: string;
        error?: string;
    }

    interface User {
        id: string;
        org_id?: string;
        role?: string;
        is_superuser?: boolean;
        permissions?: string[];
        needs_onboarding?: boolean;
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        /** `exp` of the access token (seconds), read from the token. */
        access_exp?: number;
        /** `sid` of the access token. */
        sid?: string;
        session_access_token?: string;
        /** `exp` of the service session token (seconds). */
        session_exp?: number;
        /** The verified actor of the access token. */
        act_sub?: string;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        org_id?: string;
        role?: string;
        is_superuser?: boolean;
        permissions?: string[];
        needs_onboarding?: boolean;
        is_new_user?: boolean;
        access_token?: string;
        refresh_token?: string;
        expires_at?: number;
        sid?: string;
        session_access_token?: string;
        session_expires_at?: number;
        act_sub?: string;
        error?: string;
        is_impersonating?: boolean;
        impersonated_user_id?: string;
        impersonated_email?: string;
        impersonated_org_id?: string;
        last_validated?: number;
    }
}

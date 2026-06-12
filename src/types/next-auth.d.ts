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
            is_impersonating?: boolean;
            impersonated_user_id?: string;
            impersonated_org_id?: string;
        } & DefaultSession["user"];
        access_token?: string;
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
        access_token?: string;
        refresh_token?: string;
        expires_at?: number;
        error?: string;
        is_impersonating?: boolean;
        impersonated_user_id?: string;
        impersonated_org_id?: string;
        last_validated?: number;
        last_impersonation_check?: number;
    }
}

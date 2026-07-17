import { z } from "zod";

const repositoryCatalogResponseSchema = z.object({
    repositories: z.array(z.string().min(1)),
});

export type RepositoryCatalog =
    | { readonly kind: "ready"; readonly repositories: readonly string[] }
    | { readonly kind: "empty" }
    | { readonly kind: "error" };

export function repositoryCatalogFrom(repositories: readonly string[]): RepositoryCatalog {
    return repositories.length > 0 ? { kind: "ready", repositories } : { kind: "empty" };
}

export function parseRepositoryCatalog(payload: unknown): RepositoryCatalog {
    const result = repositoryCatalogResponseSchema.safeParse(payload);
    return result.success ? repositoryCatalogFrom(result.data.repositories) : { kind: "error" };
}

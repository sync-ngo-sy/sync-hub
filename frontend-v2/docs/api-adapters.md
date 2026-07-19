# Per-feature API adapter template

Every feature that talks to the backend follows this shape under `features/<domain>/api/`
(established by ticket 05; see `@/lib/auth/api/` for the concrete reference implementation this
doc describes, and `docs/api-compatibility-inventory/` for the audited alias data that seeds each
domain's wire schemas). Read that inventory before writing a new domain's wire schema — it already
tells you which aliases are real and which are speculative/dead.

## The four pieces

1. **Private wire schema(s)** — a Zod schema describing the backend payload as it verifiably
   exists today, including any confirmed snake_case/camelCase or legacy-name variants (per the
   compatibility inventory, not invented). Lives in the feature's `api/` folder and is **not
   exported** outside it — nothing outside the adapter ever sees a wire-shaped object or type.
2. **A named parse/transform function** — takes `unknown` (the transport's return value), parses
   it with the wire schema, and maps it to the canonical schema's shape. Throws (a `ZodError` or a
   thrown `Error`) on anything malformed — never returns a partially-defaulted object. This is
   where alias precedence, conflict detection, and null/absence semantics from the compatibility
   inventory get encoded.
3. **A canonical camelCase schema** — the only schema/type this feature exports. Its `z.infer`
   type is what query/mutation hooks, forms, and components consume. Never has an inferred type
   written out by hand next to it — the schema is the single source of truth.
4. **Request encoders** (for mutations) — the reverse direction: canonical command/form input →
   the backend's current request keys. Lives alongside the wire schema, not in the form layer.

Reference implementation: `@/lib/auth/api/authContext.ts` (`tenantMembershipSchema` +
`wireAuthContextSchema` are the wire schemas, `authContextSchema` is canonical,
`parseAuthContext` is the parse/transform function). That endpoint has no real alias/fallback
chain, so it's a minimal example — see the alias-conflict handling note below for how a busier
endpoint (most of `candidates`, `jobs`, `search`) differs.

## Where parsing happens

`parseX(raw: unknown): X` runs **inside the React Query query/mutation function**, before the
result enters the cache — see `@/lib/auth/api/useAuthContextQuery.ts`:

```ts
export function useAuthContextQuery(userId: string | null) {
  return useQuery({
    queryKey: ['auth', 'context', userId],
    queryFn: async () => parseAuthContext(await invokePlatform('auth_context')),
    enabled: userId !== null,
  })
}
```

`select` may derive a *view* from already-canonical cached data (e.g. picking one field, sorting a
list) but must never perform wire validation or normalization — if you find yourself writing a
`??` or a casing check inside a `select`, that logic belongs in the adapter instead.

## Handling multiple accepted wire variants

When a canonical field has more than one verified wire name (check the compatibility inventory —
most endpoints in this codebase turn out to have **zero** real variants; the old frontend's `??`
chains were mostly defensive hedging against casings the backend never actually sent), use either:

- **A Zod union of the verified wire shapes**, or
- **A small named resolver** that reads each accepted key in precedence order, called from the
  parse function before `.parse()`/`.pipe()` into the canonical schema.

Either way, if two aliases for the same canonical field are both present with **conflicting
non-null values**, parsing must fail rather than silently pick one — this is a case the fixture
tests (below) need to cover explicitly.

## What's banned (see also each inventory file's "Banned patterns" section)

- No `String(x)`/`Number(x)` blanket coercion — parse into the exact expected type or fail.
- No defaults on required or security-sensitive fields (the concrete example this project keeps
  citing: a missing `role` silently becoming `"owner"` in the current `frontend/`).
- No product-level display fallback (e.g. `"Unknown"` for a missing name) inside the adapter —
  that's presentation logic and belongs after parsing, in the component, operating on a value the
  canonical schema modeled as optional/nullable.
- No carrying forward a wire name the compatibility inventory flagged as speculative/dead without
  new evidence (a captured real response or fresh backend source citation).

## Test coverage

Adapter contract tests (`*.test.ts` next to the parse function, e.g. `authContext.test.ts`) use
raw fixtures — one per accepted wire variant, asserting exact canonical output — plus rejection
cases: missing required field, invalid enum/range value, wrong null/absence handling, and
conflicting aliases where relevant. One representative test per feature additionally goes through
MSW + React Query (`useAuthContextQuery.test.ts` is the reference) to prove the full path: a raw
network fixture in, only canonical data out of the hook/cache.

## Retiring an old mapper

Before deleting a `frontend/src/features/<domain>/apiMappers.ts` function, confirm every response
case it's retained has a fixture test in the new adapter (per the compatibility inventory for that
domain) — not before. Once that holds, the old mapper is dead code and can go.

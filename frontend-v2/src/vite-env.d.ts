/// <reference types="vite/client" />

// Opts into Vite 8's strict `ImportMetaEnv` typing: without this, every
// `import.meta.env.VITE_*` access falls back to `any` via vite/client's
// default index signature. See `.env.example` for what these vars do.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

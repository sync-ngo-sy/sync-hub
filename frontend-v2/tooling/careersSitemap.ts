import { z } from 'zod'
import type { Plugin } from 'vite'

const publicJobsForSitemapSchema = z
  .object({
    jobs: z.array(z.object({ slug: z.string().min(1) }).passthrough()),
  })
  .strict()

const sitemapConfigSchema = z.object({
  siteUrl: z.url(),
  supabaseUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(1).optional(),
})

type SitemapConfig = z.infer<typeof sitemapConfigSchema>

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function renderCareersSitemap(siteUrl: string, slugs: string[]) {
  const baseUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl
  const paths = ['/careers', ...slugs.map((slug) => `/careers/${encodeURIComponent(slug)}`)]
  const urls = paths
    .map((path) => `  <url><loc>${escapeXml(`${baseUrl}${path}`)}</loc></url>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

async function fetchPublicJobSlugs(config: SitemapConfig) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return []
  }

  const baseUrl = config.supabaseUrl.endsWith('/')
    ? config.supabaseUrl.slice(0, -1)
    : config.supabaseUrl
  const response = await fetch(`${baseUrl}/functions/v1/public-jobs`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      authorization: `Bearer ${config.supabaseAnonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'list' }),
  })
  if (!response.ok) {
    throw new Error(`Public jobs returned status ${response.status}.`)
  }
  const payload: unknown = await response.json()
  return publicJobsForSitemapSchema.parse(payload).jobs.map((job) => job.slug)
}

export function careersSitemapPlugin(input: SitemapConfig): Plugin {
  const config = sitemapConfigSchema.parse(input)

  return {
    name: 'careers-sitemap',
    apply: 'build',
    async generateBundle() {
      let slugs: string[] = []
      try {
        slugs = await fetchPublicJobSlugs(config)
      } catch (error) {
        this.warn(
          `Could not load public job slugs while generating sitemap.xml; emitting the careers index only. ${error instanceof Error ? error.message : 'Unknown build error'}`,
        )
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: renderCareersSitemap(config.siteUrl, slugs),
      })
    },
  }
}

import { describe, expect, it } from 'vitest'
import { renderCareersSitemap } from './careersSitemap.js'

describe('renderCareersSitemap', () => {
  it('includes the careers page and every public job URL', () => {
    const sitemap = renderCareersSitemap('https://jobs.example.com/', [
      'senior-platform-engineer',
      'product-designer',
    ])

    expect(sitemap).toContain('<loc>https://jobs.example.com/careers</loc>')
    expect(sitemap).toContain(
      '<loc>https://jobs.example.com/careers/senior-platform-engineer</loc>',
    )
    expect(sitemap).toContain('<loc>https://jobs.example.com/careers/product-designer</loc>')
  })
})

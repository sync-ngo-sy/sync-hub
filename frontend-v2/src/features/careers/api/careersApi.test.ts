import { describe, expect, it } from 'vitest'
import {
  encodePublicApplication,
  parsePublicJobDetail,
  parsePublicJobList,
  parsePublicJobReceipt,
} from '@/features/careers/api/careersApi'
import { publicJobFixture } from '@/test/fixtures/publicJobs'

describe('careers compatibility adapters', () => {
  it('parses the verified camelCase list and detail response variants', () => {
    expect(parsePublicJobList({ jobs: [publicJobFixture] })).toEqual([publicJobFixture])
    expect(parsePublicJobDetail({ job: publicJobFixture })).toEqual(publicJobFixture)
  })

  it('rejects malformed fields instead of defaulting them', () => {
    expect(() =>
      parsePublicJobList({ jobs: [{ ...publicJobFixture, applyEnabled: undefined }] }),
    ).toThrow()
    expect(() =>
      parsePublicJobDetail({ job: { ...publicJobFixture, requiredSkills: 'TypeScript' } }),
    ).toThrow()
  })

  it('rejects speculative snake_case aliases, including conflicting values', () => {
    expect(() =>
      parsePublicJobDetail({
        job: { ...publicJobFixture, remote_policy: 'Remote' },
      }),
    ).toThrow()
  })

  it('requires the verified receipt wrapper and canonical keys', () => {
    expect(
      parsePublicJobReceipt({
        receipt: {
          accepted: true,
          applicationId: 'application-1',
          submittedAt: '2026-07-20T01:00:00.000Z',
        },
      }),
    ).toEqual({
      accepted: true,
      duplicate: false,
      applicationId: 'application-1',
      submittedAt: '2026-07-20T01:00:00.000Z',
    })
    expect(() =>
      parsePublicJobReceipt({
        accepted: true,
        application_id: 'application-1',
      }),
    ).toThrow()

    expect(
      parsePublicJobReceipt({
        receipt: {
          accepted: true,
          duplicate: true,
          applicationId: 'application-1',
          submittedAt: '2026-07-20T01:00:00.000Z',
        },
      }),
    ).toEqual({
      accepted: true,
      duplicate: true,
      applicationId: 'application-1',
      submittedAt: '2026-07-20T01:00:00.000Z',
    })
  })

  it('encodes canonical application input to the current backend request keys', async () => {
    const payload = await encodePublicApplication({
      name: 'Mina Nabil',
      email: 'mina@example.com',
      phone: '+20 100 000 0000',
      location: 'Cairo',
      currentTitle: 'Platform Engineer',
      yearsExperience: 6,
      seniority: 'Senior',
      topSkills: 'TypeScript, PostgreSQL',
      linkedinUrl: 'https://linkedin.com/in/mina',
      portfolioUrl: '',
      coverNote: 'I enjoy building dependable systems.',
      consent: true,
      resumeFile: new File(['resume'], 'mina.pdf', { type: 'application/pdf' }),
      idempotencyKey: 'application-attempt-1',
    })

    expect(payload).toEqual({
      name: 'Mina Nabil',
      email: 'mina@example.com',
      phone: '+20 100 000 0000',
      location: 'Cairo',
      currentTitle: 'Platform Engineer',
      yearsExperience: 6,
      seniority: 'Senior',
      topSkills: ['TypeScript', 'PostgreSQL'],
      linkedinUrl: 'https://linkedin.com/in/mina',
      portfolioUrl: '',
      resumeOriginalFilename: 'mina.pdf',
      resumeFile: {
        fileName: 'mina.pdf',
        contentType: 'application/pdf',
        sizeBytes: 6,
        base64: 'cmVzdW1l',
      },
      coverNote: 'I enjoy building dependable systems.',
      consent: true,
      idempotencyKey: 'application-attempt-1',
    })
  })
})

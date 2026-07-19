import { z } from 'zod'

export const publicJobSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().min(1),
    summary: z.string(),
    description: z.string(),
    location: z.string(),
    remotePolicy: z.string(),
    seniorityLevel: z.string(),
    employmentType: z.string(),
    requiredSkills: z.array(z.string()),
    preferredSkills: z.array(z.string()),
    keyResponsibilities: z.array(z.string()),
    applicationDeadline: z.string().nullable(),
    applyEnabled: z.boolean(),
    publishedAt: z.string().nullable(),
  })
  .strict()

export type PublicJob = z.infer<typeof publicJobSchema>

const allowedResumeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])

const allowedResumeExtensions = ['.pdf', '.docx', '.txt']
export const maxResumeBytes = 10 * 1024 * 1024

export const publicApplicationFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(160),
    email: z.email('Enter a valid email address.').max(254),
    phone: z.string().trim().max(80),
    location: z.string().trim().max(160),
    currentTitle: z.string().trim().min(1, 'Enter your current title.').max(180),
    yearsExperience: z.number().min(0).max(80),
    seniority: z.string().trim().min(1, 'Select your seniority.').max(80),
    topSkills: z.string().trim().min(1, 'Add at least one skill.'),
    linkedinUrl: z.union([z.url('Enter a valid LinkedIn URL.'), z.literal('')]),
    portfolioUrl: z.union([z.url('Enter a valid portfolio URL.'), z.literal('')]),
    coverNote: z.string().trim().max(4000),
    consent: z
      .boolean()
      .refine((value) => value, 'Consent is required before submitting.')
      .pipe(z.literal(true)),
    resumeFile: z
      .instanceof(File, { message: 'Upload your CV before submitting.' })
      .refine(
        (file) =>
          allowedResumeTypes.has(file.type) ||
          allowedResumeExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)),
        'Upload a PDF, DOCX, or TXT CV.',
      )
      .refine((file) => file.size <= maxResumeBytes, 'CV upload must be 10 MB or smaller.'),
    idempotencyKey: z.string().min(1).max(120),
  })
  .strict()

export type PublicApplicationForm = z.infer<typeof publicApplicationFormSchema>
export type PublicApplicationFormFields = z.input<typeof publicApplicationFormSchema>

export const publicApplicationReceiptSchema = z
  .object({
    accepted: z.literal(true),
    duplicate: z.boolean(),
    applicationId: z.string().min(1),
    submittedAt: z.string().min(1),
  })
  .strict()

export type PublicApplicationReceipt = z.infer<typeof publicApplicationReceiptSchema>

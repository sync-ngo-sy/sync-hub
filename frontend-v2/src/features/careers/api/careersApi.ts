import { z } from 'zod'
import {
  publicApplicationFormSchema,
  publicApplicationReceiptSchema,
  publicJobSchema,
  type PublicApplicationForm,
  type PublicApplicationReceipt,
  type PublicJob,
} from '@/features/careers/types'

const wirePublicJobSchema = z
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

const wirePublicJobListSchema = z.object({ jobs: z.array(wirePublicJobSchema) }).strict()
const wirePublicJobDetailSchema = z.object({ job: wirePublicJobSchema }).strict()
const wirePublicJobReceiptSchema = z
  .object({
    receipt: z
      .object({
        accepted: z.literal(true),
        duplicate: z.literal(true).optional(),
        applicationId: z.string().min(1),
        submittedAt: z.string().min(1),
      })
      .strict(),
  })
  .strict()

export function parsePublicJobList(raw: unknown): PublicJob[] {
  const wire = wirePublicJobListSchema.parse(raw)
  return z.array(publicJobSchema).parse(wire.jobs)
}

export function parsePublicJobDetail(raw: unknown): PublicJob {
  const wire = wirePublicJobDetailSchema.parse(raw)
  return publicJobSchema.parse(wire.job)
}

export function parsePublicJobReceipt(raw: unknown): PublicApplicationReceipt {
  const { receipt } = wirePublicJobReceiptSchema.parse(raw)
  return publicApplicationReceiptSchema.parse({
    ...receipt,
    duplicate: receipt.duplicate ?? false,
  })
}

function readFileAsBase64(file: File, onProgress?: (progress: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected CV could not be read.'))
        return
      }
      const base64 = reader.result.includes(',') ? reader.result.split(',').at(-1) : reader.result
      if (!base64) {
        reject(new Error('The selected CV is empty.'))
        return
      }
      onProgress?.(100)
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('The selected CV could not be read.'))
    reader.readAsDataURL(file)
  })
}

export async function encodePublicApplication(
  input: PublicApplicationForm,
  onProgress?: (progress: number) => void,
) {
  const application = publicApplicationFormSchema.parse(input)
  const base64 = await readFileAsBase64(application.resumeFile, onProgress)
  const topSkills = application.topSkills
    .split(/[,;\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean)

  return {
    name: application.name,
    email: application.email.toLowerCase(),
    phone: application.phone,
    location: application.location,
    currentTitle: application.currentTitle,
    yearsExperience: application.yearsExperience,
    seniority: application.seniority,
    topSkills,
    linkedinUrl: application.linkedinUrl,
    portfolioUrl: application.portfolioUrl,
    resumeOriginalFilename: application.resumeFile.name,
    resumeFile: {
      fileName: application.resumeFile.name,
      contentType: application.resumeFile.type,
      sizeBytes: application.resumeFile.size,
      base64,
    },
    coverNote: application.coverNote,
    consent: application.consent,
    idempotencyKey: application.idempotencyKey,
  }
}

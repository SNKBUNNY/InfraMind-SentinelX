import { PrismaClient } from '@prisma/client'

const SCHEMA_VERSION = 'v3-production'
const globalKey = `prisma_${SCHEMA_VERSION}`
const globalForPrisma = globalThis as unknown as Record<string, PrismaClient | undefined>

if (globalForPrisma.prisma && globalForPrisma[globalKey] !== globalForPrisma.prisma) {
  try { globalForPrisma.prisma.$disconnect?.() } catch {}
  globalForPrisma.prisma = undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()
globalForPrisma.prisma = db
globalForPrisma[globalKey] = db
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')
  console.log('ℹ️  La autenticación usa variables de entorno (CRM_ADMIN_EMAIL y CRM_ADMIN_PASSWORD)')
  console.log('ℹ️  No se necesitan usuarios en la base de datos')
  console.log('✨ Seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
try {
  const camps = await p.$queryRaw`
    SELECT id, name, import_columns, column_mapping FROM coldcall_campaigns ORDER BY id DESC LIMIT 5
  `
  console.log('campaigns', JSON.stringify(camps, null, 2))

  const leads = await p.$queryRaw`
    SELECT id, campaign_id, nombre, telefono,
      apollo_data IS NOT NULL as has_data,
      jsonb_typeof(apollo_data) as data_type,
      apollo_data
    FROM coldcall_prospects
    WHERE deleted_at IS NULL
    ORDER BY id DESC LIMIT 10
  `
  console.log('leads sample', JSON.stringify(leads, null, 2))

  const counts = await p.$queryRaw`
    SELECT campaign_id, COUNT(*)::int as c
    FROM coldcall_prospects WHERE deleted_at IS NULL GROUP BY campaign_id
  `
  console.log('counts by campaign', counts)

  const batches = await p.$queryRaw`
    SELECT * FROM coldcall_import_batches ORDER BY id DESC LIMIT 5
  `
  console.log('batches', JSON.stringify(batches, null, 2))
} finally {
  await p.$disconnect()
}

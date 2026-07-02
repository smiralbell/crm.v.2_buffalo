import { createHash } from 'crypto'
import { writeFileSync } from 'fs'

const rows = `NOMINA JUNIO	29/06/2026	-800.0	5218.40
QUOTA T. V.Ele.Bu	22/06/2026	-33.0	6018.40
CURSOR, AI POWERE	22/06/2026	-18.21	6051.40
TRANSFER INMEDIATA	19/06/2026	60.5	6069.61
RAIOLA NETWORKS S	16/06/2026	-12.04	6009.11
CONTABO* HOLD ONL	11/06/2026	-30.0	6021.15
ELEVENLABS.IO	10/06/2026	-19.84	6051.15
WWW.RETELLAI.COM	08/06/2026	-1.06	6070.99
TWILIO INC	06/06/2026	-25.9	6072.05
LEMSQZY* EASYPANE	06/06/2026	-16.35	6097.95
TRF.INTERNACIONAL	05/06/2026	-570.0	6114.30
SERV. EM. TRANSF.	05/06/2026	-30.0	6684.30
NEXIAIA	04/06/2026	-2600.0	6714.30
NEXIAIA	03/06/2026	-371.9	9314.30
NEXIAIA	03/06/2026	-500.0	9686.20
TRANSFER INMEDIATA	03/06/2026	3291.2	10186.20
INST.QUALITAS D	02/06/2026	-96.8	6895.00
FACEBK *YBJ56RV5M	01/06/2026	-0.88	6991.80
FIREFLIES.AI	30/05/2026	4.25	6992.68
CLAUDE.AI SUBSCRI	30/05/2026	-18.0	6988.43
TRANSFER INMEDIATA	28/05/2026	1089.0	7006.43
NOMINA MAYO	28/05/2026	-1560.0	5917.43
NOMINA MAYO	28/05/2026	-840.0	7477.43
FIREFLIES.AI	27/05/2026	-4.47	8317.43
RAIOLA NETWORKS S	26/05/2026	-12.04	8321.90
Gastos	25/05/2026	-150.0	8333.94
CURSOR, AI POWERE	22/05/2026	-17.96	8483.94
NEXIAIA	19/05/2026	-500.0	8501.90
Gastos	18/05/2026	-750.0	9001.90
WWW CONTABO COM	11/05/2026	-30.0	9751.90
ELEVENLABS.IO	10/05/2026	-19.51	9781.90
WWW.RETELLAI.COM	08/05/2026	-1.67	9801.41
TWILIO INC	06/05/2026	-27.62	9803.08
LEMSQZY* EASYPANE	06/05/2026	-16.12	9830.70
INST.QUALITAS D	04/05/2026	-96.8	9846.82
FIREFLIES.AI	01/05/2026	24.48	9943.62
CLAUDE.AI SUBSCRI	30/04/2026	-18.0	9919.14
NOMINA ABRIL	27/04/2026	-900.0	9937.14
NOMINA ABRIL	27/04/2026	-1100.0	10837.14
FIREFLIES.AI	24/04/2026	-4.46	11937.14
FIREFLIES.AI	24/04/2026	-25.83	11941.60
CURSOR, AI POWERE	22/04/2026	-17.74	11967.43
I.V.A. MODELO 303	20/04/2026	-4249.31	11985.17
I.R.P.F. MOD.111	20/04/2026	-4.5	16234.48
TRASPASO	17/04/2026	3158.1	16238.98
TRANSFER INMEDIATA	16/04/2026	1799.48	13080.88
TRANSFER INMEDIATA	16/04/2026	834.9	11281.40
WWW.RETELLAI.COM	16/04/2026	-12.61	10446.50
RAIOLA NETWORKS S	16/04/2026	-12.04	10459.11
BROKERS 88 CORR.	15/04/2026	-679.93	10471.15
WWW CONTABO COM	11/04/2026	-30.0	11151.08
ELEVENLABS.IO	10/04/2026	-19.64	11181.08
WWW.RETELLAI.COM	08/04/2026	-0.55	11200.72
TWILIO INC	06/04/2026	-22.44	11201.27
LEMSQZY* EASYPANE	06/04/2026	-16.35	11223.71
NEXIAIA	01/04/2026	-200.0	11240.06
INST.QUALITAS D	01/04/2026	-96.8	11440.06
WWW.RETELLAI.COM	31/03/2026	-195.08	11536.86
TWILIO INC	28/03/2026	-40.35	11731.94
TWILIO INC	27/03/2026	-18.05	11772.29
NOMINA MARÇ	27/03/2026	-1120.0	11790.34
NOMINA FEBRER	27/03/2026	-1680.0	12910.34
Gastos	23/03/2026	-1200.0	14590.34
WWW.RETELLAI.COM	23/03/2026	-193.62	15790.34
CURSOR, AI POWERE	22/03/2026	-18.05	15983.96
TRASPASO	22/03/2026	11858.0	16002.01
NEXIAIA	17/03/2026	-701.9	4144.01
RAIOLA NETWORKS S	17/03/2026	-21.34	4845.91
WWW.RETELLAI.COM	16/03/2026	-9.68	4867.25
WWW CONTABO COM	12/03/2026	-33.88	4876.93
TRANSFER INMEDIATA	11/03/2026	471.9	4910.81
WWW CONTABO COM	11/03/2026	-25.0	4438.91
ELEVENLABS.IO	10/03/2026	-9.94	4463.91
Gastos	10/03/2026	-300.0	4473.85
Gastos	10/03/2026	-300.0	4773.85
WWW.RETELLAI.COM	08/03/2026	-4.48	5073.85
LEMSQZY* EASYPANE	06/03/2026	-16.29	5078.33
NEXIAIA	03/03/2026	-170.0	5094.62
INST.QUALITAS D	03/03/2026	-144.21	5264.62
MANUS AI	27/02/2026	-17.62	5408.83
TRANSFER INMEDIATA	25/02/2026	1258.4	5426.45
NOMINA FEBRER	25/02/2026	-1400.0	4168.05
NOMINA FEBRER	25/02/2026	-1400.0	5568.05
CURSOR, AI POWERE	22/02/2026	-17.7	6968.05
TRANSF. A SU FAVOR	21/02/2026	774.4	6985.75
Gastos	16/02/2026	-160.0	6211.35
RAIOLA NETWORKS S	14/02/2026	-12.04	6371.35
MANUS AI* TRIAL O	14/02/2026	42.34	6383.39
TRASPASO	13/02/2026	3158.1	6341.05
WWW CONTABO COM	12/02/2026	-33.88	3182.95
WWW CONTABO COM	11/02/2026	-25.0	3216.83
MANUS AI* TRIAL O	11/02/2026	-42.34	3241.83
NEXIAIA	10/02/2026	-170.0	3284.17
Gastos	10/02/2026	-243.0	3454.17
WWW.RETELLAI.COM	08/02/2026	-2.4	3697.17
OPENAI	07/02/2026	4.4	3699.57
TWILIO INC	07/02/2026	-18.88	3695.17
OPENAI	06/02/2026	-5.46	3714.05
LEMSQZY* EASYPANE	06/02/2026	-15.99	3719.51
FIREFLIES.AI	04/02/2026	-105.9	3735.50
INST.QUALITAS D	03/02/2026	-96.8	3841.40
RAIOLA NETWORKS S	02/02/2026	-12.04	3938.20
I.V.A. MODELO 303	30/01/2026	-2750.74	3950.24
TRANSFER INMEDIATA	29/01/2026	605.0	6700.98
NOMINA GENER	28/01/2026	-1059.0	6095.98
NOMINA GENER	28/01/2026	-1000.0	7154.98
OPENAI	27/01/2026	-6.38	8154.98
OPENAI	27/01/2026	-4.4	8161.36
CURSOR, AI POWERE	22/01/2026	-17.81	8165.76
I.R.P.F. MOD.111	20/01/2026	-55.95	8183.57
TRANSFER INMEDIATA	19/01/2026	1258.4	8239.52
TRANSFER INMEDIATA	19/01/2026	223.02	6981.12
WWW CONTABO COM	15/01/2026	-27.42	6758.10
Desarrollo de age	13/01/2026	-31.8	6785.52
TRANSF. A SU FAVOR	13/01/2026	1331.0	6817.32
WWW CONTABO COM	12/01/2026	-33.88	5486.32
MANTENIMIENTO	07/01/2026	21.6	5520.20
MANTENIMIENTO	01/01/2026	-21.6	5498.60
INST.QUALITAS D	31/12/2025	-96.8	5520.20
NOMINA DESEMBRE	27/12/2025	-900.0	5617.00
NOMINA DESEMBRE	27/12/2025	-900.0	6517.00
TRANSFER INMEDIATA	19/12/2025	2420.0	7417.00
QUOTA T. V.Ele.Bu	18/12/2025	-33.0	4997.00
RAIOLA NETWORKS S	17/12/2025	-12.04	5030.00
WWW CONTABO COM	16/12/2025	-33.88	5042.04
TWILIO INC	16/12/2025	-17.73	5075.92
TWILIO INC	16/12/2025	-26.6	5093.65
NEXIAIA	07/12/2025	-943.0	5120.25
TRANSFER INMEDIATA	05/12/2025	1754.5	6063.25
P.SERV. TRF. AJENA	04/12/2025	6.0	4308.75
TRANSFER INMEDIATA	03/12/2025	1858.86	4302.75
NOMINA NOV	02/12/2025	-500.0	2443.89
Nomina Nov	02/12/2025	-500.0	2943.89
P.SERV. TRF. AJENA	02/12/2025	-6.0	3443.89
INST.QUALITAS D	01/12/2025	-96.8	3449.89
P.SERV. TRF. AJENA	06/11/2025	6.0	3546.69
P.SERV. TRF. AJENA	06/11/2025	6.0	3540.69
Gastos	04/11/2025	-942.5	3534.69
P.SERV. TRF. AJENA	04/11/2025	-6.0	4477.19
TRANSFER INMEDIATA	04/11/2025	1754.5	4483.19
Gastos	01/11/2025	-1000.0	2728.69
P.SERV. TRF. AJENA	01/11/2025	-6.0	3728.69
INST.QUALITAS D	01/11/2025	-96.8	3734.69
TRANSFER INMEDIATA	31/10/2025	2830.49	3831.49
TRANSFER INMEDIATA	31/10/2025	500.0	1001.00
TRASPASO	31/10/2025	500.0	501.00
TRANSFER INMEDIATA	30/10/2025	1.0	1.00`

function parseDate(d) {
  const [dd, mm, yyyy] = d.split('/')
  return `${yyyy}-${mm}-${dd}`
}

function normDesc(s) {
  return s.trim().toUpperCase().replace(/\s+/g, ' ')
}

function esc(s) {
  return s.replace(/'/g, "''")
}

function hashFor(accountPlaceholder, date, amount, description, entryRef) {
  const normalizedDesc = normDesc(description)
  const ref = entryRef ? `|${entryRef}` : ''
  const data = `${accountPlaceholder}|${date}|${amount.toFixed(2)}|${normalizedDesc}${ref}`
  return createHash('sha256').update(data).digest('hex')
}

const txs = rows.trim().split('\n').map((line, i) => {
  const [desc, date, amount, balance] = line.split('\t')
  return {
    desc,
    date: parseDate(date),
    amount: parseFloat(amount),
    balance: parseFloat(balance),
    ref: `stmt-import-${String(i + 1).padStart(3, '0')}`,
  }
})

const lines = []
lines.push(`-- Importación manual extracto CaixaBank ES1621000795180200641987`)
lines.push(`-- Periodo: 01/09/2025 - 02/07/2026`)
lines.push(`-- Excluidas (ya en BD): NEXIAIA 02/07, ADMINISTRACIÓN DEP. 01/07, ANTHROPIC* CLAUDE 30/06`)
lines.push(`-- Movimientos en este script: ${txs.length}`)
lines.push('')
lines.push('BEGIN;')
lines.push('')
lines.push(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)
lines.push('')
lines.push(`DO $$`)
lines.push(`DECLARE`)
lines.push(`  v_account_id UUID;`)
lines.push(`  v_statement_id UUID := gen_random_uuid();`)
lines.push(`BEGIN`)
lines.push(`  SELECT id INTO v_account_id`)
lines.push(`  FROM bank_accounts`)
lines.push(`  WHERE iban = 'ES1621000795180200641987'`)
lines.push(`     OR iban LIKE 'ENABLEBANKING:%'`)
lines.push(`  ORDER BY CASE WHEN iban = 'ES1621000795180200641987' THEN 0 ELSE 1 END`)
lines.push(`  LIMIT 1;`)
lines.push('')
lines.push(`  IF v_account_id IS NULL THEN`)
lines.push(`    RAISE EXCEPTION 'No se encontró bank_accounts para ES1621000795180200641987 ni ENABLEBANKING:%%';`)
lines.push(`  END IF;`)
lines.push('')
lines.push(`  INSERT INTO bank_statements (id, account_id, period_start, period_end, uploaded_at, file_hash, original_filename)`)
lines.push(`  VALUES (`)
lines.push(`    v_statement_id,`)
lines.push(`    v_account_id,`)
lines.push(`    '2025-09-01',`)
lines.push(`    '2026-07-02',`)
lines.push(`    NOW(),`)
lines.push(`    encode(digest('manual-extract-2025-09-01_2026-07-02', 'sha256'), 'hex'),`)
lines.push(`    'extracto-caixabank-manual-2026-07-02.csv'`)
lines.push(`  );`)
lines.push('')

for (const tx of txs) {
  const h = hashFor('__ACCOUNT_ID__', tx.date, tx.amount, tx.desc, tx.ref)
  lines.push(`  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)`)
  lines.push(`  VALUES (`)
  lines.push(`    gen_random_uuid(),`)
  lines.push(`    v_account_id,`)
  lines.push(`    v_statement_id,`)
  lines.push(`    '${tx.date}',`)
  lines.push(`    ${tx.amount.toFixed(2)},`)
  lines.push(`    '${esc(tx.desc)}',`)
  lines.push(`    encode(digest(v_account_id::text || substr('${h}', 15), 'sha256'), 'hex'),`)
  lines.push(`    ${tx.balance.toFixed(2)},`)
  lines.push(`    '${tx.ref}',`)
  lines.push(`    NOW()`)
  lines.push(`  ) ON CONFLICT (account_id, hash) DO NOTHING;`)
}

// Fix hash computation in SQL properly
let sql = lines.join('\n')
sql = sql.replace(
  /encode\(digest\(v_account_id::text \|\| substr\('([a-f0-9]+)', 15\), 'sha256'\), 'hex'\)/g,
  (_, partial) => {
    // We'll regenerate properly below
    return `__HASH_PLACEHOLDER__`
  }
)

// Regenerate full SQL with proper inline hash using SQL digest
const finalLines = []
finalLines.push(`-- Importación manual extracto CaixaBank ES1621000795180200641987`)
finalLines.push(`-- Periodo: 01/09/2025 - 02/07/2026`)
finalLines.push(`-- Excluidas (ya en BD): NEXIAIA 02/07, ADMINISTRACIÓN DEP. 01/07, ANTHROPIC* CLAUDE 30/06`)
finalLines.push(`-- Movimientos en este script: ${txs.length}`)
finalLines.push('')
finalLines.push('BEGIN;')
finalLines.push('')
finalLines.push(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)
finalLines.push('')
finalLines.push(`DO $$`)
finalLines.push(`DECLARE`)
finalLines.push(`  v_account_id UUID;`)
finalLines.push(`  v_statement_id UUID := gen_random_uuid();`)
finalLines.push(`BEGIN`)
finalLines.push(`  SELECT id INTO v_account_id`)
finalLines.push(`  FROM bank_accounts`)
finalLines.push(`  WHERE iban = 'ES1621000795180200641987'`)
finalLines.push(`     OR iban LIKE 'ENABLEBANKING:%'`)
finalLines.push(`  ORDER BY CASE WHEN iban = 'ES1621000795180200641987' THEN 0 ELSE 1 END`)
finalLines.push(`  LIMIT 1;`)
finalLines.push('')
finalLines.push(`  IF v_account_id IS NULL THEN`)
finalLines.push(`    RAISE EXCEPTION 'No se encontró bank_accounts para ES1621000795180200641987 ni ENABLEBANKING:%%';`)
finalLines.push(`  END IF;`)
finalLines.push('')
finalLines.push(`  INSERT INTO bank_statements (id, account_id, period_start, period_end, uploaded_at, file_hash, original_filename)`)
finalLines.push(`  VALUES (`)
finalLines.push(`    v_statement_id,`)
finalLines.push(`    v_account_id,`)
finalLines.push(`    '2025-09-01',`)
finalLines.push(`    '2026-07-02',`)
finalLines.push(`    NOW(),`)
finalLines.push(`    encode(digest('manual-extract-2025-09-01_2026-07-02', 'sha256'), 'hex'),`)
finalLines.push(`    'extracto-caixabank-manual-2026-07-02.csv'`)
finalLines.push(`  );`)
finalLines.push('')

for (const tx of txs) {
  const normalizedDesc = normDesc(tx.desc)
  const amountStr = tx.amount.toFixed(2)
  const hashPayload = `v_account_id::text || '|' || '${tx.date}' || '|' || '${amountStr}' || '|' || '${esc(normalizedDesc)}' || '|' || '${tx.ref}'`
  finalLines.push(`  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)`)
  finalLines.push(`  SELECT`)
  finalLines.push(`    gen_random_uuid(),`)
  finalLines.push(`    v_account_id,`)
  finalLines.push(`    v_statement_id,`)
  finalLines.push(`    '${tx.date}',`)
  finalLines.push(`    ${amountStr},`)
  finalLines.push(`    '${esc(tx.desc)}',`)
  finalLines.push(`    encode(digest(${hashPayload}, 'sha256'), 'hex'),`)
  finalLines.push(`    ${tx.balance.toFixed(2)},`)
  finalLines.push(`    '${tx.ref}',`)
  finalLines.push(`    NOW()`)
  finalLines.push(`  WHERE NOT EXISTS (`)
  finalLines.push(`    SELECT 1 FROM bank_transactions bt`)
  finalLines.push(`    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(${hashPayload}, 'sha256'), 'hex')`)
  finalLines.push(`  );`)
  finalLines.push('')
}

finalLines.push(`  RAISE NOTICE 'Importados movimientos del extracto manual (% filas intentadas)', ${txs.length};`)
finalLines.push(`END $$;`)
finalLines.push('')
finalLines.push('COMMIT;')
finalLines.push('')

const outPath = 'prisma/IMPORT_BANK_EXTRACT_2025-09_2026-07.sql'
writeFileSync(outPath, finalLines.join('\n'), 'utf8')
console.log(`Wrote ${outPath} with ${txs.length} transactions`)

-- Importación manual extracto CaixaBank ES1621000795180200641987
-- Periodo: 01/09/2025 - 02/07/2026
-- Excluidas (ya en BD): NEXIAIA 02/07, ADMINISTRACIÓN DEP. 01/07, ANTHROPIC* CLAUDE 30/06
-- Movimientos en este script: 147

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_account_id UUID;
  v_statement_id UUID := gen_random_uuid();
BEGIN
  SELECT id INTO v_account_id
  FROM bank_accounts
  WHERE iban = 'ES1621000795180200641987'
     OR iban LIKE 'ENABLEBANKING:%'
  ORDER BY CASE WHEN iban = 'ES1621000795180200641987' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró bank_accounts para ES1621000795180200641987 ni ENABLEBANKING:%%';
  END IF;

  INSERT INTO bank_statements (id, account_id, period_start, period_end, uploaded_at, file_hash, original_filename)
  VALUES (
    v_statement_id,
    v_account_id,
    '2025-09-01',
    '2026-07-02',
    NOW(),
    encode(digest('manual-extract-2025-09-01_2026-07-02', 'sha256'), 'hex'),
    'extracto-caixabank-manual-2026-07-02.csv'
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-29',
    -800.00,
    'NOMINA JUNIO',
    encode(digest(v_account_id::text || '|' || '2026-06-29' || '|' || '-800.00' || '|' || 'NOMINA JUNIO' || '|' || 'stmt-import-001', 'sha256'), 'hex'),
    5218.40,
    'stmt-import-001',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-29' || '|' || '-800.00' || '|' || 'NOMINA JUNIO' || '|' || 'stmt-import-001', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-22',
    -33.00,
    'QUOTA T. V.Ele.Bu',
    encode(digest(v_account_id::text || '|' || '2026-06-22' || '|' || '-33.00' || '|' || 'QUOTA T. V.ELE.BU' || '|' || 'stmt-import-002', 'sha256'), 'hex'),
    6018.40,
    'stmt-import-002',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-22' || '|' || '-33.00' || '|' || 'QUOTA T. V.ELE.BU' || '|' || 'stmt-import-002', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-22',
    -18.21,
    'CURSOR, AI POWERE',
    encode(digest(v_account_id::text || '|' || '2026-06-22' || '|' || '-18.21' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-003', 'sha256'), 'hex'),
    6051.40,
    'stmt-import-003',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-22' || '|' || '-18.21' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-003', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-19',
    60.50,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-06-19' || '|' || '60.50' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-004', 'sha256'), 'hex'),
    6069.61,
    'stmt-import-004',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-19' || '|' || '60.50' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-004', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-16',
    -12.04,
    'RAIOLA NETWORKS S',
    encode(digest(v_account_id::text || '|' || '2026-06-16' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-005', 'sha256'), 'hex'),
    6009.11,
    'stmt-import-005',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-16' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-005', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-11',
    -30.00,
    'CONTABO* HOLD ONL',
    encode(digest(v_account_id::text || '|' || '2026-06-11' || '|' || '-30.00' || '|' || 'CONTABO* HOLD ONL' || '|' || 'stmt-import-006', 'sha256'), 'hex'),
    6021.15,
    'stmt-import-006',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-11' || '|' || '-30.00' || '|' || 'CONTABO* HOLD ONL' || '|' || 'stmt-import-006', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-10',
    -19.84,
    'ELEVENLABS.IO',
    encode(digest(v_account_id::text || '|' || '2026-06-10' || '|' || '-19.84' || '|' || 'ELEVENLABS.IO' || '|' || 'stmt-import-007', 'sha256'), 'hex'),
    6051.15,
    'stmt-import-007',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-10' || '|' || '-19.84' || '|' || 'ELEVENLABS.IO' || '|' || 'stmt-import-007', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-08',
    -1.06,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-06-08' || '|' || '-1.06' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-008', 'sha256'), 'hex'),
    6070.99,
    'stmt-import-008',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-08' || '|' || '-1.06' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-008', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-06',
    -25.90,
    'TWILIO INC',
    encode(digest(v_account_id::text || '|' || '2026-06-06' || '|' || '-25.90' || '|' || 'TWILIO INC' || '|' || 'stmt-import-009', 'sha256'), 'hex'),
    6072.05,
    'stmt-import-009',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-06' || '|' || '-25.90' || '|' || 'TWILIO INC' || '|' || 'stmt-import-009', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-06',
    -16.35,
    'LEMSQZY* EASYPANE',
    encode(digest(v_account_id::text || '|' || '2026-06-06' || '|' || '-16.35' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-010', 'sha256'), 'hex'),
    6097.95,
    'stmt-import-010',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-06' || '|' || '-16.35' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-010', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-05',
    -570.00,
    'TRF.INTERNACIONAL',
    encode(digest(v_account_id::text || '|' || '2026-06-05' || '|' || '-570.00' || '|' || 'TRF.INTERNACIONAL' || '|' || 'stmt-import-011', 'sha256'), 'hex'),
    6114.30,
    'stmt-import-011',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-05' || '|' || '-570.00' || '|' || 'TRF.INTERNACIONAL' || '|' || 'stmt-import-011', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-05',
    -30.00,
    'SERV. EM. TRANSF.',
    encode(digest(v_account_id::text || '|' || '2026-06-05' || '|' || '-30.00' || '|' || 'SERV. EM. TRANSF.' || '|' || 'stmt-import-012', 'sha256'), 'hex'),
    6684.30,
    'stmt-import-012',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-05' || '|' || '-30.00' || '|' || 'SERV. EM. TRANSF.' || '|' || 'stmt-import-012', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-04',
    -2600.00,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2026-06-04' || '|' || '-2600.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-013', 'sha256'), 'hex'),
    6714.30,
    'stmt-import-013',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-04' || '|' || '-2600.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-013', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-03',
    -371.90,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2026-06-03' || '|' || '-371.90' || '|' || 'NEXIAIA' || '|' || 'stmt-import-014', 'sha256'), 'hex'),
    9314.30,
    'stmt-import-014',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-03' || '|' || '-371.90' || '|' || 'NEXIAIA' || '|' || 'stmt-import-014', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-03',
    -500.00,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2026-06-03' || '|' || '-500.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-015', 'sha256'), 'hex'),
    9686.20,
    'stmt-import-015',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-03' || '|' || '-500.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-015', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-03',
    3291.20,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-06-03' || '|' || '3291.20' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-016', 'sha256'), 'hex'),
    10186.20,
    'stmt-import-016',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-03' || '|' || '3291.20' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-016', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-02',
    -96.80,
    'INST.QUALITAS D',
    encode(digest(v_account_id::text || '|' || '2026-06-02' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-017', 'sha256'), 'hex'),
    6895.00,
    'stmt-import-017',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-02' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-017', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-06-01',
    -0.88,
    'FACEBK *YBJ56RV5M',
    encode(digest(v_account_id::text || '|' || '2026-06-01' || '|' || '-0.88' || '|' || 'FACEBK *YBJ56RV5M' || '|' || 'stmt-import-018', 'sha256'), 'hex'),
    6991.80,
    'stmt-import-018',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-06-01' || '|' || '-0.88' || '|' || 'FACEBK *YBJ56RV5M' || '|' || 'stmt-import-018', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-30',
    4.25,
    'FIREFLIES.AI',
    encode(digest(v_account_id::text || '|' || '2026-05-30' || '|' || '4.25' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-019', 'sha256'), 'hex'),
    6992.68,
    'stmt-import-019',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-30' || '|' || '4.25' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-019', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-30',
    -18.00,
    'CLAUDE.AI SUBSCRI',
    encode(digest(v_account_id::text || '|' || '2026-05-30' || '|' || '-18.00' || '|' || 'CLAUDE.AI SUBSCRI' || '|' || 'stmt-import-020', 'sha256'), 'hex'),
    6988.43,
    'stmt-import-020',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-30' || '|' || '-18.00' || '|' || 'CLAUDE.AI SUBSCRI' || '|' || 'stmt-import-020', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-28',
    1089.00,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-05-28' || '|' || '1089.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-021', 'sha256'), 'hex'),
    7006.43,
    'stmt-import-021',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-28' || '|' || '1089.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-021', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-28',
    -1560.00,
    'NOMINA MAYO',
    encode(digest(v_account_id::text || '|' || '2026-05-28' || '|' || '-1560.00' || '|' || 'NOMINA MAYO' || '|' || 'stmt-import-022', 'sha256'), 'hex'),
    5917.43,
    'stmt-import-022',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-28' || '|' || '-1560.00' || '|' || 'NOMINA MAYO' || '|' || 'stmt-import-022', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-28',
    -840.00,
    'NOMINA MAYO',
    encode(digest(v_account_id::text || '|' || '2026-05-28' || '|' || '-840.00' || '|' || 'NOMINA MAYO' || '|' || 'stmt-import-023', 'sha256'), 'hex'),
    7477.43,
    'stmt-import-023',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-28' || '|' || '-840.00' || '|' || 'NOMINA MAYO' || '|' || 'stmt-import-023', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-27',
    -4.47,
    'FIREFLIES.AI',
    encode(digest(v_account_id::text || '|' || '2026-05-27' || '|' || '-4.47' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-024', 'sha256'), 'hex'),
    8317.43,
    'stmt-import-024',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-27' || '|' || '-4.47' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-024', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-26',
    -12.04,
    'RAIOLA NETWORKS S',
    encode(digest(v_account_id::text || '|' || '2026-05-26' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-025', 'sha256'), 'hex'),
    8321.90,
    'stmt-import-025',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-26' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-025', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-25',
    -150.00,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2026-05-25' || '|' || '-150.00' || '|' || 'GASTOS' || '|' || 'stmt-import-026', 'sha256'), 'hex'),
    8333.94,
    'stmt-import-026',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-25' || '|' || '-150.00' || '|' || 'GASTOS' || '|' || 'stmt-import-026', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-22',
    -17.96,
    'CURSOR, AI POWERE',
    encode(digest(v_account_id::text || '|' || '2026-05-22' || '|' || '-17.96' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-027', 'sha256'), 'hex'),
    8483.94,
    'stmt-import-027',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-22' || '|' || '-17.96' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-027', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-19',
    -500.00,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2026-05-19' || '|' || '-500.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-028', 'sha256'), 'hex'),
    8501.90,
    'stmt-import-028',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-19' || '|' || '-500.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-028', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-18',
    -750.00,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2026-05-18' || '|' || '-750.00' || '|' || 'GASTOS' || '|' || 'stmt-import-029', 'sha256'), 'hex'),
    9001.90,
    'stmt-import-029',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-18' || '|' || '-750.00' || '|' || 'GASTOS' || '|' || 'stmt-import-029', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-11',
    -30.00,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2026-05-11' || '|' || '-30.00' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-030', 'sha256'), 'hex'),
    9751.90,
    'stmt-import-030',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-11' || '|' || '-30.00' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-030', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-10',
    -19.51,
    'ELEVENLABS.IO',
    encode(digest(v_account_id::text || '|' || '2026-05-10' || '|' || '-19.51' || '|' || 'ELEVENLABS.IO' || '|' || 'stmt-import-031', 'sha256'), 'hex'),
    9781.90,
    'stmt-import-031',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-10' || '|' || '-19.51' || '|' || 'ELEVENLABS.IO' || '|' || 'stmt-import-031', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-08',
    -1.67,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-05-08' || '|' || '-1.67' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-032', 'sha256'), 'hex'),
    9801.41,
    'stmt-import-032',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-08' || '|' || '-1.67' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-032', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-06',
    -27.62,
    'TWILIO INC',
    encode(digest(v_account_id::text || '|' || '2026-05-06' || '|' || '-27.62' || '|' || 'TWILIO INC' || '|' || 'stmt-import-033', 'sha256'), 'hex'),
    9803.08,
    'stmt-import-033',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-06' || '|' || '-27.62' || '|' || 'TWILIO INC' || '|' || 'stmt-import-033', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-06',
    -16.12,
    'LEMSQZY* EASYPANE',
    encode(digest(v_account_id::text || '|' || '2026-05-06' || '|' || '-16.12' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-034', 'sha256'), 'hex'),
    9830.70,
    'stmt-import-034',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-06' || '|' || '-16.12' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-034', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-04',
    -96.80,
    'INST.QUALITAS D',
    encode(digest(v_account_id::text || '|' || '2026-05-04' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-035', 'sha256'), 'hex'),
    9846.82,
    'stmt-import-035',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-04' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-035', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-05-01',
    24.48,
    'FIREFLIES.AI',
    encode(digest(v_account_id::text || '|' || '2026-05-01' || '|' || '24.48' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-036', 'sha256'), 'hex'),
    9943.62,
    'stmt-import-036',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-05-01' || '|' || '24.48' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-036', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-30',
    -18.00,
    'CLAUDE.AI SUBSCRI',
    encode(digest(v_account_id::text || '|' || '2026-04-30' || '|' || '-18.00' || '|' || 'CLAUDE.AI SUBSCRI' || '|' || 'stmt-import-037', 'sha256'), 'hex'),
    9919.14,
    'stmt-import-037',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-30' || '|' || '-18.00' || '|' || 'CLAUDE.AI SUBSCRI' || '|' || 'stmt-import-037', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-27',
    -900.00,
    'NOMINA ABRIL',
    encode(digest(v_account_id::text || '|' || '2026-04-27' || '|' || '-900.00' || '|' || 'NOMINA ABRIL' || '|' || 'stmt-import-038', 'sha256'), 'hex'),
    9937.14,
    'stmt-import-038',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-27' || '|' || '-900.00' || '|' || 'NOMINA ABRIL' || '|' || 'stmt-import-038', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-27',
    -1100.00,
    'NOMINA ABRIL',
    encode(digest(v_account_id::text || '|' || '2026-04-27' || '|' || '-1100.00' || '|' || 'NOMINA ABRIL' || '|' || 'stmt-import-039', 'sha256'), 'hex'),
    10837.14,
    'stmt-import-039',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-27' || '|' || '-1100.00' || '|' || 'NOMINA ABRIL' || '|' || 'stmt-import-039', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-24',
    -4.46,
    'FIREFLIES.AI',
    encode(digest(v_account_id::text || '|' || '2026-04-24' || '|' || '-4.46' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-040', 'sha256'), 'hex'),
    11937.14,
    'stmt-import-040',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-24' || '|' || '-4.46' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-040', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-24',
    -25.83,
    'FIREFLIES.AI',
    encode(digest(v_account_id::text || '|' || '2026-04-24' || '|' || '-25.83' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-041', 'sha256'), 'hex'),
    11941.60,
    'stmt-import-041',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-24' || '|' || '-25.83' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-041', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-22',
    -17.74,
    'CURSOR, AI POWERE',
    encode(digest(v_account_id::text || '|' || '2026-04-22' || '|' || '-17.74' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-042', 'sha256'), 'hex'),
    11967.43,
    'stmt-import-042',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-22' || '|' || '-17.74' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-042', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-20',
    -4249.31,
    'I.V.A. MODELO 303',
    encode(digest(v_account_id::text || '|' || '2026-04-20' || '|' || '-4249.31' || '|' || 'I.V.A. MODELO 303' || '|' || 'stmt-import-043', 'sha256'), 'hex'),
    11985.17,
    'stmt-import-043',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-20' || '|' || '-4249.31' || '|' || 'I.V.A. MODELO 303' || '|' || 'stmt-import-043', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-20',
    -4.50,
    'I.R.P.F. MOD.111',
    encode(digest(v_account_id::text || '|' || '2026-04-20' || '|' || '-4.50' || '|' || 'I.R.P.F. MOD.111' || '|' || 'stmt-import-044', 'sha256'), 'hex'),
    16234.48,
    'stmt-import-044',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-20' || '|' || '-4.50' || '|' || 'I.R.P.F. MOD.111' || '|' || 'stmt-import-044', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-17',
    3158.10,
    'TRASPASO',
    encode(digest(v_account_id::text || '|' || '2026-04-17' || '|' || '3158.10' || '|' || 'TRASPASO' || '|' || 'stmt-import-045', 'sha256'), 'hex'),
    16238.98,
    'stmt-import-045',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-17' || '|' || '3158.10' || '|' || 'TRASPASO' || '|' || 'stmt-import-045', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-16',
    1799.48,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-04-16' || '|' || '1799.48' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-046', 'sha256'), 'hex'),
    13080.88,
    'stmt-import-046',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-16' || '|' || '1799.48' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-046', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-16',
    834.90,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-04-16' || '|' || '834.90' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-047', 'sha256'), 'hex'),
    11281.40,
    'stmt-import-047',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-16' || '|' || '834.90' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-047', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-16',
    -12.61,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-04-16' || '|' || '-12.61' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-048', 'sha256'), 'hex'),
    10446.50,
    'stmt-import-048',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-16' || '|' || '-12.61' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-048', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-16',
    -12.04,
    'RAIOLA NETWORKS S',
    encode(digest(v_account_id::text || '|' || '2026-04-16' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-049', 'sha256'), 'hex'),
    10459.11,
    'stmt-import-049',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-16' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-049', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-15',
    -679.93,
    'BROKERS 88 CORR.',
    encode(digest(v_account_id::text || '|' || '2026-04-15' || '|' || '-679.93' || '|' || 'BROKERS 88 CORR.' || '|' || 'stmt-import-050', 'sha256'), 'hex'),
    10471.15,
    'stmt-import-050',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-15' || '|' || '-679.93' || '|' || 'BROKERS 88 CORR.' || '|' || 'stmt-import-050', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-11',
    -30.00,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2026-04-11' || '|' || '-30.00' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-051', 'sha256'), 'hex'),
    11151.08,
    'stmt-import-051',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-11' || '|' || '-30.00' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-051', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-10',
    -19.64,
    'ELEVENLABS.IO',
    encode(digest(v_account_id::text || '|' || '2026-04-10' || '|' || '-19.64' || '|' || 'ELEVENLABS.IO' || '|' || 'stmt-import-052', 'sha256'), 'hex'),
    11181.08,
    'stmt-import-052',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-10' || '|' || '-19.64' || '|' || 'ELEVENLABS.IO' || '|' || 'stmt-import-052', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-08',
    -0.55,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-04-08' || '|' || '-0.55' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-053', 'sha256'), 'hex'),
    11200.72,
    'stmt-import-053',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-08' || '|' || '-0.55' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-053', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-06',
    -22.44,
    'TWILIO INC',
    encode(digest(v_account_id::text || '|' || '2026-04-06' || '|' || '-22.44' || '|' || 'TWILIO INC' || '|' || 'stmt-import-054', 'sha256'), 'hex'),
    11201.27,
    'stmt-import-054',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-06' || '|' || '-22.44' || '|' || 'TWILIO INC' || '|' || 'stmt-import-054', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-06',
    -16.35,
    'LEMSQZY* EASYPANE',
    encode(digest(v_account_id::text || '|' || '2026-04-06' || '|' || '-16.35' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-055', 'sha256'), 'hex'),
    11223.71,
    'stmt-import-055',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-06' || '|' || '-16.35' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-055', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-01',
    -200.00,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2026-04-01' || '|' || '-200.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-056', 'sha256'), 'hex'),
    11240.06,
    'stmt-import-056',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-01' || '|' || '-200.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-056', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-04-01',
    -96.80,
    'INST.QUALITAS D',
    encode(digest(v_account_id::text || '|' || '2026-04-01' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-057', 'sha256'), 'hex'),
    11440.06,
    'stmt-import-057',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-04-01' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-057', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-31',
    -195.08,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-03-31' || '|' || '-195.08' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-058', 'sha256'), 'hex'),
    11536.86,
    'stmt-import-058',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-31' || '|' || '-195.08' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-058', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-28',
    -40.35,
    'TWILIO INC',
    encode(digest(v_account_id::text || '|' || '2026-03-28' || '|' || '-40.35' || '|' || 'TWILIO INC' || '|' || 'stmt-import-059', 'sha256'), 'hex'),
    11731.94,
    'stmt-import-059',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-28' || '|' || '-40.35' || '|' || 'TWILIO INC' || '|' || 'stmt-import-059', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-27',
    -18.05,
    'TWILIO INC',
    encode(digest(v_account_id::text || '|' || '2026-03-27' || '|' || '-18.05' || '|' || 'TWILIO INC' || '|' || 'stmt-import-060', 'sha256'), 'hex'),
    11772.29,
    'stmt-import-060',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-27' || '|' || '-18.05' || '|' || 'TWILIO INC' || '|' || 'stmt-import-060', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-27',
    -1120.00,
    'NOMINA MARÇ',
    encode(digest(v_account_id::text || '|' || '2026-03-27' || '|' || '-1120.00' || '|' || 'NOMINA MARÇ' || '|' || 'stmt-import-061', 'sha256'), 'hex'),
    11790.34,
    'stmt-import-061',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-27' || '|' || '-1120.00' || '|' || 'NOMINA MARÇ' || '|' || 'stmt-import-061', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-27',
    -1680.00,
    'NOMINA FEBRER',
    encode(digest(v_account_id::text || '|' || '2026-03-27' || '|' || '-1680.00' || '|' || 'NOMINA FEBRER' || '|' || 'stmt-import-062', 'sha256'), 'hex'),
    12910.34,
    'stmt-import-062',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-27' || '|' || '-1680.00' || '|' || 'NOMINA FEBRER' || '|' || 'stmt-import-062', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-23',
    -1200.00,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2026-03-23' || '|' || '-1200.00' || '|' || 'GASTOS' || '|' || 'stmt-import-063', 'sha256'), 'hex'),
    14590.34,
    'stmt-import-063',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-23' || '|' || '-1200.00' || '|' || 'GASTOS' || '|' || 'stmt-import-063', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-23',
    -193.62,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-03-23' || '|' || '-193.62' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-064', 'sha256'), 'hex'),
    15790.34,
    'stmt-import-064',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-23' || '|' || '-193.62' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-064', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-22',
    -18.05,
    'CURSOR, AI POWERE',
    encode(digest(v_account_id::text || '|' || '2026-03-22' || '|' || '-18.05' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-065', 'sha256'), 'hex'),
    15983.96,
    'stmt-import-065',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-22' || '|' || '-18.05' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-065', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-22',
    11858.00,
    'TRASPASO',
    encode(digest(v_account_id::text || '|' || '2026-03-22' || '|' || '11858.00' || '|' || 'TRASPASO' || '|' || 'stmt-import-066', 'sha256'), 'hex'),
    16002.01,
    'stmt-import-066',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-22' || '|' || '11858.00' || '|' || 'TRASPASO' || '|' || 'stmt-import-066', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-17',
    -701.90,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2026-03-17' || '|' || '-701.90' || '|' || 'NEXIAIA' || '|' || 'stmt-import-067', 'sha256'), 'hex'),
    4144.01,
    'stmt-import-067',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-17' || '|' || '-701.90' || '|' || 'NEXIAIA' || '|' || 'stmt-import-067', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-17',
    -21.34,
    'RAIOLA NETWORKS S',
    encode(digest(v_account_id::text || '|' || '2026-03-17' || '|' || '-21.34' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-068', 'sha256'), 'hex'),
    4845.91,
    'stmt-import-068',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-17' || '|' || '-21.34' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-068', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-16',
    -9.68,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-03-16' || '|' || '-9.68' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-069', 'sha256'), 'hex'),
    4867.25,
    'stmt-import-069',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-16' || '|' || '-9.68' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-069', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-12',
    -33.88,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2026-03-12' || '|' || '-33.88' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-070', 'sha256'), 'hex'),
    4876.93,
    'stmt-import-070',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-12' || '|' || '-33.88' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-070', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-11',
    471.90,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-03-11' || '|' || '471.90' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-071', 'sha256'), 'hex'),
    4910.81,
    'stmt-import-071',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-11' || '|' || '471.90' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-071', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-11',
    -25.00,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2026-03-11' || '|' || '-25.00' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-072', 'sha256'), 'hex'),
    4438.91,
    'stmt-import-072',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-11' || '|' || '-25.00' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-072', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-10',
    -9.94,
    'ELEVENLABS.IO',
    encode(digest(v_account_id::text || '|' || '2026-03-10' || '|' || '-9.94' || '|' || 'ELEVENLABS.IO' || '|' || 'stmt-import-073', 'sha256'), 'hex'),
    4463.91,
    'stmt-import-073',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-10' || '|' || '-9.94' || '|' || 'ELEVENLABS.IO' || '|' || 'stmt-import-073', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-10',
    -300.00,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2026-03-10' || '|' || '-300.00' || '|' || 'GASTOS' || '|' || 'stmt-import-074', 'sha256'), 'hex'),
    4473.85,
    'stmt-import-074',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-10' || '|' || '-300.00' || '|' || 'GASTOS' || '|' || 'stmt-import-074', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-10',
    -300.00,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2026-03-10' || '|' || '-300.00' || '|' || 'GASTOS' || '|' || 'stmt-import-075', 'sha256'), 'hex'),
    4773.85,
    'stmt-import-075',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-10' || '|' || '-300.00' || '|' || 'GASTOS' || '|' || 'stmt-import-075', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-08',
    -4.48,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-03-08' || '|' || '-4.48' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-076', 'sha256'), 'hex'),
    5073.85,
    'stmt-import-076',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-08' || '|' || '-4.48' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-076', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-06',
    -16.29,
    'LEMSQZY* EASYPANE',
    encode(digest(v_account_id::text || '|' || '2026-03-06' || '|' || '-16.29' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-077', 'sha256'), 'hex'),
    5078.33,
    'stmt-import-077',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-06' || '|' || '-16.29' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-077', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-03',
    -170.00,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2026-03-03' || '|' || '-170.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-078', 'sha256'), 'hex'),
    5094.62,
    'stmt-import-078',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-03' || '|' || '-170.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-078', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-03-03',
    -144.21,
    'INST.QUALITAS D',
    encode(digest(v_account_id::text || '|' || '2026-03-03' || '|' || '-144.21' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-079', 'sha256'), 'hex'),
    5264.62,
    'stmt-import-079',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-03-03' || '|' || '-144.21' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-079', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-27',
    -17.62,
    'MANUS AI',
    encode(digest(v_account_id::text || '|' || '2026-02-27' || '|' || '-17.62' || '|' || 'MANUS AI' || '|' || 'stmt-import-080', 'sha256'), 'hex'),
    5408.83,
    'stmt-import-080',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-27' || '|' || '-17.62' || '|' || 'MANUS AI' || '|' || 'stmt-import-080', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-25',
    1258.40,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-02-25' || '|' || '1258.40' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-081', 'sha256'), 'hex'),
    5426.45,
    'stmt-import-081',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-25' || '|' || '1258.40' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-081', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-25',
    -1400.00,
    'NOMINA FEBRER',
    encode(digest(v_account_id::text || '|' || '2026-02-25' || '|' || '-1400.00' || '|' || 'NOMINA FEBRER' || '|' || 'stmt-import-082', 'sha256'), 'hex'),
    4168.05,
    'stmt-import-082',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-25' || '|' || '-1400.00' || '|' || 'NOMINA FEBRER' || '|' || 'stmt-import-082', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-25',
    -1400.00,
    'NOMINA FEBRER',
    encode(digest(v_account_id::text || '|' || '2026-02-25' || '|' || '-1400.00' || '|' || 'NOMINA FEBRER' || '|' || 'stmt-import-083', 'sha256'), 'hex'),
    5568.05,
    'stmt-import-083',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-25' || '|' || '-1400.00' || '|' || 'NOMINA FEBRER' || '|' || 'stmt-import-083', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-22',
    -17.70,
    'CURSOR, AI POWERE',
    encode(digest(v_account_id::text || '|' || '2026-02-22' || '|' || '-17.70' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-084', 'sha256'), 'hex'),
    6968.05,
    'stmt-import-084',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-22' || '|' || '-17.70' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-084', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-21',
    774.40,
    'TRANSF. A SU FAVOR',
    encode(digest(v_account_id::text || '|' || '2026-02-21' || '|' || '774.40' || '|' || 'TRANSF. A SU FAVOR' || '|' || 'stmt-import-085', 'sha256'), 'hex'),
    6985.75,
    'stmt-import-085',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-21' || '|' || '774.40' || '|' || 'TRANSF. A SU FAVOR' || '|' || 'stmt-import-085', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-16',
    -160.00,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2026-02-16' || '|' || '-160.00' || '|' || 'GASTOS' || '|' || 'stmt-import-086', 'sha256'), 'hex'),
    6211.35,
    'stmt-import-086',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-16' || '|' || '-160.00' || '|' || 'GASTOS' || '|' || 'stmt-import-086', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-14',
    -12.04,
    'RAIOLA NETWORKS S',
    encode(digest(v_account_id::text || '|' || '2026-02-14' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-087', 'sha256'), 'hex'),
    6371.35,
    'stmt-import-087',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-14' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-087', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-14',
    42.34,
    'MANUS AI* TRIAL O',
    encode(digest(v_account_id::text || '|' || '2026-02-14' || '|' || '42.34' || '|' || 'MANUS AI* TRIAL O' || '|' || 'stmt-import-088', 'sha256'), 'hex'),
    6383.39,
    'stmt-import-088',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-14' || '|' || '42.34' || '|' || 'MANUS AI* TRIAL O' || '|' || 'stmt-import-088', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-13',
    3158.10,
    'TRASPASO',
    encode(digest(v_account_id::text || '|' || '2026-02-13' || '|' || '3158.10' || '|' || 'TRASPASO' || '|' || 'stmt-import-089', 'sha256'), 'hex'),
    6341.05,
    'stmt-import-089',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-13' || '|' || '3158.10' || '|' || 'TRASPASO' || '|' || 'stmt-import-089', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-12',
    -33.88,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2026-02-12' || '|' || '-33.88' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-090', 'sha256'), 'hex'),
    3182.95,
    'stmt-import-090',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-12' || '|' || '-33.88' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-090', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-11',
    -25.00,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2026-02-11' || '|' || '-25.00' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-091', 'sha256'), 'hex'),
    3216.83,
    'stmt-import-091',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-11' || '|' || '-25.00' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-091', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-11',
    -42.34,
    'MANUS AI* TRIAL O',
    encode(digest(v_account_id::text || '|' || '2026-02-11' || '|' || '-42.34' || '|' || 'MANUS AI* TRIAL O' || '|' || 'stmt-import-092', 'sha256'), 'hex'),
    3241.83,
    'stmt-import-092',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-11' || '|' || '-42.34' || '|' || 'MANUS AI* TRIAL O' || '|' || 'stmt-import-092', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-10',
    -170.00,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2026-02-10' || '|' || '-170.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-093', 'sha256'), 'hex'),
    3284.17,
    'stmt-import-093',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-10' || '|' || '-170.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-093', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-10',
    -243.00,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2026-02-10' || '|' || '-243.00' || '|' || 'GASTOS' || '|' || 'stmt-import-094', 'sha256'), 'hex'),
    3454.17,
    'stmt-import-094',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-10' || '|' || '-243.00' || '|' || 'GASTOS' || '|' || 'stmt-import-094', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-08',
    -2.40,
    'WWW.RETELLAI.COM',
    encode(digest(v_account_id::text || '|' || '2026-02-08' || '|' || '-2.40' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-095', 'sha256'), 'hex'),
    3697.17,
    'stmt-import-095',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-08' || '|' || '-2.40' || '|' || 'WWW.RETELLAI.COM' || '|' || 'stmt-import-095', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-07',
    4.40,
    'OPENAI',
    encode(digest(v_account_id::text || '|' || '2026-02-07' || '|' || '4.40' || '|' || 'OPENAI' || '|' || 'stmt-import-096', 'sha256'), 'hex'),
    3699.57,
    'stmt-import-096',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-07' || '|' || '4.40' || '|' || 'OPENAI' || '|' || 'stmt-import-096', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-07',
    -18.88,
    'TWILIO INC',
    encode(digest(v_account_id::text || '|' || '2026-02-07' || '|' || '-18.88' || '|' || 'TWILIO INC' || '|' || 'stmt-import-097', 'sha256'), 'hex'),
    3695.17,
    'stmt-import-097',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-07' || '|' || '-18.88' || '|' || 'TWILIO INC' || '|' || 'stmt-import-097', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-06',
    -5.46,
    'OPENAI',
    encode(digest(v_account_id::text || '|' || '2026-02-06' || '|' || '-5.46' || '|' || 'OPENAI' || '|' || 'stmt-import-098', 'sha256'), 'hex'),
    3714.05,
    'stmt-import-098',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-06' || '|' || '-5.46' || '|' || 'OPENAI' || '|' || 'stmt-import-098', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-06',
    -15.99,
    'LEMSQZY* EASYPANE',
    encode(digest(v_account_id::text || '|' || '2026-02-06' || '|' || '-15.99' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-099', 'sha256'), 'hex'),
    3719.51,
    'stmt-import-099',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-06' || '|' || '-15.99' || '|' || 'LEMSQZY* EASYPANE' || '|' || 'stmt-import-099', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-04',
    -105.90,
    'FIREFLIES.AI',
    encode(digest(v_account_id::text || '|' || '2026-02-04' || '|' || '-105.90' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-100', 'sha256'), 'hex'),
    3735.50,
    'stmt-import-100',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-04' || '|' || '-105.90' || '|' || 'FIREFLIES.AI' || '|' || 'stmt-import-100', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-03',
    -96.80,
    'INST.QUALITAS D',
    encode(digest(v_account_id::text || '|' || '2026-02-03' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-101', 'sha256'), 'hex'),
    3841.40,
    'stmt-import-101',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-03' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-101', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-02-02',
    -12.04,
    'RAIOLA NETWORKS S',
    encode(digest(v_account_id::text || '|' || '2026-02-02' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-102', 'sha256'), 'hex'),
    3938.20,
    'stmt-import-102',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-02-02' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-102', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-30',
    -2750.74,
    'I.V.A. MODELO 303',
    encode(digest(v_account_id::text || '|' || '2026-01-30' || '|' || '-2750.74' || '|' || 'I.V.A. MODELO 303' || '|' || 'stmt-import-103', 'sha256'), 'hex'),
    3950.24,
    'stmt-import-103',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-30' || '|' || '-2750.74' || '|' || 'I.V.A. MODELO 303' || '|' || 'stmt-import-103', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-29',
    605.00,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-01-29' || '|' || '605.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-104', 'sha256'), 'hex'),
    6700.98,
    'stmt-import-104',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-29' || '|' || '605.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-104', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-28',
    -1059.00,
    'NOMINA GENER',
    encode(digest(v_account_id::text || '|' || '2026-01-28' || '|' || '-1059.00' || '|' || 'NOMINA GENER' || '|' || 'stmt-import-105', 'sha256'), 'hex'),
    6095.98,
    'stmt-import-105',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-28' || '|' || '-1059.00' || '|' || 'NOMINA GENER' || '|' || 'stmt-import-105', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-28',
    -1000.00,
    'NOMINA GENER',
    encode(digest(v_account_id::text || '|' || '2026-01-28' || '|' || '-1000.00' || '|' || 'NOMINA GENER' || '|' || 'stmt-import-106', 'sha256'), 'hex'),
    7154.98,
    'stmt-import-106',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-28' || '|' || '-1000.00' || '|' || 'NOMINA GENER' || '|' || 'stmt-import-106', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-27',
    -6.38,
    'OPENAI',
    encode(digest(v_account_id::text || '|' || '2026-01-27' || '|' || '-6.38' || '|' || 'OPENAI' || '|' || 'stmt-import-107', 'sha256'), 'hex'),
    8154.98,
    'stmt-import-107',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-27' || '|' || '-6.38' || '|' || 'OPENAI' || '|' || 'stmt-import-107', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-27',
    -4.40,
    'OPENAI',
    encode(digest(v_account_id::text || '|' || '2026-01-27' || '|' || '-4.40' || '|' || 'OPENAI' || '|' || 'stmt-import-108', 'sha256'), 'hex'),
    8161.36,
    'stmt-import-108',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-27' || '|' || '-4.40' || '|' || 'OPENAI' || '|' || 'stmt-import-108', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-22',
    -17.81,
    'CURSOR, AI POWERE',
    encode(digest(v_account_id::text || '|' || '2026-01-22' || '|' || '-17.81' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-109', 'sha256'), 'hex'),
    8165.76,
    'stmt-import-109',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-22' || '|' || '-17.81' || '|' || 'CURSOR, AI POWERE' || '|' || 'stmt-import-109', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-20',
    -55.95,
    'I.R.P.F. MOD.111',
    encode(digest(v_account_id::text || '|' || '2026-01-20' || '|' || '-55.95' || '|' || 'I.R.P.F. MOD.111' || '|' || 'stmt-import-110', 'sha256'), 'hex'),
    8183.57,
    'stmt-import-110',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-20' || '|' || '-55.95' || '|' || 'I.R.P.F. MOD.111' || '|' || 'stmt-import-110', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-19',
    1258.40,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-01-19' || '|' || '1258.40' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-111', 'sha256'), 'hex'),
    8239.52,
    'stmt-import-111',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-19' || '|' || '1258.40' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-111', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-19',
    223.02,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2026-01-19' || '|' || '223.02' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-112', 'sha256'), 'hex'),
    6981.12,
    'stmt-import-112',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-19' || '|' || '223.02' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-112', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-15',
    -27.42,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2026-01-15' || '|' || '-27.42' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-113', 'sha256'), 'hex'),
    6758.10,
    'stmt-import-113',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-15' || '|' || '-27.42' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-113', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-13',
    -31.80,
    'Desarrollo de age',
    encode(digest(v_account_id::text || '|' || '2026-01-13' || '|' || '-31.80' || '|' || 'DESARROLLO DE AGE' || '|' || 'stmt-import-114', 'sha256'), 'hex'),
    6785.52,
    'stmt-import-114',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-13' || '|' || '-31.80' || '|' || 'DESARROLLO DE AGE' || '|' || 'stmt-import-114', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-13',
    1331.00,
    'TRANSF. A SU FAVOR',
    encode(digest(v_account_id::text || '|' || '2026-01-13' || '|' || '1331.00' || '|' || 'TRANSF. A SU FAVOR' || '|' || 'stmt-import-115', 'sha256'), 'hex'),
    6817.32,
    'stmt-import-115',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-13' || '|' || '1331.00' || '|' || 'TRANSF. A SU FAVOR' || '|' || 'stmt-import-115', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-12',
    -33.88,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2026-01-12' || '|' || '-33.88' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-116', 'sha256'), 'hex'),
    5486.32,
    'stmt-import-116',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-12' || '|' || '-33.88' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-116', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-07',
    21.60,
    'MANTENIMIENTO',
    encode(digest(v_account_id::text || '|' || '2026-01-07' || '|' || '21.60' || '|' || 'MANTENIMIENTO' || '|' || 'stmt-import-117', 'sha256'), 'hex'),
    5520.20,
    'stmt-import-117',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-07' || '|' || '21.60' || '|' || 'MANTENIMIENTO' || '|' || 'stmt-import-117', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2026-01-01',
    -21.60,
    'MANTENIMIENTO',
    encode(digest(v_account_id::text || '|' || '2026-01-01' || '|' || '-21.60' || '|' || 'MANTENIMIENTO' || '|' || 'stmt-import-118', 'sha256'), 'hex'),
    5498.60,
    'stmt-import-118',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2026-01-01' || '|' || '-21.60' || '|' || 'MANTENIMIENTO' || '|' || 'stmt-import-118', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-31',
    -96.80,
    'INST.QUALITAS D',
    encode(digest(v_account_id::text || '|' || '2025-12-31' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-119', 'sha256'), 'hex'),
    5520.20,
    'stmt-import-119',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-31' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-119', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-27',
    -900.00,
    'NOMINA DESEMBRE',
    encode(digest(v_account_id::text || '|' || '2025-12-27' || '|' || '-900.00' || '|' || 'NOMINA DESEMBRE' || '|' || 'stmt-import-120', 'sha256'), 'hex'),
    5617.00,
    'stmt-import-120',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-27' || '|' || '-900.00' || '|' || 'NOMINA DESEMBRE' || '|' || 'stmt-import-120', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-27',
    -900.00,
    'NOMINA DESEMBRE',
    encode(digest(v_account_id::text || '|' || '2025-12-27' || '|' || '-900.00' || '|' || 'NOMINA DESEMBRE' || '|' || 'stmt-import-121', 'sha256'), 'hex'),
    6517.00,
    'stmt-import-121',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-27' || '|' || '-900.00' || '|' || 'NOMINA DESEMBRE' || '|' || 'stmt-import-121', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-19',
    2420.00,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2025-12-19' || '|' || '2420.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-122', 'sha256'), 'hex'),
    7417.00,
    'stmt-import-122',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-19' || '|' || '2420.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-122', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-18',
    -33.00,
    'QUOTA T. V.Ele.Bu',
    encode(digest(v_account_id::text || '|' || '2025-12-18' || '|' || '-33.00' || '|' || 'QUOTA T. V.ELE.BU' || '|' || 'stmt-import-123', 'sha256'), 'hex'),
    4997.00,
    'stmt-import-123',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-18' || '|' || '-33.00' || '|' || 'QUOTA T. V.ELE.BU' || '|' || 'stmt-import-123', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-17',
    -12.04,
    'RAIOLA NETWORKS S',
    encode(digest(v_account_id::text || '|' || '2025-12-17' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-124', 'sha256'), 'hex'),
    5030.00,
    'stmt-import-124',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-17' || '|' || '-12.04' || '|' || 'RAIOLA NETWORKS S' || '|' || 'stmt-import-124', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-16',
    -33.88,
    'WWW CONTABO COM',
    encode(digest(v_account_id::text || '|' || '2025-12-16' || '|' || '-33.88' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-125', 'sha256'), 'hex'),
    5042.04,
    'stmt-import-125',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-16' || '|' || '-33.88' || '|' || 'WWW CONTABO COM' || '|' || 'stmt-import-125', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-16',
    -17.73,
    'TWILIO INC',
    encode(digest(v_account_id::text || '|' || '2025-12-16' || '|' || '-17.73' || '|' || 'TWILIO INC' || '|' || 'stmt-import-126', 'sha256'), 'hex'),
    5075.92,
    'stmt-import-126',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-16' || '|' || '-17.73' || '|' || 'TWILIO INC' || '|' || 'stmt-import-126', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-16',
    -26.60,
    'TWILIO INC',
    encode(digest(v_account_id::text || '|' || '2025-12-16' || '|' || '-26.60' || '|' || 'TWILIO INC' || '|' || 'stmt-import-127', 'sha256'), 'hex'),
    5093.65,
    'stmt-import-127',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-16' || '|' || '-26.60' || '|' || 'TWILIO INC' || '|' || 'stmt-import-127', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-07',
    -943.00,
    'NEXIAIA',
    encode(digest(v_account_id::text || '|' || '2025-12-07' || '|' || '-943.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-128', 'sha256'), 'hex'),
    5120.25,
    'stmt-import-128',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-07' || '|' || '-943.00' || '|' || 'NEXIAIA' || '|' || 'stmt-import-128', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-05',
    1754.50,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2025-12-05' || '|' || '1754.50' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-129', 'sha256'), 'hex'),
    6063.25,
    'stmt-import-129',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-05' || '|' || '1754.50' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-129', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-04',
    6.00,
    'P.SERV. TRF. AJENA',
    encode(digest(v_account_id::text || '|' || '2025-12-04' || '|' || '6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-130', 'sha256'), 'hex'),
    4308.75,
    'stmt-import-130',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-04' || '|' || '6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-130', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-03',
    1858.86,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2025-12-03' || '|' || '1858.86' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-131', 'sha256'), 'hex'),
    4302.75,
    'stmt-import-131',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-03' || '|' || '1858.86' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-131', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-02',
    -500.00,
    'NOMINA NOV',
    encode(digest(v_account_id::text || '|' || '2025-12-02' || '|' || '-500.00' || '|' || 'NOMINA NOV' || '|' || 'stmt-import-132', 'sha256'), 'hex'),
    2443.89,
    'stmt-import-132',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-02' || '|' || '-500.00' || '|' || 'NOMINA NOV' || '|' || 'stmt-import-132', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-02',
    -500.00,
    'Nomina Nov',
    encode(digest(v_account_id::text || '|' || '2025-12-02' || '|' || '-500.00' || '|' || 'NOMINA NOV' || '|' || 'stmt-import-133', 'sha256'), 'hex'),
    2943.89,
    'stmt-import-133',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-02' || '|' || '-500.00' || '|' || 'NOMINA NOV' || '|' || 'stmt-import-133', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-02',
    -6.00,
    'P.SERV. TRF. AJENA',
    encode(digest(v_account_id::text || '|' || '2025-12-02' || '|' || '-6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-134', 'sha256'), 'hex'),
    3443.89,
    'stmt-import-134',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-02' || '|' || '-6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-134', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-12-01',
    -96.80,
    'INST.QUALITAS D',
    encode(digest(v_account_id::text || '|' || '2025-12-01' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-135', 'sha256'), 'hex'),
    3449.89,
    'stmt-import-135',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-12-01' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-135', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-11-06',
    6.00,
    'P.SERV. TRF. AJENA',
    encode(digest(v_account_id::text || '|' || '2025-11-06' || '|' || '6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-136', 'sha256'), 'hex'),
    3546.69,
    'stmt-import-136',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-11-06' || '|' || '6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-136', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-11-06',
    6.00,
    'P.SERV. TRF. AJENA',
    encode(digest(v_account_id::text || '|' || '2025-11-06' || '|' || '6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-137', 'sha256'), 'hex'),
    3540.69,
    'stmt-import-137',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-11-06' || '|' || '6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-137', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-11-04',
    -942.50,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2025-11-04' || '|' || '-942.50' || '|' || 'GASTOS' || '|' || 'stmt-import-138', 'sha256'), 'hex'),
    3534.69,
    'stmt-import-138',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-11-04' || '|' || '-942.50' || '|' || 'GASTOS' || '|' || 'stmt-import-138', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-11-04',
    -6.00,
    'P.SERV. TRF. AJENA',
    encode(digest(v_account_id::text || '|' || '2025-11-04' || '|' || '-6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-139', 'sha256'), 'hex'),
    4477.19,
    'stmt-import-139',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-11-04' || '|' || '-6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-139', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-11-04',
    1754.50,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2025-11-04' || '|' || '1754.50' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-140', 'sha256'), 'hex'),
    4483.19,
    'stmt-import-140',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-11-04' || '|' || '1754.50' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-140', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-11-01',
    -1000.00,
    'Gastos',
    encode(digest(v_account_id::text || '|' || '2025-11-01' || '|' || '-1000.00' || '|' || 'GASTOS' || '|' || 'stmt-import-141', 'sha256'), 'hex'),
    2728.69,
    'stmt-import-141',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-11-01' || '|' || '-1000.00' || '|' || 'GASTOS' || '|' || 'stmt-import-141', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-11-01',
    -6.00,
    'P.SERV. TRF. AJENA',
    encode(digest(v_account_id::text || '|' || '2025-11-01' || '|' || '-6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-142', 'sha256'), 'hex'),
    3728.69,
    'stmt-import-142',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-11-01' || '|' || '-6.00' || '|' || 'P.SERV. TRF. AJENA' || '|' || 'stmt-import-142', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-11-01',
    -96.80,
    'INST.QUALITAS D',
    encode(digest(v_account_id::text || '|' || '2025-11-01' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-143', 'sha256'), 'hex'),
    3734.69,
    'stmt-import-143',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-11-01' || '|' || '-96.80' || '|' || 'INST.QUALITAS D' || '|' || 'stmt-import-143', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-10-31',
    2830.49,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2025-10-31' || '|' || '2830.49' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-144', 'sha256'), 'hex'),
    3831.49,
    'stmt-import-144',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-10-31' || '|' || '2830.49' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-144', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-10-31',
    500.00,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2025-10-31' || '|' || '500.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-145', 'sha256'), 'hex'),
    1001.00,
    'stmt-import-145',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-10-31' || '|' || '500.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-145', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-10-31',
    500.00,
    'TRASPASO',
    encode(digest(v_account_id::text || '|' || '2025-10-31' || '|' || '500.00' || '|' || 'TRASPASO' || '|' || 'stmt-import-146', 'sha256'), 'hex'),
    501.00,
    'stmt-import-146',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-10-31' || '|' || '500.00' || '|' || 'TRASPASO' || '|' || 'stmt-import-146', 'sha256'), 'hex')
  );

  INSERT INTO bank_transactions (id, account_id, statement_id, date, amount, description, hash, balance, entry_reference, created_at)
  SELECT
    gen_random_uuid(),
    v_account_id,
    v_statement_id,
    '2025-10-30',
    1.00,
    'TRANSFER INMEDIATA',
    encode(digest(v_account_id::text || '|' || '2025-10-30' || '|' || '1.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-147', 'sha256'), 'hex'),
    1.00,
    'stmt-import-147',
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.account_id = v_account_id AND bt.hash = encode(digest(v_account_id::text || '|' || '2025-10-30' || '|' || '1.00' || '|' || 'TRANSFER INMEDIATA' || '|' || 'stmt-import-147', 'sha256'), 'hex')
  );

  RAISE NOTICE 'Importados movimientos del extracto manual (% filas intentadas)', 147;
END $$;

COMMIT;

-- Deshacer conciliación manual (volver a rojo / pendiente) para el mismo lote de cobros.

WITH targets (tx_date, tx_amount, desc_pattern) AS (
  VALUES
    ('2026-03-22'::date, 11858.00::numeric, 'TRASPASO%'),
    ('2026-03-11'::date, 471.90::numeric, 'TRANSFER%'),
    ('2026-02-25'::date, 1258.40::numeric, 'TRANSFER%'),
    ('2026-02-21'::date, 774.40::numeric, 'TRANSF%'),
    ('2026-02-14'::date, 42.34::numeric, 'MANUS%'),
    ('2026-02-13'::date, 3158.10::numeric, 'TRASPASO%'),
    ('2026-02-07'::date, 4.40::numeric, 'OPENAI%'),
    ('2026-01-29'::date, 605.00::numeric, 'TRANSFER%'),
    ('2026-01-19'::date, 223.02::numeric, 'TRANSFER%'),
    ('2026-01-19'::date, 1258.40::numeric, 'TRANSFER%'),
    ('2026-01-13'::date, 1331.00::numeric, 'TRANSF%'),
    ('2026-01-07'::date, 21.60::numeric, 'MANTENIMIENTO%'),
    ('2025-12-19'::date, 2420.00::numeric, 'TRANSFER%'),
    ('2025-12-05'::date, 1754.50::numeric, 'TRANSFER%'),
    ('2025-12-04'::date, 6.00::numeric, 'P.SERV%'),
    ('2025-12-03'::date, 1858.86::numeric, 'TRANSFER%'),
    ('2025-11-06'::date, 6.00::numeric, 'P.SERV%'),
    ('2025-11-04'::date, 1754.50::numeric, 'TRANSFER%'),
    ('2025-10-31'::date, 500.00::numeric, 'TRANSFER%'),
    ('2025-10-31'::date, 2830.49::numeric, 'TRANSFER%'),
    ('2025-10-31'::date, 500.00::numeric, 'TRASPASO%'),
    ('2025-10-30'::date, 1.00::numeric, 'TRANSFER%')
)
UPDATE bank_transactions bt
SET is_reconciled = false
FROM targets t
WHERE bt.date = t.tx_date
  AND bt.amount = t.tx_amount
  AND bt.description ILIKE t.desc_pattern
  AND bt.amount > 0
  AND EXISTS (
    SELECT 1 FROM bank_accounts ba
    WHERE ba.id = bt.account_id
      AND (ba.name ILIKE '%Enable%' OR ba.name IS NULL)
  );

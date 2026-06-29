-- Reparar movimientos Enable Banking con signo incorrecto (todo como ingreso)
--
-- PASO 1: Despliega el último código y pulsa Sincronizar en /finances
--         (repara usando credit_debit_indicator + saldo de la API)
--
-- PASO 2: Si tras sincronizar SIGUE mal, borra solo movimientos EB y reimporta:
--
DELETE FROM bank_transactions
WHERE account_id IN (
  SELECT id FROM bank_accounts WHERE iban LIKE 'ENABLEBANKING:%'
);

-- Luego sincroniza de nuevo desde /finances

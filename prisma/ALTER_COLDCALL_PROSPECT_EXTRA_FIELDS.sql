-- Campos adicionales para leads de cold calling (CIF, dirección)

ALTER TABLE coldcall_prospects
  ADD COLUMN IF NOT EXISTS cif TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT;

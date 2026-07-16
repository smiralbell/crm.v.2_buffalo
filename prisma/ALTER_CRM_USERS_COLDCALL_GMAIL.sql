-- Gmail desde el que redacta cada comercial (authuser en compose)
ALTER TABLE crm_users
  ADD COLUMN IF NOT EXISTS coldcall_gmail TEXT;

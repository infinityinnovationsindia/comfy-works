-- Run this AFTER Kush logs in for the first time
-- 1. Kush goes to the app URL → enters his email → enters OTP → logs in
-- 2. Then go to Supabase Dashboard → Authentication → Users
-- 3. Copy Kush's UUID from there
-- 4. Replace <KUSH_UUID> below and run this SQL

INSERT INTO user_accounts (id, role, is_active)
VALUES ('<KUSH_UUID>', 'super_admin', true)
ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

-- After Kush creates employee profiles for all partners,
-- run these with actual UUIDs from Authentication → Users:

-- INSERT INTO user_accounts (id, role) VALUES ('<SHAILOO_UUID>', 'production_head');
-- INSERT INTO user_accounts (id, role) VALUES ('<YASH_UUID>', 'design_head');
-- INSERT INTO user_accounts (id, role) VALUES ('<PRADEEP_UUID>', 'project_head');
-- INSERT INTO user_accounts (id, role) VALUES ('<LUV_UUID>', 'project_head');
-- INSERT INTO user_accounts (id, role) VALUES ('<KIRAN_UUID>', 'accounts');
-- INSERT INTO user_accounts (id, role) VALUES ('<NEAL_UUID>', 'accounts');

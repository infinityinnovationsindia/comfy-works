#!/usr/bin/env node
// ================================================================
// Comfy Works — Partner Login Setup Script
// Run once from inside the comfy-works folder:
//   node setup-partner-logins.js
//
// What it does:
//   1. Creates Supabase Auth accounts for all 6 remaining partners
//   2. Links each to their employee profile
//   3. Assigns correct roles
//   4. Sets a temporary password: Comfy@2024
//   5. Partners must change password on first login
// ================================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = 'https://ysgorgedevhkrhsvkvcc.supabase.co';
const SERVICE_ROLE_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZ29yZ2VkZXZoa3Joc3ZrdmNjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM0NjA3MiwiZXhwIjoyMDk0OTIyMDcyfQ.cbn0fgXM_T78Tww9VQ5GTRbfq3LuVv8ZGCWI-Jhr5FY';
const TEMP_PASSWORD        = 'Comfy@2024';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Partners to set up (Kush already done)
// login_email     = email used to log in to the app
// employee_email  = email stored in their employee profile (from bulk upload)
// role            = role in user_accounts table
const PARTNERS = [
  {
    name:           'Shailoo Patel',
    login_email:    'shailoo@comfyinteriors.com',
    employee_email: 'shailoo@comfyinteriors.com',
    role:           'production_head',
  },
  {
    name:           'Yash Patel',
    login_email:    'design@ergodnovate.com',   // his actual email for login
    employee_email: 'yash@comfyinteriors.com',  // email stored in employee profile
    role:           'design_head',
  },
  {
    name:           'Pradeep Patel',
    login_email:    'pradeep@comfyinteriors.com',
    employee_email: 'pradeep@comfyinteriors.com',
    role:           'project_head',
  },
  {
    name:           'Luv Patel',
    login_email:    'luv@comfyinteriors.com',
    employee_email: 'luv@comfyinteriors.com',
    role:           'project_head',
  },
  {
    name:           'Kiran Patel',
    login_email:    'kiran@comfyinteriors.com',
    employee_email: 'kiran@comfyinteriors.com',
    role:           'accounts',
  },
  {
    name:           'Neal Patel',
    login_email:    'neal@comfyinteriors.com',
    employee_email: 'neal@comfyinteriors.com',
    role:           'accounts',
  },
];

async function main() {
  console.log('\n🪑  Comfy Works — Setting up partner logins\n');
  console.log(`Temporary password for all partners: ${TEMP_PASSWORD}\n`);

  let successCount = 0;

  for (const partner of PARTNERS) {
    process.stdout.write(`  Setting up ${partner.name}... `);

    // ── 1. Create auth user ──────────────────────────────────────
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:          partner.login_email,
      password:       TEMP_PASSWORD,
      email_confirm:  true,  // no verification email needed
    });

    if (authError) {
      // If user already exists, try to get their ID
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users.find(u => u.email === partner.login_email);
        if (existing) {
          console.log(`(auth user already exists, using existing UUID)`);
          await linkEmployee(existing.id, partner);
          successCount++;
        } else {
          console.log(`✗ Auth error: ${authError.message}`);
        }
      } else {
        console.log(`✗ Auth error: ${authError.message}`);
      }
      continue;
    }

    const userId = authData.user.id;
    await linkEmployee(userId, partner);
    successCount++;
  }

  console.log(`\n✅ Done! ${successCount}/${PARTNERS.length} partners set up.`);
  console.log('\nAll partners can now log in at:');
  console.log('  https://comfy-works-git-main-infinityinnovations.vercel.app');
  console.log(`  Password: ${TEMP_PASSWORD}`);
  console.log('\n⚠️  Ask each partner to change their password after first login.');
  console.log('\nPartner login emails:');
  PARTNERS.forEach(p => console.log(`  ${p.name.padEnd(20)} ${p.login_email}`));
}

async function linkEmployee(userId, partner) {
  // ── 2. Find employee profile ─────────────────────────────────
  const { data: emp } = await supabase
    .from('employees')
    .select('id, employee_no')
    .eq('email', partner.employee_email)
    .single();

  // ── 3. Check if user_account already exists ──────────────────
  const { data: existingAccount } = await supabase
    .from('user_accounts')
    .select('id')
    .eq('id', userId)
    .single();

  if (existingAccount) {
    // Update existing
    await supabase.from('user_accounts')
      .update({
        role:        partner.role,
        employee_id: emp?.id ?? null,
        is_active:   true,
      })
      .eq('id', userId);
  } else {
    // Insert new
    const { error: accError } = await supabase
      .from('user_accounts')
      .insert({
        id:          userId,
        role:        partner.role,
        employee_id: emp?.id ?? null,
        is_active:   true,
      });

    if (accError) {
      console.log(`✗ Account error: ${accError.message}`);
      return;
    }
  }

  const empNo = emp?.employee_no ?? '(employee not linked — check email in profile)';
  console.log(`✓  ${partner.role.padEnd(18)} → ${empNo}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


# Phase 2 Deployment Guide

## Run Order

### Step 1 — Run the SQL migration
1. Open: https://supabase.com/dashboard/project/ysgorgedevhkrhsvkvcc/sql
2. Paste contents of: `supabase/migrations/phase2.sql`
3. Click Run

### Step 2 — Set up daily_salary_rate for employees
After running migration, set each employee's daily rate in Supabase:
```sql
-- Example: update daily salary rate for all employees
-- You need to enter actual values per employee
UPDATE employees SET daily_salary_rate = monthly_salary / 26 WHERE monthly_salary IS NOT NULL;
-- Or manually per employee via the Supabase table editor
```

### Step 3 — Generate the files
```bash
cd C:\Users\Dell\comfy-works
node setup-phase2.js
```

### Step 4 — Install new dependency (xlsx for payroll export)
```bash
npm install xlsx
```

### Step 5 — Add environment variables to Vercel
See: `docs/env-phase2.md`
Add via: https://vercel.com/infinityinnovationsindia/comfy-works/settings/environment-variables

### Step 6 — Deploy
```bash
git add -A
git commit -m "feat: Phase 2 — daily operations (attendance, leave, payroll)"
git push origin main
```
Vercel auto-deploys on push.

### Step 7 — Set up WhatsApp (can do after deploy)
Follow: `docs/whatsapp-templates.md`
1. Create Meta Developer App
2. Add WhatsApp product
3. Get a dedicated phone number
4. Submit 5 templates for approval (24-48hrs)
5. Generate System User token
6. Add WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN to Vercel

### Step 8 — Test attendance processing
In Vercel → Functions → Cron Jobs → Trigger manually
Or call: POST https://comfy-works-git-main-infinityinnovations.vercel.app/api/cron/process-attendance

### Step 9 — Set daily_salary_rate for each employee
Via app: Go to Employees → each employee → Edit → set Daily Rate (₹)
Or via Supabase table editor directly.

## Cron Schedule Summary
| Cron | Schedule | What it does |
|------|----------|--------------|
| /api/cron/process-attendance | 30 18 * * * | Daily at midnight IST — converts punches → attendance_daily |
| /api/cron/monthly-accrual | 0 2 1 * * | 1st of each month at 7:30am IST — adds PL accrual |
| /api/cron/year-end | 0 0 1 4 * | April 1 at 5:30am IST — zeroes all PL balances, no encashment |

## What WhatsApp does while NOT configured
All notification calls fall back to `console.log`.
Everything works — approvals still go through — just no WhatsApp messages.
Add the env vars whenever you're ready and it switches on automatically.

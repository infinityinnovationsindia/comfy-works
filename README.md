# Comfy Works — Phase 1

HR & Factory Management for Comfy Furniture Centre, Ahmedabad.

---

## What you need to create (one-time, free)

| Service | What it's for | Cost |
|---------|--------------|------|
| **Supabase** | Database + Auth | Free tier fine |
| **Vercel** | Hosting the web app | Free tier fine |
| **GitHub** | Code repository | Free |

---

## Setup steps in order

### 1. Supabase project

1. Go to supabase.com → New project
2. Name: `comfy-works` · Region: Mumbai (ap-south-1)
3. Generate a strong DB password → save it
4. Wait ~2 min for project to spin up
5. Go to **SQL Editor** → paste the entire `migration.sql` → click **Run**
6. Go to **Authentication → Settings**:
   - Disable "Confirm email" toggle (so OTP flow works)
   - Under Email Templates, keep defaults
7. Go to **Project Settings → API** and copy:
   - Project URL
   - anon/public key
   - service_role key (keep secret)
8. Go to **Authentication → Users** → add Kush's email manually
   - Then in SQL Editor run:
     ```sql
     -- After Kush logs in once, his auth.users row will exist.
     -- Get his UUID from Authentication → Users, then:
     INSERT INTO user_accounts (id, role) VALUES ('<kush_uuid>', 'super_admin');
     -- Repeat for each partner with appropriate role
     ```

Roles to assign:
- Kush Patel → `super_admin`
- Shailoo Patel → `production_head`
- Yash Patel → `design_head`
- Pradeep Patel, Luv Patel → `project_head`
- Kiran Patel, Neal Patel → `accounts`

---

### 2. Create the Next.js project

```bash
# In your terminal
node setup-phase1.js        # creates comfy-works/ folder

cd comfy-works
cp .env.local.example .env.local
# Open .env.local and fill in your 3 Supabase values

npm install
npm run dev                 # opens http://localhost:3000
```

---

### 3. Push to GitHub + deploy on Vercel

```bash
cd comfy-works
git init
git add .
git commit -m "Phase 1 — Comfy Works"
# Create a new repo on github.com, then:
git remote add origin https://github.com/yourname/comfy-works.git
git push -u origin main
```

1. Go to vercel.com → New Project → Import your GitHub repo
2. Framework: **Next.js** (auto-detected)
3. Add Environment Variables (paste same 3 from .env.local)
4. Deploy → get your live URL (share with team)

---

### 4. Biometric sync (factory machine)

On the Windows/Linux machine at the factory:

```bash
# Install Node.js (nodejs.org) if not installed, then:
cd biometric-sync
cp .env.example .env
# Edit .env — paste SUPABASE_URL and SERVICE_ROLE_KEY
npm install

# Test first:
node sync.js

# If it works, run permanently with PM2:
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # follow instructions to auto-start on reboot
```

**Biometric enrollment rule:**
In the ZKTeco device, enroll each employee using their CF number as User ID.
- CF-001 → User ID 1
- CF-002 → User ID 2
- etc.

---

## First use

1. Open the app URL → login with your work email → enter 6-digit OTP from email
2. Go to **Employees → New Employee** → create all 7 partner profiles first
3. After creating Kush's employee profile, link it in Supabase:
   `UPDATE user_accounts SET employee_id = '<emp uuid>' WHERE role = 'super_admin';`
4. Go to **Shifts** → verify 4 default shifts are listed
5. Go to **Holidays** → verify 2026-27 data is loaded for Factory and Showroom
6. Go to **Attendance** — once biometric sync runs, punches appear here

---

## Phase 2 will add

Leave Management · Approval chains · Red mark auto-calc · WhatsApp notifications
OT requests · On Duty forms · Work Permissions · Monthly payroll export

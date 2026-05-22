
# Phase 3 — Factory Control

## Step 1: Run SQL migration
Open Supabase → SQL Editor → paste contents of phase3.sql → Run

## Step 2: Run this script
```
node setup-phase3.js
```

## Step 3: Update sidebar
Open your sidebar component and add the nav items listed in:
components/sidebar-phase3-additions.txt

## Step 4: Deploy
```
cd C:\Users\Dell\comfy-works
git add -A
git commit -m "feat: Phase 3 - Factory Control (OT, Work Permission, Vehicles, Visitors, Petty Cash, Security Gate)"
git push
```

## What's built in Phase 3

| Module | Route | Form # |
|--------|-------|--------|
| Overtime Request | /overtime | Form #28 |
| Work Permission | /work-permission | Form #26 |
| Vehicle Logistics | /vehicles | Form #61 |
| Visitor Management | /visitors | — |
| Petty Cash | /petty-cash | — |
| Security Dashboard | /security | Gate tablet |

## Security Dashboard
Go to /security on any device. Designed for cheap Android tablet at gate.
Dark theme, large touch targets, 5 tabs: Time Off / On Duty / After Hours / Visitors / Vehicles.

## Next: Phase 4
- Recruitment module (Candidate Data Bank)
- Employee Onboarding checklist
- Employee Loan (5-partner approval)
- Showroom biometric integration
- PWA (add to home screen)
- Full reports suite


# WhatsApp Templates — Submit to Meta for Approval

After setting up Meta Developer App, submit these 5 templates.
Category: **UTILITY** for all.
Language: **English (en)**

---

## 1. comfy_leave_approval
**To:** L1 / L2 / L3 Approver
**Purpose:** New leave request pending action

**Body:**
> {{1}} has applied for {{2}} leave.
> Dates: {{3}} to {{4}} ({{5}} days)
> Reason: {{6}}
> PL Balance after this leave: {{7}} days
> 
> ⚡ TAP TO REVIEW & APPROVE/REJECT (expires in 7 days):
> {{8}}

**Parameter mapping:**
1. Employee full name
2. Leave type (PL / UL / HPL / HUL / LC / EG)
3. Date from
4. Date to
5. Number of days
6. Reason (truncated to 200 chars)
7. Remaining PL balance
8. One-tap approval URL

---

## 2. comfy_leave_decision
**To:** Employee who applied
**Purpose:** Leave approved or rejected

**Body:**
> Your {{1}} leave request ({{2}} to {{3}}) has been *{{4}}*.
> {{5}}
>
> — Comfy Works HR

**Parameter mapping:**
1. Leave type
2. Date from
3. Date to
4. APPROVED or REJECTED
5. Comment from approver (or "Your leave has been sanctioned." / "Please contact HR for details.")

---

## 3. comfy_time_off_approved
**To:** Employee's supervisor / security gate
**Purpose:** Time off permission pass

**Body:**
> 🟢 TIME OFF PASS
> Employee: {{1}}
> Leaving at: {{2}} on {{3}}
> Purpose: {{4}}
> Expected return: {{5}}
>
> — Comfy Works Factory Gate Pass

**Parameter mapping:**
1. Employee full name
2. Time out
3. Date
4. Purpose
5. Expected return time

---

## 4. comfy_on_duty_approved
**To:** Employee + Security
**Purpose:** On Duty official movement pass

**Body:**
> ✅ ON DUTY — OFFICIAL MOVEMENT
> {{1}} is authorised to leave for official duty.
> Date: {{2}} | Departure: {{3}}
> Location: {{4}}
> Vehicle: {{5}}
> Approved by: {{6}}
>
> — Comfy Works HR

**Parameter mapping:**
1. Employee full name
2. Date
3. Time out
4. Location to visit
5. Vehicle type + number (e.g. "Personal: GJ-01-AB-1234")
6. Approver name

---

## 5. comfy_aaa_alert
**To:** Kush (CF-004) — Escalation alert
**Purpose:** Employee absent without approval

**Body:**
> ⚠️ AAA ALERT — Comfy Works
> {{1}} was absent without any approved leave on {{2}}.
> Status: AAA (3 days salary deduction applied).
>
> If this is incorrect, correct via Comfy Works attendance module.

**Parameter mapping:**
1. Employee full name
2. Date (or date range)

---

## Setup steps
1. Go to https://business.facebook.com → More Tools → WhatsApp Manager
2. Account Tools → Message Templates → Create Template
3. Submit all 5 templates above
4. Approval typically takes 24–48 hours
5. Once approved, add to Vercel environment:
   ```
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_ACCESS_TOKEN=your_system_user_token
   ```

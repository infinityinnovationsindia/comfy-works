
# Phase 2 Environment Variables

Add these to Vercel → Project Settings → Environment Variables.
Also add to your local .env.local for development.

## New in Phase 2

```bash
# WhatsApp — Meta Cloud API (get from developers.facebook.com)
WHATSAPP_PHONE_NUMBER_ID=   # e.g. 123456789012345
WHATSAPP_ACCESS_TOKEN=      # System User token (never expires if set up correctly)

# App URL (for one-tap approval links in WhatsApp messages)
NEXT_PUBLIC_APP_URL=https://comfy-works-git-main-infinityinnovations.vercel.app

# Cron security secret (any random string, used to authenticate cron calls)
CRON_SECRET=comfyworks_cron_$(date +%s)
```

## Already set (Phase 1)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ysgorgedevhkrhsvkvcc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## How to generate CRON_SECRET
Run in terminal: `openssl rand -hex 32`
Or use any long random string.

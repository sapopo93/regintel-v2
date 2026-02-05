# RegIntel Public Launch Checklist

## Henry's Actions (Morning)

### 1. Domain (5 min)
- [ ] Buy regintelai.co.uk from Namecheap/GoDaddy (~£8/year)
- [ ] Point DNS to EC2 IP (or Vercel if using that)

### 2. Clerk Production (10 min)
- [ ] Go to dashboard.clerk.com
- [ ] Create production instance (or switch improved-wren-55 to production)
- [ ] Copy production keys:
  - `CLERK_SECRET_KEY`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- [ ] Disable Bot Protection (Attack Protection → Disabled)
- [ ] Add production domain to allowed origins

### 3. Stripe (15 min)
- [ ] Create Stripe account at stripe.com (if not exists)
- [ ] Get API keys (Dashboard → Developers → API keys)
- [ ] Create products:
  - Core Review: £950 one-time
  - Review + Repairs: £1,950 one-time
- [ ] Copy keys:
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### 4. Database (10 min)
Option A: **Neon (Free tier - 0.5GB)**
- Go to neon.tech → Create project
- Copy connection string

Option B: **Supabase (Free tier - 500MB)**
- Go to supabase.com → New project
- Copy Postgres connection string

Option C: **Your EC2 (Already have Postgres)**
- Use existing PostgreSQL on EC2
- Just need to set DATABASE_URL

---

## Jida's Actions (Now)

### ✅ Already Done
- [x] Security hardening (29 tests)
- [x] Clerk auth integration
- [x] 328 tests passing

### 🔄 In Progress
- [ ] Landing page (creating now)
- [ ] Terms of Service (drafting now)
- [ ] Privacy Policy (drafting now)
- [ ] Production .env template
- [ ] Stripe integration (if not exists)

---

## Production Environment Variables

```bash
# Database
DATABASE_URL=<paste-your-neon-or-supabase-connection-string>

# Clerk (get from dashboard.clerk.com)
CLERK_SECRET_KEY=sk_live_xxxxx
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxx

# Stripe (get from stripe.com dashboard)
STRIPE_SECRET_KEY=sk_live_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx

# App
NEXT_PUBLIC_API_BASE_URL=https://api.regintelai.co.uk
ALLOWED_ORIGINS=https://regintelai.co.uk,https://www.regintelai.co.uk

# Security
NODE_ENV=production
# DO NOT SET E2E_TEST_MODE in production
```

---

## Deploy Options

### Option A: EC2 (Your existing instance)
- Free (already paying for EC2)
- Need to set up Nginx, SSL (Let's Encrypt)
- Need PM2 or systemd for process management

### Option B: Vercel + Railway
- Vercel: Free for frontend (Next.js)
- Railway: $5/month for API + Postgres
- Easiest setup, auto-SSL

### Option C: Vercel + Neon
- Vercel: Free for frontend
- Neon: Free for Postgres (0.5GB)
- Cheapest option that works

**Recommendation:** Option C for launch, migrate to EC2 when you have traction.

---

## Launch Sequence

1. Henry: Buy domain, set up Clerk + Stripe (morning)
2. Henry: Create Neon database
3. Jida: Deploy to Vercel with production env vars
4. Henry: Point domain to Vercel
5. Test sign-up flow
6. **LAUNCH** 🚀

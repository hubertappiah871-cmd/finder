# Campus Lost & Found

A full-stack lost-and-found management system for a university campus — a working prototype
for a Systems Analysis & Design course project. Built with **React (Vite) + TypeScript** on the
frontend and **Supabase** (Auth, Postgres, Storage) on the backend.

## What it does

Three actors, one platform:

| Actor | Capabilities |
| --- | --- |
| **User** (student/staff) | Report lost items, register found items (photo required), search items, claim found items with proof of ownership, receive in-app notifications |
| **Admin** (seeded) | Manage all items, review claims and approve/reject them, view reports/analytics, manage users (deactivate/remove), receive a system-event feed |

The demo flow works end-to-end: **User A reports a lost item → User B registers a matching
found item → User A searches, finds it, and claims it → Admin approves → both users get
notified.**

## Tech stack

- **Frontend:** React 19, Vite, React Router 7, lucide-react icons
- **Backend:** Supabase — email/password Auth, Postgres (RLS-protected), Storage (photo uploads)
- **Design:** hand-rolled CSS design system — navy / gold / cream, Fraunces + Inter typefaces

## Setup (10 minutes)

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is enough).

2. **Run the database script.** Open your project → **SQL Editor → New query**, paste the
   contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates:
   - Tables: `profiles`, `items`, `claims`, `notifications`
   - Row Level Security policies + a public `item-photos` storage bucket
   - An auto-trigger that creates a profile on sign-up
   - Notification triggers (new items, category matches, claims, decisions)
   - Seeded accounts + sample items

3. **Disable email confirmation (recommended for the demo).** Go to **Authentication →
   Providers → Email** and turn off **Confirm email**. Otherwise users must click a
   confirmation link before the first sign-in.

4. **Add your credentials.** In **Project Settings → API**, copy the **Project URL** and the
   **publishable key**, then create a `.env` file from the example:

   ```bash
   cp .env.example .env
   ```

   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
   ```

5. **Run the app:**

   ```bash
   npm install
   npm run dev
   ```

## Seeded accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@campus.edu` | `admin123` |
| Student (demo user) | `demo@campus.edu` | `demo123` |

Sample items (laptop, backpack, watch, textbook, ID card) are seeded so the search page and
reports look populated on first load.

## Project structure

```
src/
  lib/          supabase client, types, constants, helpers
  context/      AuthContext (session + profile), ToastContext
  components/   Layout, Navbar, route guards, cards, forms, dialogs, feedback
  pages/        user pages (search, item detail, forms, claims, notifications)
                admin pages (items, claims, reports, users)
supabase/
  schema.sql    one-shot setup script (tables, RLS, triggers, seeds)
```

## How the demo works

Notifications are generated **in the database** (Postgres triggers), so the client stays simple:

1. **User reports a lost item** → admins get a system notification.
2. **User registers a found item** → matching lost items (same category) notify their owners.
3. **A claim is submitted** → admins get a "new claim" notification.
4. **Admin approves a claim** → the item is marked *claimed*, the claimant is notified
   ("approved — arrange pickup"), and the finder is notified too.
5. **Admin rejects a claim** → the claimant is notified with the rejection reason.
6. **Item marked *resolved*** → the claimant gets a thank-you notification.

Admin-only routes (`/admin/*`) are guarded on both the client (route guards) and the server
(RLS policies), so regular users can never reach admin data or actions.

## Deploy to Vercel

The project is ready for Vercel (a `vercel.json` SPA rewrite is already included).

1. **Add your environment variables** in Vercel (they are baked in at build time, and `.env` is gitignored so it never leaves your machine):

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://your-project-ref.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |

   Add them for **Production** and **Preview** in *Project → Settings → Environment Variables* (or use `vercel env add`).

2. **Option A — Vercel CLI (no GitHub needed):**

   ```bash
   npm i -g vercel
   vercel login
   vercel --prod
   ```

   The wizard auto-detects Vite; accept the defaults. (`.env` is not uploaded — set the vars in step 1.)

3. **Option B — GitHub + dashboard:**

   ```bash
   git init && git add -A && git commit -m "Campus Lost & Found"
   ```

   Push to a GitHub repo, then in Vercel click **Add New → Project**, import the repo — Vercel auto-detects Vite (build `npm run build`, output `dist`).

## Scripts

```bash
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run lint     # eslint
```

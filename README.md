# CleanSure — merged project (November 2026)

This merges two uploaded project copies. The React/Vite frontend and Express/Zod/Supabase backend are retained from `cleansure.zip`. The `database/schema.sql` has been aligned to the live booking route. Admin files from the other archive are retained under `legacy-reference/` **only for future integration**: they are NOT a working secured admin dashboard.

## Start
1. Use this folder as the ONE canonical project. Keep a backup of both original directories until you verify it locally.
2. In Supabase SQL Editor, run `database/schema.sql` on a **new/empty** CleanSure project. If a bookings table already exists, compare its columns first: `create table if not exists` will not migrate an incompatible table.
3. Rotate the previously exposed Supabase secret key in the dashboard. Never put credentials into chat or a ZIP.
4. Copy `server/.env.example` to `server/.env` and fill your own new credentials locally.
5. `cd server && npm install && npm start` (port 3000).
6. In another Terminal: `cd client && npm install && npm run dev` (port 5173).
7. Submit a fictional booking; confirm a record exists in Supabase Table Editor. Never accept real bookings until verified.

## Architectural requirements
- **Mobile-first:** keep responsive layouts, 44px touch targets, mobile form testing, and performance budgets.
- **Security & compliance:** secret keys only in server `.env`; private storage, RLS, access controls, input validation, retention/consent policies, privacy review, CAPTCHA, and no customer data in logs.
- **SEO-first:** descriptive metadata added to homepage; next add server-rendered/prerendered service/location pages, canonical URLs after domain selection, XML sitemap, robots.txt, structured data based on verified business details, and Core Web Vitals tests. A client-rendered Vite SPA alone is not a complete SEO strategy.

## Known gaps
- Property photo upload NOT implemented. Plan private `booking-photos` bucket, linked `booking_photos` table, multipart upload validation and authorization, preview/remove UI.
- Cleaner applications frontend references `/api/cleaner-applications` but the merged Express backend does not yet implement it.
- Legacy admin dashboard references endpoints absent from this backend. Not deployed.
- No customer notifications, spam mitigation, authenticated admin, privacy policy, retention schedule, or production readiness review yet.
# CleanSure

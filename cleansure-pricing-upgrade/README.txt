CleanSure pricing and form improvements

1. In Supabase SQL Editor, run 01-run-in-supabase.sql FIRST.
2. Extract this ZIP into ~/Desktop/cleansure-merged (the folder containing client/ and server/).
3. From that folder run: python3 cleansure-pricing-upgrade/apply_upgrade.py
4. Verify: node --check server/src/routes/bookingRoutes.js
5. Verify: cd client && npm run build
6. Restart the frontend and backend and test a booking with a photo.

Rates: $30 per cleaner per hour when customer supplies materials; $35 when CleanSure supplies materials; Ontario HST 13%.
The customer must accept the estimate to proceed from Schedule to Contact. The server independently calculates and records the price and acceptance time. No payment is charged.

IMPORTANT: Running SQL first is necessary. Without the new bookings columns, new bookings will fail to save.

Backups are created beside edited files with .before-pricing suffix. If installer cannot find expected code, it exits before writing files.

The upgrade assumes the previous photo-upload patch is already installed, as in your successful build. It does not add payments, authentication, or production abuse prevention.

# CleanSure — Organized React/Vite frontend

## Install
`npm install` then `npm run dev` inside `client/`.

The customer homepage is React (`src/App.jsx`). The four-step booking form posts to `/api/bookings` and the cleaner application posts to `/api/cleaner-applications`. Both require the separate Express backend to implement these endpoints. The existing admin interface is retained as `admin.html` with `admin.js` and `admin.css`; it requires the backend admin API. Do not accept real customer information until backend validation, authorization and persistence are tested.

Hero image: `public/images/cleansure-team.png`.

The legacy duplicate static customer website (`styles.css`, `script.js`) was removed to avoid conflicting frontends.

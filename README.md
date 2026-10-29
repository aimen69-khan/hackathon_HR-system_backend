# HCM Lite Backend

Node.js + Express + MongoDB Atlas backend for the HCM Lite frontend.

## Quick start

```bash
cd backend
npm install
cp .env.example .env   # then edit MONGODB_URI and JWT_SECRET
npm run seed           # clear + seed demo data
npm start              # http://localhost:5000
```

## Demo logins (password: `password123`)

| Role     | Email              |
|----------|--------------------|
| Admin    | admin@hcm.test     |
| HR       | hr@hcm.test        |
| Employee | employee@hcm.test  |

## Scripts

- `npm start` – run server
- `npm run seed` – wipe collections and load fresh demo data
- `npm run clear` – drop all collections only

## Health

`GET /api/health` – reports process + MongoDB connection status.

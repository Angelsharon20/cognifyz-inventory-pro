# Inventory Pro — Ledger Control
### Cognifyz Internship · Level 4 (Expert) · Tasks 6, 7 & 8

An enterprise-hardened Product Management system: Node.js + Express + MongoDB
(Mongoose) on the backend, Vanilla HTML/CSS/JS (Fetch API only, no frameworks)
on the frontend.

## What's implemented

| Task | Feature | Where |
|---|---|---|
| 6 | JWT authentication, bcrypt password hashing, protected CRUD | `models/User.js`, `middleware/authMiddleware.js`, `server.js` |
| 7 | Live currency conversion via third-party API (open.er-api.com) | `server.js` → `/api/currency/rates` |
| 8 | Rate limiting (auth vs. general channels) | `middleware/rateLimiter.js` |
| 8 | Centralized error handling (validation, cast, duplicate key, DB drops) | `middleware/errorHandler.js` |

All API routes use **relative paths** (`/api/...`), so the same build runs
identically in local dev and on Render/Railway with zero code changes.

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env .env.local   # or just edit .env directly
# then fill in MONGO_URI and a real JWT_SECRET

# 3. Run in dev mode (auto-restart via nodemon)
npm run dev

# --- or for production-style run ---
npm start
```

The app serves both the API and the static frontend from the same Express
process — visit `http://localhost:5000` after starting.

Generate a strong JWT secret with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## API reference

**Auth** (`/api/auth`, strict rate limit)
- `POST /api/auth/register` — `{ username, password }` → `{ token, user }`
- `POST /api/auth/login` — `{ username, password }` → `{ token, user }`
- `GET /api/auth/me` — requires `Authorization: Bearer <token>`

**Products** (`/api/products`, all routes protected, standard rate limit)
- `GET /api/products?search=&category=` — list + live metrics
- `GET /api/products/:id`
- `POST /api/products` — `{ product_name, price, category, stock_quantity }`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

**Currency** (`/api/currency`, standard rate limit, cached 10 min)
- `GET /api/currency/rates` → `{ base: "USD", rates: { USD, EUR, INR } }`

**Health**
- `GET /api/health`

## Deploying

### 1. Push to GitHub

```bash
cd cognifyz-inventory-pro
git init
git add .
git commit -m "Level 4: JWT auth, live currency conversion, production hardening"
git branch -M main
git remote add origin https://github.com/<your-username>/cognifyz-inventory-pro.git
git push -u origin main
```

> `.env` is already in `.gitignore` — your real secrets never get committed.
> Only the `.env` *template* in this repo is safe/public.

### 2a. Deploy to Render

1. Go to [render.com](https://render.com) → **New** → **Web Service** → connect your GitHub repo.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variables under **Environment**:
   - `MONGO_URI` — your MongoDB Atlas connection string
   - `JWT_SECRET` — a long random string
   - `JWT_EXPIRES_IN` — `7d`
   - `NODE_ENV` — `production`
   - (Render sets `PORT` automatically — you don't need to add it.)
5. Deploy. Render gives you a live URL like `https://inventory-pro.onrender.com`.

### 2b. Deploy to Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Railway auto-detects Node.js and runs `npm install && npm start`.
3. Open the **Variables** tab and add:
   - `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`, `NODE_ENV=production`
4. Under **Settings → Networking**, click **Generate Domain** to get a public URL.

### MongoDB Atlas quick setup (needed for either host)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access** → add a user with a strong password.
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere) so Render/Railway can connect.
4. **Connect → Drivers** → copy the connection string into `MONGO_URI`, replacing `<password>` and adding your database name before the `?`.

## Notes on the third-party currency API

`GET /api/currency/rates` calls `https://open.er-api.com/v6/latest/USD` via
Axios and caches the result in memory for 10 minutes to avoid rate-limiting
and to keep the dashboard snappy. If the upstream API is temporarily
unreachable, the endpoint gracefully falls back to the last cached values
instead of failing the whole dashboard — see `server.js`.

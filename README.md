# KIMPC (Kalilangan Irrigators Multi-Purpose Cooperative) Machinery Portal

A web application for agricultural cooperative machinery rental, asset management, and booking dispatch built with an Express & MongoDB backend (`server/`) and a modern React (Vite) single-page application (`client/`).

---

## 🏗️ Architecture Overview

The system uses a decoupled client-server architecture:

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│      Frontend (React SPA)      │         │      Backend (Express API)     │
│          client/src            │         │          server/server.js      │
│                                │         │                                │
│  • Member Portal (/member)     │  HTTP   │  • Auth API (/api/auth)        │
│  • Manager Portal (/manager)   │ ──────> │  • Machinery API (/api/...)    │
│  • Admin Portal (/admin)       │  Proxy  │  • Manager API (/api/manager)  │
│  • Google OAuth / JWT Auth     │         │  • Google Calendar Sync        │
└────────────────────────────────┘         └────────────────────────────────┘
                                                           │
                                                           ▼
                                           ┌────────────────────────────────┐
                                           │       MongoDB (Atlas/Local)    │
                                           │   Mongoose Data Models         │
                                           └────────────────────────────────┘
```

- **In Development**: Vite dev server runs on `http://localhost:5173` and proxies `/api` calls to `http://localhost:3000`.
- **In Production**: Express serves the compiled React bundle from `client/dist` directly on port `3000`.

---

## 📁 Project Directory Structure

```
minders/
│
├── client/                            # Modern React Frontend (Vite + React 19)
│   ├── public/                        # Static assets (logos, background images, favicon)
│   │   └── images/
│   ├── src/                           # React application source code
│   │   ├── assets/                    # App images & SVG icons
│   │   ├── components/                # Reusable UI components (Header, Topbar, Sidebar)
│   │   ├── context/                   # Global state (AuthContext.jsx)
│   │   ├── pages/                     # Role-based route views
│   │   │   ├── Admin/                 # AdminDashboard, AccountManagement, AuditLogs
│   │   │   ├── Auth/                  # Login.jsx (with Google & Facebook auth)
│   │   │   ├── Manager/               # ManagerDashboard, BookingApprovals, Units
│   │   │   └── Member/                # Dashboard, equipment catalog/booking, applications
│   │   ├── services/                  # API fetch client wrapper (api.js)
│   │   ├── styles/                    # CSS stylesheets (admin-kimpc.css, login-coop.css)
│   │   ├── App.jsx                    # React Router root definitions
│   │   └── main.jsx                   # React entry point
│   ├── dist/                          # Compiled production frontend build
│   ├── package.json                   # Frontend dependencies & Vite scripts
│   └── vite.config.js                 # Vite configuration with /api proxy to port 3000
│
├── server/                            # Complete Backend Server (Node.js + Express + Mongoose)
│   ├── config/                        # Infrastructure configurations
│   │   └── database.js                # MongoDB connection management & event listeners
│   ├── controllers/                   # Request controllers (manager analytics, fleet, operations)
│   ├── middleware/                    # Express middleware (JWT authentication, role authorization)
│   ├── models/                        # Mongoose data models (Account, Application, MachineryUnit, etc.)
│   │   └── index.js                   # Central unified model export registry
│   ├── routes/                        # API endpoints (api, auth, applications, machinery, geocode)
│   ├── services/                      # Reusable backend services (auditLogger, mailer, googleCalendar)
│   ├── workers/                       # Scheduled cron workers (booking reminders, audit archives)
│   ├── scripts/                       # Database maintenance and verification scripts
│   │   └── db-inspect.js              # Database health check & collection inspector CLI
│   ├── uploads/                       # Uploaded machinery photos and GCash receipt images
│   ├── public/                        # Legacy fallback static assets
│   ├── .env                           # Backend environment variables (DB URI, OAuth keys)
│   ├── .env.example                   # Template for required environment variables
│   ├── DATABASE_SCHEMA.md             # Complete Database Schema, ERD, and Data Dictionary
│   ├── package.json                   # Server dependencies & scripts (Express, Mongoose, etc.)
│   ├── app.js                         # Express application setup, middleware, and route mounting
│   ├── seed.js                        # Database seeder for demo Admin, Manager, and Member accounts
│   └── server.js                      # Server bootstrapper (connects DB, workers, and starts listener)
│
├── .gitignore                         # Git exclusion rules
└── package.json                       # Monorepo orchestrator scripts (npm run dev, build, client, db:check)
```

---

## 🗄️ Database Architecture & Schema Documentation

The system connects to **MongoDB Atlas** (database: `minders`). For complete developer documentation on collections, schemas, entity relationships, and indexes, see:

👉 [**server/DATABASE_SCHEMA.md**](file:///c:/Users/DELL%20RTX/OneDrive/Documents/pads/BUKSU/Merge%20Project/minders/server/DATABASE_SCHEMA.md)

### Database Management Commands

```bash
# Check live database connection, collections, document counts & integration statuses
npm run db:check

# Seed default demo accounts (Admin, Manager, Member)
npm run seed
# or
npm run db:seed
```

---

## 🚀 How to Run

### 1. Prerequisites
- **Node.js** (v18 or newer recommended, current environment: Node v24).
- **MongoDB** (Atlas connection string or local MongoDB instance).

### 2. Environment Configuration
Ensure `.env` exists in `server/` (or project root) with the required parameters:
```env
MONGODB_URI=mongodb+srv://...
PORT=3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_GEOCODING_API_KEY=...
RECAPTCHA_SITE_KEY=...
RECAPTCHA_SECRET_KEY=...
SUPPORT_EMAIL=...  # Optional: customer support inbox (requires SMTP settings)
SUPPORT_PHONE=...  # Optional: customer service phone number
```

### 3. Running in Development (Recommended)

From the project root:

```bash
# Terminal 1: Backend Server (Node with --watch)
npm run dev
# or: cd server && npm run dev

# Terminal 2: React Frontend (Vite HMR)
npm run client
# or: cd client && npm run dev
```

Access the frontend application at **http://localhost:5173**.

### 4. Running in Production
Build the frontend and start the server:
```bash
npm run build
npm start
```
Access the application at **http://localhost:3000**.

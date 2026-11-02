# KIMPC (Kalilangan Irrigators Multi-Purpose Cooperative) Machinery Portal

A web application for agricultural cooperative machinery rental, asset management, and booking dispatch built with an Express & MongoDB backend and a modern React (Vite) single-page application (SPA).

---

## 🏗️ Architecture Overview

The system uses a decoupled client-server architecture:

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│      Frontend (React SPA)      │         │      Backend (Express API)     │
│   Minders-mongodb/client/src   │         │    Minders-mongodb/server.js   │
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
├── .vscode/                           # Visual Studio Code launch & debug profiles
│   └── launch.json                    # 1-click debugging for Node backend & browser
├── Minders-mongodb/                   # Main project folder
│   ├── client/                        # Modern React Frontend (Vite + React 19)
│   │   ├── public/                    # Static assets (logos, background images, favicon)
│   │   │   └── images/
│   │   ├── src/                       # React application source code
│   │   │   ├── assets/                # App images & SVG icons
│   │   │   ├── components/            # Reusable UI components (Header, ProtectedRoute)
│   │   │   ├── context/               # Global state (AuthContext.jsx)
│   │   │   ├── pages/                 # Role-based route views
│   │   │   │   ├── Admin/             # AdminDashboard, AccountManagement, AuditLogs
│   │   │   │   ├── Auth/              # Login.jsx (with Google & Facebook auth)
│   │   │   │   ├── Manager/           # ManagerDashboard, BookingApprovals
│   │   │   │   └── Member/            # MemberDashboard, Applications
│   │   │   ├── services/              # API fetch client wrapper (api.js)
│   │   │   ├── styles/                # CSS stylesheets (admin-wheelzie.css, login-coop.css)
│   │   │   ├── App.jsx                # React Router root definitions
│   │   │   └── main.jsx               # React entry point
│   │   ├── dist/                      # Compiled production frontend build
│   │   ├── package.json               # Frontend dependencies & Vite scripts
│   │   └── vite.config.js             # Vite configuration with /api proxy to port 3000
│   │
│   ├── controllers/                   # Backend request controllers
│   │   ├── managerAnalyticsController.js   # Dashboard metrics, utilization & revenue reporting
│   │   ├── managerController.js            # Booking approvals, calendar, rescheduling
│   │   └── managerMachineryController.js   # Fleet registration, pricing, maintenance logs
│   │
│   ├── middleware/                    # Express middleware
│   │   └── authManager.js             # JWT verification & role validation (admin/manager)
│   │
│   ├── models/                        # Mongoose data models
│   │   ├── Account.js                 # Users (members, managers, admins, profile data)
│   │   ├── Application.js             # Equipment booking requests & rental schedules
│   │   ├── AuditLog.js                # System event audit records
│   │   ├── MachineryMaintenance.js    # Fleet maintenance & repair schedules
│   │   ├── MachineryUnit.js           # Physical machinery unit inventory
│   │   ├── MachineryUsage.js          # Operating runtime & idle hours logs
│   │   ├── SystemSetting.js           # Dynamic toggles (Google login, reCAPTCHA, etc.)
│   │   └── Transaction.js             # Payment & deposit financial transactions
│   │
│   ├── routes/                        # Express API route endpoints
│   │   ├── api.js                     # Core API routes (auth, accounts, applications, units)
│   │   ├── calendar.js                # Google Calendar 2-way sync endpoints
│   │   └── manager.js                 # Manager operations endpoints
│   │
│   ├── services/                      # Reusable backend services
│   │   ├── auditLogger.js             # Centralized audit logging utility
│   │   ├── emailService.js            # OTP email delivery & simulation
│   │   └── googleCalendarService.js   # Google Calendar API integration
│   │
│   ├── workers/                       # Scheduled background workers
│   │   └── archiveAuditLogs.js        # Monthly audit log archiver cron worker
│   │
│   ├── public/                        # Legacy fallback static assets (styles & images)
│   ├── .env                           # Environment variables (DB URI, OAuth keys)
│   ├── .env.example                   # Template for required environment variables
│   ├── package.json                   # Root backend package configuration & scripts
│   ├── seed.js                        # Database seeder for default Admin & Manager accounts
│   └── server.js                      # Main Express application entry point
└── pic src/                           # Raw image source repository
```

---

## 🚀 How to Run

### 1. Prerequisites
- **Node.js** (v18 or newer recommended, current environment: Node v24).
- **MongoDB** (Atlas connection string or local MongoDB instance).

### 2. Environment Configuration
Ensure `.env` exists in `Minders-mongodb/` with the required parameters:
```env
MONGODB_URI=mongodb+srv://...
PORT=3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RECAPTCHA_SITE_KEY=...
RECAPTCHA_SECRET_KEY=...
```

### 3. Running in Development (Recommended)

Open two terminals in `Minders-mongodb/`:

```bash
# Terminal 1: Backend Server (with file watching)
cd Minders-mongodb
npm run dev

# Terminal 2: React Frontend (with Hot-Module Reloading)
cd Minders-mongodb
npm run client
```
Access the application at **http://localhost:5173**.

### 4. Running in Production
Build the frontend and start the production server:
```bash
cd Minders-mongodb
npm run build
npm start
```
Access the application at **http://localhost:3000**.

---

## 🔑 Default Seed Accounts
Run `npm run seed` once to initialize default administrative credentials:
- **Admin**: `admin@minders.test` / `Admin123!`
- **Manager**: `manager@minders.test` / `Manager123!`

---

## 🛡️ Security & Authentication
- **JSON Web Tokens (JWT)**: Issued on `POST /api/login` and sent as `Authorization: Bearer <token>`.
- **Google Sign-In**: Uses Google Identity Services OAuth 2.0 Token Client with backend verification.
- **Role-Based Access Control**:
  - `member`: Access to equipment booking request and profile.
  - `manager`: Access to booking approvals, fleet status, scheduling, and analytics.
  - `admin`: Full access to accounts, security settings, audit logs, and system operations.

---

## 🔧 Debugging Tips for Maintainers
1. **VS Code F5 Debugging**: Open the repository in VS Code and select `Debug Backend Server` in the Run & Debug panel (`Ctrl+Shift+D`).
2. **Database Queries**: Test Mongoose queries using quick Node commands:
   ```bash
   node -e "require('dotenv').config(); const m = require('mongoose'); m.connect(process.env.MONGODB_URI).then(() => console.log('DB OK'));"
   ```
3. **Frontend API Proxy**: All frontend requests in `client/src/services/api.js` use `/api/*`. During development, Vite forwards these to `http://localhost:3000` via `vite.config.js`.
4. **Audit Logs**: All sensitive operations (logins, booking decisions, pricing changes) are automatically recorded to the `AuditLog` collection.

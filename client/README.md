# KIMPC Client (React Frontend SPA)

The modern React frontend for the KIMPC (Kalilangan Irrigators Multi-Purpose Cooperative) Machinery Rental Portal, built with Vite, React 19, and React Router 7.

---

## 📁 Client Architecture

```
client/
├── public/                     # Static public assets (copied directly to dist on build)
│   ├── images/                 # Logo and login page backgrounds
│   ├── favicon.svg             # Browser tab icon
│   └── icons.svg
├── src/
│   ├── assets/                 # SVGs and static graphics
│   ├── components/             # Reusable UI components
│   │   ├── Header.jsx          # Top navigation bar with role-based routing & auth controls
│   │   ├── MemberLayout.jsx    # Member-only shell and persistent sidebar layout
│   │   ├── MemberSidebar.jsx   # Member navigation, identity, unread badge, and logout
│   │   └── ProtectedRoute.jsx  # Route guard checking authentication and allowed roles
│   ├── context/
│   │   └── AuthContext.jsx     # User authentication state, login, registration, and session management
│   ├── pages/
│   │   ├── Admin/              # Admin pages (AdminDashboard.jsx, AccountManagement.jsx, AuditLogs.jsx)
│   │   ├── Auth/               # Authentication (Login.jsx with Google Identity & Facebook SDK)
│   │   ├── Manager/            # Manager pages (ManagerDashboard.jsx, BookingApprovals.jsx)
│   │   └── Member/             # Dashboard, equipment catalog/booking, applications, notifications, and settings
│   ├── services/
│   │   ├── api.js              # Fetch wrapper attaching JWT bearer tokens and standard headers
│   │   └── memberPortal.js     # Shared member booking status and display helpers
│   ├── styles/
│   │   ├── member-portal.css   # Member-only responsive design system and light/dark themes
│   │   ├── admin-wheelzie.css  # Modern SaaS dashboard stylesheet (KPI cards, SVG charts, right sidebar)
│   │   ├── login-coop.css      # Agricultural cooperative authentication styles
│   │   └── styles.css          # Portal base design system
│   ├── App.jsx                 # Route definitions and access restrictions
│   └── main.jsx                # Application root mounting
├── index.html                  # HTML entry point (loads fonts, Google GIS, and Facebook SDK)
├── package.json                # Dependencies and npm scripts
└── vite.config.js              # Vite server configuration & API proxy setup
```

---

## 🛠️ Development Scripts

Run these from the project root or directly inside `client/`:

```bash
# Start Vite development server (port 5173 with hot-module reload)
npm run dev

# Compile production bundle into client/dist/
npm run build

# Preview compiled build locally
npm run preview
```

---

## 🌐 Routes & Role Access

| Path | Allowed Roles | Description |
|---|---|---|
| `/login` | Public | Authentication & Registration |
| `/member` | `member`, `manager`, `admin` | Member dashboard, equipment rental requests |
| `/applications` | `member`, `manager`, `admin` | Member booking history & status |
| `/member/book` | `member`, `manager`, `admin` | Searchable cooperative equipment catalog |
| `/member/book/:id` | `member`, `manager`, `admin` | Equipment details, availability, and booking request |
| `/member/notifications` | `member`, `manager`, `admin` | In-app notifications and read/delete actions |
| `/member/settings` | `member`, `manager`, `admin` | Profile, appearance, notification, and account settings |
| `/manager` | `manager`, `admin` | Modern SaaS fleet manager dashboard & equipment analytics |
| `/booking-approvals` | `manager`, `admin` | Booking decision pipeline (approve, reject, void) |
| `/admin` | `admin` | Administrative controls & security settings |
| `/account-management` | `admin` | Member and manager user account administration |
| `/audit-logs` | `admin` | System activity and security audit trail |

---

## 🔌 API Proxy Configuration
In `vite.config.js`, all calls to `/api` are automatically proxied to the backend Express server:
```javascript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
      secure: false,
    },
  },
}
```
Maintainers do not need to hardcode `http://localhost:3000` inside React components. Simply use `api('/path')` from `services/api.js`.

The member equipment detail page uses `GET /api/machinery-units/:id/availability` to display privacy-safe booking and maintenance periods. The picker disables occupied dates and hourly slots; the application endpoint independently checks for overlaps before creating a request.

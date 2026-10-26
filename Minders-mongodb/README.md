# Minders (MongoDB version)

The original Minders front-end now stores accounts and equipment applications in MongoDB,
through a small Express server.

```
Browser (public/script.js)  →  fetch("/api/...")  →  Express (server.js, routes/api.js)  →  Mongoose models  →  MongoDB
```

## Run it

1. Install Node.js (LTS) from nodejs.org.
2. Get a database:
   - **MongoDB Atlas (easiest):** create a free cluster, add a database user, allow your IP under
     Network Access, then Connect → Drivers → copy the connection string.
   - **Local:** install MongoDB Community Server (and optionally Compass).
3. In this folder, install packages:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and set `MONGODB_URI` (add the database name, e.g. `.../minders`).
5. Create the first admin and manager accounts (run once):
   ```bash
   npm run seed
   ```
   - admin@minders.test / Admin123!
   - manager@minders.test / Manager123!
6. Start the server:
   ```bash
   npm start
   ```
7. Open **http://localhost:3000/login.html** (do not open the .html files directly from disk,
   because the API calls need the server).

Admin sign-in: `login.html?role=admin`. Manager sign-in: `login.html?role=manager`.

## Folder layout

| Path | Purpose |
|---|---|
| `public/` | The original HTML, CSS and `script.js` (now calls the API) |
| `server.js` | Starts Express and connects to MongoDB |
| `routes/api.js` | Existing API endpoints |
| `routes/manager.js` | Manager endpoints for calendar, bookings, analytics and fleet |
| `controllers/managerController.js` | Calendar feed, booking decisions, resolution and extensions |
| `controllers/managerAnalyticsController.js` | Dashboard metrics, field issues and revenue reporting |
| `controllers/managerMachineryController.js` | Fleet registration, pricing, maintenance and usage logs |
| `middleware/authManager.js` | JWT and manager/admin role verification |
| `models/Account.js` | `accounts` collection (members, managers, admins, profile data) |
| `models/Application.js` | `applications` collection (equipment requests) |
| `models/MachineryUsage.js` | Machinery operator, runtime and idle-time logs |
| `seed.js` | Creates the first admin and manager |

## Manager API

All `/api/manager/*` endpoints require a valid `Authorization: Bearer <JWT>` token for a
manager or admin. Machinery mutation routes under `/api/machinery-units` use the same middleware.
The JWT is issued by `POST /api/login`; manager identity and role are rechecked against the
account in MongoDB on every request.

| Method and path | Purpose |
|---|---|
| `GET /api/manager/calendar/events?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | Returns FullCalendar-compatible all-day booking and active maintenance events plus resource labels. Booking end dates are inclusive in storage and converted to FullCalendar's exclusive `end`. |
| `GET /api/manager/bookings?status=Pending&page=1&limit=50` | Lists booking requests (defaults to pending); supports `status=All` and an optional paired `startDate`/`endDate` overlap filter. |
| `PATCH /api/manager/bookings/:id/approve` | Approves a pending request after checking for overlapping approved bookings and active maintenance. Optional JSON body: `{"remarks":"..."}`. |
| `PATCH /api/manager/bookings/:id/reject` | Rejects a pending request. Optional JSON body: `{"remarks":"..."}`. |
| `PATCH /api/manager/bookings/:id/resolve` | Reschedules or reassigns a pending/approved booking. Accepts `startDate`, `endDate`, `unitId`, or `equipment` as needed, and optional `remarks`. |
| `PATCH /api/manager/bookings/:id/extend` | Extends an active checked-out rental. Requires a later `endDate`; rejects booking and maintenance conflicts. |
| `GET /api/manager/dashboard/metrics` | Returns pending request count, daily/monthly rental revenue, logged-use utilization and current maintenance/late-return counts. |
| `GET /api/manager/utilization` | Returns current-month runtime-based utilization rates grouped by machinery category. |
| `GET /api/manager/field-issues` | Returns current maintenance flags, overdue checked-out rentals and overlapping reserved schedules. |
| `POST /api/manager/machinery` | Registers a unit with optional daily/hourly rates, deposit and late-fee values. |
| `PATCH /api/manager/machinery/:id/pricing` | Updates any of `ratePerDay`, `ratePerHour`, `depositRequired`, `lateFeePerDay`. |
| `PATCH /api/manager/machinery/:id/archive` | Soft-archives a unit; refused while it has an approved or active rental. |
| `GET /api/manager/machinery/:id/maintenance-logs` | Lists maintenance/repair records and their accumulated cost. |
| `POST /api/manager/machinery/:id/maintenance-logs` | Adds a completed repair/maintenance log with reason, type, cost and optional runtime-hours reading. |
| `GET /api/manager/machinery/:id/usage-logs?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | Lists operator, runtime-hours and idle-hours records. |
| `POST /api/manager/machinery/:id/usage-logs` | Adds a completed usage record with `operator`, `startAt`, `endAt`, `runtimeHours`, and optional `idleHours`, `applicationId`, and `notes`. |
| `GET /api/manager/reports/revenue/daily?date=YYYY-MM-DD&format=csv` | Daily completed transaction report; CSV export is optional. |
| `GET /api/manager/reports/revenue/monthly?month=YYYY-MM&format=csv` | Monthly completed transaction report; CSV export is optional. |
| `GET /api/manager/reports/revenue/annual?year=YYYY&format=csv` | Annual completed transaction report; CSV export is optional. |

Manager decisions, schedule changes, extensions, pricing changes, archiving, maintenance/usage
logs, and CSV exports are written to `AuditLog`. Maintenance history includes totals and a
breakdown by repair/maintenance type. Existing booking records may identify only an equipment
name; those records continue to use name-based conflict detection until a manager assigns them
to a specific unit. Utilization is based on recorded `MachineryUsage` hours, so historical
periods without usage logs will report zero utilization.

## What replaced localStorage

| Before (browser) | Now (MongoDB) |
|---|---|
| `minders-member-accounts` | `accounts` collection |
| `minders-member-profiles` | fields on the account document |
| `minders-equipment-applications` | `applications` collection |

## Known limitations (good next steps)

- **Legacy non-manager APIs still lack comprehensive authorization.** The manager API and
  machinery mutation/inspection routes verify the current manager/admin role, but member and
  other legacy API routes should be reviewed before production use.
- **Email verification is simulated.** The "Confirm email" button just flips a flag. A real
  version would send a signed link with Nodemailer or a similar service.
- The sample bookings, issues and rental cards are still hard-coded demo data in `public/script.js`.

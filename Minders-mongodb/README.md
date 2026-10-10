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
| `routes/api.js` | All API endpoints |
| `models/Account.js` | `accounts` collection (members, managers, admins, profile data) |
| `models/Application.js` | `applications` collection (equipment requests) |
| `seed.js` | Creates the first admin and manager |

## What replaced localStorage

| Before (browser) | Now (MongoDB) |
|---|---|
| `minders-member-accounts` | `accounts` collection |
| `minders-member-profiles` | fields on the account document |
| `minders-equipment-applications` | `applications` collection |

## Known limitations (good next steps)

- **Login state is still a `sessionStorage` flag**, and the API does not check who is calling it.
  Anyone who edits it in DevTools could pretend to be an admin. Add `express-session` or JWT
  and check the role in `routes/api.js` before using this for real.
- **Email verification is simulated.** The "Confirm email" button just flips a flag. A real
  version would send a signed link with Nodemailer or a similar service.
- The sample bookings, issues and rental cards are still hard-coded demo data in `public/script.js`.

# Team Hours

## Approved timesheet update

This source contains the finalized green weekly/monthly table, employee selection, compact edit/remove icons, collapsed management sections, fixed project/total columns, and high-resolution PNG export. **The updated source has not been published:** the authoring session blocked network access to the hosting repository. The existing hosted app remains on its previous version.

Choose your name and enter your PIN to sign in. Members can switch accounts using the name selector, which signs them out and requires the selected person's PIN. Managers/admins can select other people to view their timesheet but can edit only their own hours. Names and projects are managed by admins. Employee removal deactivates access and retains history; project deletion archives a project when anyone has logged hours.

Select Weekly or Monthly, add projects from the shared list, enter hours (including 10, 11 or fractional values), then click Save week/month. Only changed cells are submitted. All changes in that save commit together or none do. Concurrent changes to the same cells are rejected instead of silently overwritten. Existing notes are preserved when multiple entries are combined into a daily project total. Dates follow Europe/Tirane.

Removing a row only hides it on this browser. Add it back to show its saved hours. Display preferences are local; the hours, employees and projects remain in the shared database. Visible-row totals and exports exclude hidden rows, and a notice identifies saved hours on hidden projects. Daily validation includes all rows. PNG export includes the selected employee, the entire period, visible projects and totals, at up to three times resolution (with a size cap for very large sheets).

`app.html` is the editable production interface. Run `node build.mjs` after editing it to regenerate `ui.mjs` and the hosting bundle. `timesheet.js` is a reference copy of the timesheet implementation already included in `app.html`; edit `app.html` for production changes. Run `node --test test.mjs sheet.test.mjs` after building. The update adds migration `0001_sheet_writes.sql`; existing data is retained, and the Node adapter applies it automatically at startup.

To publish when repository network access is available, open the existing Site repository, retain its current public audience, synchronize this source, run the build and tests, package the built `dist/` folder including `.openai/hosting.json` and migrations, then save and deploy the matching pushed commit through Sites. Do not deploy the old saved version expecting it to contain this update. No Miro integration is included; the PNG can be uploaded to a Miro board as an image.

A browser app with one shared database, individual PIN sign-in, daily project hours, weekly/monthly summaries, CSV export, and people/project administration. No npm packages are needed. The same application runs as a Cloudflare Worker with D1 or on Node 24 with SQLite.

## First use

Open the app URL, enter the one-time setup key supplied by the operator, and choose your administrator name and a 6–12 digit PIN. Setup is disabled atomically once any person exists. Sign in, open **Workspace**, add projects, and create each team member with a separate PIN. Give people their PIN privately. They can change it in **My account**. There are no demo accounts or default PINs.

## Permissions

| Role | Record/edit/delete own hours | View own summaries | View all people/projects and reports | Manage people/projects |
|---|---|---|---|---|
| Member | Yes | Yes | No | No |
| Project manager | Yes | Yes | Yes | No |
| Administrator | Yes | Yes | Yes | Yes |

Each API operation checks the current database role. Managers and admins cannot edit another person's hours. Role changes, deactivation, PIN resets and PIN changes revoke sessions. Admins cannot change their own account through administration, preventing removal of the last active administrator. Create a second administrator for recovery.

Projects can be archived and people deactivated without deleting historical hours. Archived projects cannot receive new or edited entries; reactivate a project temporarily if a historical correction is necessary. Reports retain archived projects and inactive people's history. Employees can record multiple project entries on a date; the database rejects totals above 24 hours, including concurrent writes. Dates are selected in the browser's local calendar; weeks run Monday–Sunday and months use calendar boundaries. Hours are rounded to whole minutes.

## Run locally

Install **Node.js 24 or later**. From this folder run:

```powershell
node server.mjs
```

Open http://localhost:3000. On an empty database the server prints a random one-time setup key. Copy it into the setup form. By default, the database is `data/team-hours.sqlite`; restarting preserves all records. No install step is required.

Optional environment settings:

| Variable | Default | Meaning |
|---|---|---|
| PORT | 3000 | HTTP port |
| HOST | 127.0.0.1 | Listener address; use 0.0.0.0 inside a container |
| APP_ORIGIN | http://localhost:3000 | Exact external origin, with scheme and port if needed |
| DATABASE_PATH | data/team-hours.sqlite | Database location on a persistent disk |
| SETUP_TOKEN | Random per startup | Explicit operator-supplied bootstrap secret, only used before setup |

## Deploy to a shared server

Use one Node 24 server/container with a persistent volume. Run `node server.mjs`, set `HOST=0.0.0.0`, set `APP_ORIGIN=https://your-domain.example`, and put it behind an HTTPS reverse proxy at that exact origin. Forward the path and Cookie/Origin headers. Keep the backend port private. All browsers then use the same URL and SQLite database. Do not use ephemeral serverless storage or run independent replicas with separate SQLite files. The Node adapter deliberately derives rate-limiting addresses from the socket, ignoring client-supplied forwarding headers; behind a proxy its IP limit is shared. For larger teams, use D1 and its trusted Cloudflare client IP header or adapt the proxy integration carefully.

A Docker example is included. Build with `docker build -t team-hours .`, then run:

```text
docker run -d --name team-hours --restart unless-stopped -p 127.0.0.1:3000:3000 -e APP_ORIGIN=https://your-domain.example -v team-hours-data:/app/data team-hours
docker logs team-hours
```

Use the logs to obtain the bootstrap key. Set up the administrator before sharing the URL. Configure HTTPS in your reverse proxy before production use.

### Sites / Cloudflare D1 deployment

The checked-in `.openai/hosting.json` identifies this Site and requests the `DB` binding. `node build.mjs` creates `dist/server/index.js`, the hosting manifest, and schema migrations. Sites provisions D1 and applies `drizzle/0000_initial.sql` during publication. Set `SETUP_TOKEN` as a secret in the Site runtime environment, then publish the built archive through Sites. Runtime secrets must not be added to source or the manifest. Local SQLite and hosted D1 are separate databases; local test data is not uploaded. Preserve migration files once applied and append new migrations for future schema changes.

Sites adds its own audience access boundary. A private Site is an owner preview. To use PIN-only sign-in for the team, its audience must allow visitors with the URL; the application still protects all time records and administrative APIs with its own PIN session. The public sign-in name list is visible to visitors, as required by the choose-your-name flow. Approved ChatGPT audience access can instead provide an additional outer gate.

## Security and operations

- PINs use PBKDF2-SHA-256 with unique random salts and 100,000 iterations. Use longer random PINs for privileged accounts. No plaintext PINs or session tokens are stored in the database.
- Sessions use cryptographically random tokens, stored as SHA-256 hashes, and expire after 12 hours. Cookies are HttpOnly, SameSite=Strict and Secure on HTTPS.
- State-changing requests require JSON and an exact matching Origin. SQL values are bound parameters. Browser display values are escaped, and CSV cells escape spreadsheet formulas.
- Login is limited to 10 attempts per 15 minutes per person and per client address. Attempts persist centrally. PIN-change attempts and bootstrap attempts are also limited. High-volume public deployments should add edge abuse protection; this MVP has no MFA or audit-history screen.
- The app does not offer self-service account recovery. Another administrator can reset a PIN. Keep a second administrator and database backups. Do not log PINs or setup keys in shared logs.
- Back up SQLite with its online backup facility or stop the service before copying the database. Do not copy only the live `.sqlite` file while WAL writes are active. Protect backups like production data. Use your D1 provider's backup/export facility for hosted data. Test restoration before relying on it.
- Application logs intentionally omit request bodies and credentials. The one-time local setup key is printed only while the database is empty. Remove the hosted `SETUP_TOKEN` secret after initial setup and redeploy when convenient; setup also remains blocked by the database.

## Verify

```text
node --test test.mjs
node build.mjs
```

The integration suite uses a real SQLite database and checks bootstrap, PIN login, origin enforcement, ownership, role boundaries, archive behavior, invalid dates, daily limits, session revocation, throttling, and persistence across database reopen. It also compiles the browser script. Browser visual testing is separate from these automated checks.

## Files

`worker.mjs` holds the shared HTTP API and security checks; `ui.mjs` the responsive interface; `server.mjs` the Node HTTP/SQLite adapter; `drizzle/` the schema; `build.mjs` the Worker packager; and `test.mjs` the integration checks.

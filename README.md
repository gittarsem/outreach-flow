# OutreachFlow

OutreachFlow is a local-first Electron app for composing and scheduling Gmail messages, tracking replies, and managing follow-ups. Email, recipient, schedule, and activity records are stored in a local Excel workbook; profile and template settings are stored locally.

## Local development

Requirements: macOS 12 or later, Node.js 20+, and npm.

```sh
npm install
npm run dev
```

To make a macOS disk image:

```sh
npm run build:mac
```

The disk image is written under `release/`. For a local build without the disk image packaging step, run `npm run build`.

## Gmail OAuth setup

1. Open the Google Cloud Console and create a project for this local app.
2. Enable the **Gmail API** for the project.
3. Configure the OAuth consent screen for an external testing app and add your own Google account as a test user. If Google requests an audience or branding setup, complete the required fields.
4. Create an OAuth client with application type **Desktop app**.
5. In OutreachFlow, open **Settings → Gmail connection**, paste the OAuth Client ID and Client Secret, and choose **Connect Google account**. Sign in in the browser and approve the requested Gmail access.

The app requests `gmail.send`, `gmail.readonly`, `gmail.modify`, and `gmail.compose` for sending, reading thread replies, and creating/organizing drafts. It never asks for the Google account password. Refresh tokens are encrypted by Electron `safeStorage` and stored locally. The app uses a random-port loopback callback at `http://127.0.0.1:<port>` with a **Desktop app** OAuth client; do not use a Web application client or register a fixed redirect URI. No hosted backend is involved. Google may require the consent screen to be published or verified before broader distribution. For personal use, keep your account on the consent screen's test-user list.

Gmail stays disconnected until credentials and consent are configured. No send is simulated. The initial message is shown for review, and the Send action asks for confirmation before calling Gmail.

## Local files

Electron chooses the operating system's application support directory. OutreachFlow creates this structure inside its app data directory:

```text
OutreachFlow/
  OutreachFlow_Data.xlsx
  config/
    profile.json
    templates.json
    skill-dictionary.json
    preferences.json
    gmail-token.enc
    excel-recovery-journal.json   # appears only while a workbook write is unavailable
  resumes/
  backups/
  logs/
```

The workbook contains **Emails**, **Contacts**, **Follow-ups**, **Activity Log**, and **Dashboard Data** sheets. Existing **Applications** sheets are read and retained for compatibility. Changes are written through a temporary workbook then atomically replaced. A local recovery journal retains the latest state if a write fails. Daily workbook backups are created automatically, with the most recent 30 retained. Use **Excel & Data** to import, export, make a backup, or restore a workbook.

The skill dictionary is a JSON array of entries such as:

```json
[
  { "name": "Apache Flink", "group": "libraries", "aliases": ["Flink"] },
  { "name": "Oracle Database", "group": "databases", "aliases": ["Oracle DB"] }
]
```

Supported groups are `skills`, `languages`, `frameworks`, `libraries`, `databases`, `messaging`, `cloud`, and `devops`. Restart OutreachFlow after editing the dictionary.

## Scheduling and reply monitoring

Choose **Send now** or **Schedule for later** for each email. You can set the initial send date/time and follow-up delivery time in IST. Five follow-ups use the saved templates and are scheduled for Days 1, 2, 4, 6, and 7; dates that fall on weekends or Indian public holidays move to the next available weekday. They are stored in the same Gmail thread. Follow-ups can be paused, resumed, cancelled, rescheduled, or retried after a failure. Retries use stable message IDs and check Gmail Sent first to avoid duplicate sends.

The app checks Gmail threads while it is running. When a recruiter replies, pending follow-ups keep their schedule and are updated to acknowledge the reply; delivery failures cancel them. The Mac must be awake and OutreachFlow must be running to send at the chosen time. If the app or Mac was unavailable, queued initial emails resume on next launch; Gmail Sent is checked before retrying an interrupted send. Follow-ups that are overdue require confirmation before sending.

## Candidate profile and resume handling

Candidate Profile stores sender details and optional project examples for templates. Public GitHub profiles and repositories can be imported on request; selectable text in uploaded PDFs can fill profile fields locally. Resume attachment is optional for general emails. Saved templates can be inserted and edited before sending.

Inbox placement cannot be guaranteed by the app. Send relevant, expected messages, avoid misleading content or bulk unsolicited sending, and keep Gmail account/domain authentication and sender reputation in good standing.

## Checks

```sh
npm run typecheck
npm test
npm run test:e2e
```

The unit tests cover configurable follow-up calculation, email template rendering, import parsing, and Excel write/reload persistence. Gmail sends are real only after OAuth is configured; validate with a controlled recipient before relying on scheduled delivery.

## Security notes

- The renderer has no Node integration and communicates through a narrow, context-isolated preload API.
- OAuth tokens are not returned to the renderer or logged.
- The application makes no analytics or AI API calls, and uses no cloud database. GitHub imports make HTTPS requests only when you request an import.
- Google API calls only occur after Gmail is connected.
- Email delivery is performed only through the user's connected Gmail account after explicit confirmation or a saved schedule.

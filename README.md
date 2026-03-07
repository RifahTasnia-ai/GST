# GST Exam System

MCQ exam app with a student-facing exam flow and an admin dashboard. Runtime data now uses Firebase through the Vercel API layer. Static question sets stay in `public/*.json`.

## Runtime Architecture
- `public/*.json`: question set files served as static assets
- `api/*.js`: Vercel serverless endpoints
- `lib/runtimeStore.js`: Firebase-backed runtime storage with local fallback
- `src/pages/ExamPage.jsx`: student exam flow
- `src/pages/AdminPage.jsx`: admin dashboard and live monitoring

## Required Environment Variables
Recommended Vercel secrets:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON=<full firebase service account json>
```

Alternative Firebase setup if you do not want the one-variable JSON secret:

```bash
FIREBASE_PROJECT_ID=<firebase project id>
FIREBASE_CLIENT_EMAIL=<service account client email>
FIREBASE_PRIVATE_KEY=<service account private key>
```

## Local Development
```bash
npm install
npm run dev
```

If Firebase env vars are missing, the server falls back to local JSON storage for development.

## Deploy to Vercel
1. Push the repo to GitHub.
2. Create a Vercel project.
3. Add the required environment variables.
4. Enable Firestore in your Firebase project.
5. Redeploy after env changes.

## Admin Notes
- Question set changes and delete actions now run directly from the admin UI.
- After migration, old `GITHUB_*` Vercel variables are no longer required for runtime.

## Question Set Flow
- Active question set is stored in runtime config.
- Question files are listed from `public/`.
- Used question sets are tracked in config history and shown from the archive icon in the admin modal.

## Core Endpoints
- `GET /api/active-question`
- `POST /api/active-question`
- `GET /api/list-question-files`
- `GET /api/get-answers`
- `POST /api/save-answer`
- `GET /api/get-pending-students`
- `POST /api/save-pending-student`
- `POST /api/remove-pending-student`
- `POST /api/delete-answer`
- `POST /api/delete-student`

## Cleanup Notes
- GitHub is now source control only.
- Runtime no longer depends on GitHub API.
- Class/video runtime features were removed from this app.

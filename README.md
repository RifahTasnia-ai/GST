# 80 MCQ Exam System

Single-page MCQ exam (student) + admin dashboard. Questions/answers stored in GitHub JSON; submissions appended via Vercel serverless API.
Now supports 80 questions!

**Live Demo:** [https://100gst.vercel.app/](https://100gst.vercel.app/)

## Screenshots

### Exam Start Page
![Exam Start Page](screenshots/exam-start.png)
*Students enter their name to begin the exam*

### Question Interface
![Question Interface](screenshots/exam-question.png)
*MCQ interface with timer, question display, and answer options*

### Admin Panel
![Admin Panel](screenshots/admin-panel.png)
*Admin dashboard showing student submissions, scores, and status*

## Features
- Student starts exam with name/ID (no password)
- 60 min timer, 80 MCQ
- Scoring: +1.0 correct, -0.25 wrong, 0 unanswered; Pass ≥ 60.0
- LocalStorage autosave during exam
- Submit saves to GitHub `answers.json`
- Admin page lists scores, pass/fail, timestamp, and detailed answers

## Files
- `src/pages/ExamPage.jsx` + `src/components/*` — student exam UI
- `src/pages/AdminPage.jsx` + `src/components/admin/*` — teacher/admin dashboard
- `public/*.json` — question sets
- `exam-config.json` — active question set config
- `answers.json` / `pending-students.json` — submission and live exam state
- `api/*.js` — Vercel/serverless endpoints

## Run locally
```bash
npm install
npm run dev
```

## Deploy to Vercel
1) Push this repo to GitHub.  
2) Create a Vercel project pointing to the repo.  
3) Set Environment Variables in Vercel Project Settings:
```
GITHUB_OWNER=<your-github-username-or-org>
GITHUB_REPO=<repo-name>
GITHUB_BRANCH=main          # optional, defaults to main
GITHUB_TOKEN=<PAT with repo scope>
ADMIN_API_KEY=<optional: protects delete/config endpoints>
```
4) Deploy. Student page: `/`. Admin page: `/admin`.

### Fork Setup (RifahTasnia-ai/100Gst)
If your fork is `RifahTasnia-ai/100Gst`, set these exact Vercel environment values:

```
GITHUB_OWNER=RifahTasnia-ai
GITHUB_REPO=100Gst
GITHUB_BRANCH=main
GITHUB_TOKEN=<GitHub PAT with repo contents write access>
ADMIN_API_KEY=<strong secret for admin APIs>
```

Optional frontend envs:
```
VITE_ADMIN_API_KEY=<same as ADMIN_API_KEY, only if you want browser-side admin auth header>
VITE_TEACHER_PIN=<optional UI lock for /admin page>
```

Required GitHub files in your fork root:
```
answers.json              # start with []
pending-students.json     # start with []
exam-config.json          # active question file config
public/questions.json     # default question set
public/*.json             # additional selectable question sets
```

Example `exam-config.json`:
```json
{
  "activeQuestionFile": "questions.json",
  "lastUpdated": "2026-01-01T00:00:00.000Z"
}
```

Optional frontend envs:
```
VITE_TEACHER_PIN=<optional: lock admin page UI>
VITE_ADMIN_API_KEY=<optional: send x-admin-key header from frontend>
```

## GitHub JSON notes
- `questions.json`: contains 50 questions in Bengali covering multiple science topics.
- `answers.json`: should start as `[]`. API appends each submission.

## API details
- Endpoint: `/api/save-answer` (POST JSON)
- Body example:
```json
{
  "studentName": "Alice",
  "answers": { "1": "A", "2": "C" },
  "score": 72.5,
  "totalMarks": 100,
  "timestamp": "2025-01-01T12:00:00.000Z",
  "attempted": 60,
  "correct": 55,
  "wrong": 5,
  "pass": true
}
```

## Admin page data source
- Currently reads `answers.json` from the same repo path. If hosting elsewhere, set the URL in `admin.js` (`RESULTS_URL`).

## System Map (Question/Select/Result/Others)
- Question load (student): `GET /api/get-active-question-file` -> frontend fetches `/<activeFile>`
- Question set list (admin): `GET /api/list-question-files`
- Question set select (admin): `POST /api/set-active-question-file`
- Result submit (student): `POST /api/save-answer` -> writes `answers.json`
- Result read (admin): `GET /api/get-answers`
- Result delete single: `POST /api/delete-answer`
- Result delete student all: `POST /api/delete-student`
- Live pending save/heartbeat: `POST /api/save-pending-student` -> writes `pending-students.json`
- Live pending read: `GET /api/get-pending-students`
- Live pending clear: `POST /api/remove-pending-student`

## Customization
- Update branding/texts in React components under `src/`.
- Styling in `src/index.css` and component CSS files.
- Adjust scoring/timer in `src/components/MCQContainer.jsx` (`MARK_PER_QUESTION`, `NEGATIVE_MARKING`, `DURATION_SECONDS`, `PASS_MARK`).

## Known limitations
- By default there is no auth unless you set `VITE_TEACHER_PIN` and/or `ADMIN_API_KEY`.
- GitHub write is append-only; no concurrency lock. For heavy traffic, consider a DB.


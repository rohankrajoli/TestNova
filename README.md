# Online Quiz System

Full-stack quiz platform with role-based access:
- Admin: create/edit/delete/publish quizzes and questions, view analytics and leaderboard
- Student: take published quizzes, auto-timed attempts, view results and history

## Tech Stack
- React + Vite + TypeScript
- Express + Supabase
- PostgreSQL (via Supabase)
- Zod validation
- Tailwind CSS
- Wouter routing
- Framer Motion animations
- TanStack Query

## Setup
1. Copy `.env.example` to `.env`.
2. Install dependencies:
   - `npm install`
3. Run:
   - `npm run dev`

Backend notes:
- The Express API now uses Supabase as its backend service.
- Supabase stores data in PostgreSQL.
- Set `SUPABASE_URL` and preferably `SUPABASE_SERVICE_ROLE_KEY` before starting the server.

Frontend: `http://localhost:5173`
Backend: `http://localhost:5000`

## Login Flow
- Join as Admin: name + password `admin123`
- Join as Student: name only
- Role and name are stored in `sessionStorage`

## API Endpoints
- `GET/POST /api/quizzes`
- `GET/PUT/DELETE /api/quizzes/:id`
- `GET/POST /api/quizzes/:id/questions`
- `PUT/DELETE /api/questions/:id`
- `GET /api/attempts?quizId=&userName=`
- `POST /api/attempts`
- `GET /api/attempts/:id`
- `GET /api/stats/overview`
- `GET /api/stats/leaderboard?quizId=&limit=`
- `GET /api/stats/quiz/:id`

The frontend still talks to the Express API at `VITE_API_URL`, and the Express API talks to Supabase/PostgreSQL.
"# TestNova" 

import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// --- VALIDATION SCHEMAS (from shared/validation.ts) ---
const quizInputSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  timeLimitSeconds: z.number().int().min(30),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable()
});

const questionInputSchema = z.object({
  text: z.string().min(2),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional().default(""),
  orderIndex: z.number().int().min(0)
});

const attemptInputSchema = z.object({
  quizId: z.number().int().positive(),
  userName: z.string().min(1),
  answers: z.record(z.string(), z.number().int().min(0)),
  timeTakenSeconds: z.number().int().min(0)
});

// --- DB LOGIC (from server/db.ts) ---
function deriveSupabaseUrlFromDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const match = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    return match ? `https://${match[1]}.supabase.co` : null;
  } catch {
    return null;
  }
}

const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  (process.env.DATABASE_URL ? deriveSupabaseUrlFromDatabaseUrl(process.env.DATABASE_URL) : null);

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

// Create client lazily to avoid initialization issues during build or cold starts
let supabaseClient: ReturnType<typeof createClient> | null = null;

const getSupabase = () => {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.");
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabaseClient;
};

// --- SERVER LOGIC (from server/index.ts) ---
type QuizRow = {
  id: number;
  title: string;
  description: string;
  time_limit_seconds: number;
  is_published: boolean;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
};

type QuestionRow = {
  id: number;
  quiz_id: number;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  order_index: number;
};

type AttemptRow = {
  id: number;
  quiz_id: number;
  user_name: string;
  score: number;
  total_questions: number;
  time_taken_seconds: number;
  answers: Record<string, number>;
  completed_at: string;
};

const app = express();
app.use(cors());
app.use(express.json());

const mapQuiz = (row: QuizRow) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  timeLimitSeconds: row.time_limit_seconds,
  isPublished: row.is_published,
  startAt: row.start_at,
  endAt: row.end_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapQuestion = (row: QuestionRow) => ({
  id: row.id,
  quizId: row.quiz_id,
  text: row.text,
  options: row.options,
  correctIndex: row.correct_index,
  explanation: row.explanation ?? "",
  orderIndex: row.order_index
});

const mapAttempt = (row: AttemptRow) => ({
  id: row.id,
  quizId: row.quiz_id,
  userName: row.user_name,
  score: row.score,
  totalQuestions: row.total_questions,
  timeTakenSeconds: row.time_taken_seconds,
  answers: row.answers,
  completedAt: row.completed_at
});

function requireSingle<T>(data: T | null, error: { message: string } | null, notFoundMessage: string) {
  if (error) throw new Error(error.message);
  if (!data) {
    const notFoundError = new Error(notFoundMessage);
    (notFoundError as Error & { status?: number }).status = 404;
    throw notFoundError;
  }
  return data;
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", supabaseConfigured: !!(supabaseUrl && supabaseKey) });
});

app.get("/api/debug-env", (_req, res) => {
  res.json({ 
    keys: Object.keys(process.env).filter(k => !k.includes("KEY") && !k.includes("SECRET")),
    hasUrl: !!process.env.SUPABASE_URL,
    hasKey: !!(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL
  });
});

app.get("/api/quizzes", async (_req, res) => {
  const { data, error } = await getSupabase().from("quizzes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  res.json((data as QuizRow[]).map(mapQuiz));
});

app.post("/api/quizzes", async (req, res) => {
  const parsed = quizInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { data, error } = await getSupabase()
    .from("quizzes")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      time_limit_seconds: parsed.data.timeLimitSeconds,
      start_at: parsed.data.startAt ?? null,
      end_at: parsed.data.endAt ?? null
    })
    .select()
    .single();

  if (error) throw error;
  res.status(201).json(mapQuiz(data as QuizRow));
});

app.get("/api/quizzes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const quizResult = await getSupabase().from("quizzes").select("*").eq("id", id).single();
  const quiz = requireSingle(quizResult.data as QuizRow | null, quizResult.error, "Quiz not found");

  const questionResult = await getSupabase()
    .from("questions")
    .select("*")
    .eq("quiz_id", id)
    .order("order_index", { ascending: true });

  if (questionResult.error) throw questionResult.error;
  res.json({ ...mapQuiz(quiz), questions: (questionResult.data as QuestionRow[]).map(mapQuestion) });
});

app.put("/api/quizzes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof req.body.title === "string") patch.title = req.body.title;
  if (typeof req.body.description === "string") patch.description = req.body.description;
  if (typeof req.body.timeLimitSeconds === "number") patch.time_limit_seconds = req.body.timeLimitSeconds;
  if ("startAt" in req.body && (typeof req.body.startAt === "string" || req.body.startAt === null)) patch.start_at = req.body.startAt;
  if ("endAt" in req.body && (typeof req.body.endAt === "string" || req.body.endAt === null)) patch.end_at = req.body.endAt;
  if (typeof req.body.isPublished === "boolean") patch.is_published = req.body.isPublished;

  const { data, error } = await getSupabase().from("quizzes").update(patch).eq("id", id).select().single();
  const updated = requireSingle(data as QuizRow | null, error, "Quiz not found");
  res.json(mapQuiz(updated));
});

app.delete("/api/quizzes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { error } = await getSupabase().from("quizzes").delete().eq("id", id);
  if (error) throw error;
  res.status(204).send();
});

app.get("/api/quizzes/:id/questions", async (req, res) => {
  const id = Number(req.params.id);
  const { data, error } = await getSupabase()
    .from("questions")
    .select("*")
    .eq("quiz_id", id)
    .order("order_index", { ascending: true });

  if (error) throw error;
  res.json((data as QuestionRow[]).map(mapQuestion));
});

app.post("/api/quizzes/:id/questions", async (req, res) => {
  const quizId = Number(req.params.id);
  const parsed = questionInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (parsed.data.correctIndex >= parsed.data.options.length) {
    return res.status(400).json({ message: "Correct index out of bounds" });
  }

  const { data, error } = await getSupabase()
    .from("questions")
    .insert({
      quiz_id: quizId,
      text: parsed.data.text,
      options: parsed.data.options,
      correct_index: parsed.data.correctIndex,
      explanation: parsed.data.explanation,
      order_index: parsed.data.orderIndex
    })
    .select()
    .single();

  if (error) throw error;
  res.status(201).json(mapQuestion(data as QuestionRow));
});

app.put("/api/questions/:id", async (req, res) => {
  const id = Number(req.params.id);
  const patch: Record<string, unknown> = {};

  if (typeof req.body.text === "string") patch.text = req.body.text;
  if (Array.isArray(req.body.options)) patch.options = req.body.options;
  if (typeof req.body.correctIndex === "number") patch.correct_index = req.body.correctIndex;
  if (typeof req.body.explanation === "string") patch.explanation = req.body.explanation;
  if (typeof req.body.orderIndex === "number") patch.order_index = req.body.orderIndex;

  const { data, error } = await getSupabase().from("questions").update(patch).eq("id", id).select().single();
  const updated = requireSingle(data as QuestionRow | null, error, "Question not found");
  res.json(mapQuestion(updated));
});

app.delete("/api/questions/:id", async (req, res) => {
  const { error } = await getSupabase().from("questions").delete().eq("id", Number(req.params.id));
  if (error) throw error;
  res.status(204).send();
});

app.get("/api/attempts", async (req, res) => {
  const quizId = req.query.quizId ? Number(req.query.quizId) : undefined;
  const userName = req.query.userName?.toString();

  let query = getSupabase().from("attempts").select("*").order("completed_at", { ascending: false });
  if (quizId) query = query.eq("quiz_id", quizId);
  if (userName) query = query.eq("user_name", userName);

  const { data, error } = await query;
  if (error) throw error;
  res.json((data as AttemptRow[]).map(mapAttempt));
});

app.post("/api/attempts", async (req, res) => {
  const parsed = attemptInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { quizId, answers, userName, timeTakenSeconds } = parsed.data;
  const questionResult = await getSupabase()
    .from("questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  if (questionResult.error) throw questionResult.error;
  const quizQuestions = (questionResult.data as QuestionRow[]).map(mapQuestion);
  if (!quizQuestions.length) return res.status(400).json({ message: "Quiz has no questions" });

  const review = quizQuestions.map((q) => {
    const selected = answers[String(q.id)];
    const isCorrect = selected === q.correctIndex;
    return {
      questionId: q.id,
      text: q.text,
      selectedIndex: selected ?? null,
      selectedAnswer: typeof selected === "number" && selected >= 0 && selected < q.options.length ? q.options[selected] : null,
      options: q.options,
      correctIndex: q.correctIndex,
      correctAnswer: q.options[q.correctIndex],
      explanation: q.explanation,
      isCorrect
    };
  });

  const score = review.filter((r) => r.isCorrect).length;
  const { data, error } = await getSupabase()
    .from("attempts")
    .insert({
      quiz_id: quizId,
      user_name: userName,
      score,
      total_questions: quizQuestions.length,
      time_taken_seconds: timeTakenSeconds,
      answers
    })
    .select()
    .single();

  if (error) throw error;
  res.status(201).json({ ...mapAttempt(data as AttemptRow), review });
});

app.get("/api/attempts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const attemptResult = await getSupabase().from("attempts").select("*").eq("id", id).single();
  const attempt = requireSingle(attemptResult.data as AttemptRow | null, attemptResult.error, "Attempt not found");

  const questionResult = await getSupabase().from("questions").select("*").eq("quiz_id", attempt.quiz_id);
  if (questionResult.error) throw questionResult.error;

  const review = (questionResult.data as QuestionRow[]).map(mapQuestion).map((q) => {
    const selected = attempt.answers?.[String(q.id)];
    const isCorrect = selected === q.correctIndex;
    return {
      questionId: q.id,
      text: q.text,
      selectedIndex: selected ?? null,
      selectedAnswer: typeof selected === "number" && selected >= 0 && selected < q.options.length ? q.options[selected] : null,
      options: q.options,
      correctIndex: q.correctIndex,
      correctAnswer: q.options[q.correctIndex],
      explanation: q.explanation,
      isCorrect
    };
  });

  res.json({ ...mapAttempt(attempt), review });
});

app.get("/api/stats/overview", async (_req, res) => {
  const quizzesResult = await getSupabase().from("quizzes").select("*");
  const attemptsResult = await getSupabase().from("attempts").select("*").order("completed_at", { ascending: false });

  if (quizzesResult.error) throw quizzesResult.error;
  if (attemptsResult.error) throw attemptsResult.error;

  const quizzes = (quizzesResult.data as QuizRow[]).map(mapQuiz);
  const attempts = (attemptsResult.data as AttemptRow[]).map(mapAttempt);
  const averageScore = attempts.length
    ? attempts.reduce((sum, attempt) => sum + (attempt.score / attempt.totalQuestions) * 100, 0) / attempts.length
    : 0;

  res.json({
    totalQuizzes: quizzes.length,
    totalAttempts: attempts.length,
    averageScore,
    participants: new Set(attempts.map((attempt) => attempt.userName)).size,
    recentAttempts: attempts.slice(0, 10)
  });
});

app.get("/api/stats/leaderboard", async (req, res) => {
  const quizId = req.query.quizId ? Number(req.query.quizId) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  let query = getSupabase()
    .from("attempts")
    .select("*")
    .order("score", { ascending: false })
    .order("time_taken_seconds", { ascending: true })
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (quizId) query = query.eq("quiz_id", quizId);

  const { data, error } = await query;
  if (error) throw error;
  res.json((data as AttemptRow[]).map(mapAttempt));
});

app.get("/api/stats/quiz/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { data, error } = await getSupabase().from("attempts").select("*").eq("quiz_id", id);
  if (error) throw error;

  const attempts = (data as AttemptRow[]).map(mapAttempt);
  if (!attempts.length) {
    return res.json({ avgScore: 0, passRate: 0, passedAttempts: 0, passedStudents: 0, averageTimeTaken: 0, attempts: 0 });
  }

  const percents = attempts.map((attempt) => (attempt.score / attempt.totalQuestions) * 100);
  const avgScore = percents.reduce((sum, value) => sum + value, 0) / attempts.length;
  const passedAttempts = attempts.filter((attempt) => attempt.totalQuestions > 0 && attempt.score / attempt.totalQuestions >= 0.6);
  const passRate = (passedAttempts.length / attempts.length) * 100;
  const passedStudents = new Set(passedAttempts.map((attempt) => attempt.userName.trim().toLowerCase())).size;
  const averageTimeTaken = attempts.reduce((sum, attempt) => sum + attempt.timeTakenSeconds, 0) / attempts.length;

  res.json({
    avgScore,
    passRate,
    passedAttempts: passedAttempts.length,
    passedStudents,
    averageTimeTaken,
    attempts: attempts.length
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("API error:", err);
  const status = typeof err === "object" && err && "status" in err && typeof err.status === "number" ? err.status : 500;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err && typeof err.message === "string"
        ? err.message
        : "Internal server error";

  res.status(status).json({ message });
});

export default app;

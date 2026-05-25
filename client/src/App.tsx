import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getSession, logout, setSession, type Role, type Session } from "./lib/api";
import { Sidebar } from "@/components/ui/modern-side-bar";

type Quiz = { id: number; title: string; description: string; timeLimitSeconds: number; isPublished: boolean; startAt: string | null; endAt: string | null };
type Question = { id: number; quizId: number; text: string; options: string[]; correctIndex: number; explanation: string; orderIndex: number };
type Attempt = { id: number; quizId: number; userName: string; score: number; totalQuestions: number; timeTakenSeconds: number; completedAt: string };

const page = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

const routeId = (props: any) => Number(props.params?.id ?? props.id);
const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest}s`;
  if (!rest) return `${minutes} min`;
  return `${minutes} min ${rest}s`;
};
const formatTimer = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};
const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "Not scheduled";

function formatPercentage(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function coerceAnswerIndex(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return undefined;
}

/** Prefer server `selectedAnswer`, then index + `options`, then raw `answers` map (handles older payloads / string indices). */
function attemptChosenLabel(
  r: { selectedAnswer?: string | null; selectedIndex?: number | null; options?: unknown; questionId: number },
  answers: unknown,
  fallbackOptions?: unknown
): string | null {
  if (r.selectedAnswer != null && String(r.selectedAnswer).trim() !== "") return String(r.selectedAnswer);
  const optsSource = Array.isArray(r.options) && r.options.length ? r.options : fallbackOptions;
  const opts = Array.isArray(optsSource) ? optsSource.map((x) => String(x)) : [];
  const fromAnswers =
    typeof answers === "object" && answers !== null && !Array.isArray(answers)
      ? (answers as Record<string, unknown>)[String(r.questionId)]
      : undefined;
  const idx = coerceAnswerIndex(r.selectedIndex) ?? coerceAnswerIndex(fromAnswers);
  if (idx !== undefined && idx < opts.length) return opts[idx];
  return null;
}

function ScoreRing({ score, totalQuestions, averageScore }: { score: number; totalQuestions: number; averageScore?: number }) {
  const safeTotal = Math.max(totalQuestions, 0);
  const ratio = safeTotal > 0 ? score / safeTotal : 0;
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const size = 220;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clampedRatio);
  const percentage = clampedRatio * 100;
  const average = Number.isFinite(averageScore) ? averageScore! : 60;
  const nearAverage = Math.abs(percentage - average) <= 5;
  const tone = nearAverage ? "yellow" : percentage > average ? "green" : "red";
  const palette = tone === "green"
    ? {
        stroke: "#22c55e",
        track: "rgba(34, 197, 94, 0.16)",
        halo: "radial-gradient(circle, rgba(34,197,94,0.34) 0%, rgba(34,197,94,0.14) 44%, rgba(255,255,255,0) 74%)",
        border: "border-green-200/80",
        shadow: "shadow-[0_18px_45px_rgba(34,197,94,0.16)]"
      }
    : tone === "yellow"
      ? {
          stroke: "#eab308",
          track: "rgba(234, 179, 8, 0.18)",
          halo: "radial-gradient(circle, rgba(250,204,21,0.36) 0%, rgba(250,204,21,0.16) 44%, rgba(255,255,255,0) 74%)",
          border: "border-yellow-200/80",
          shadow: "shadow-[0_18px_45px_rgba(250,204,21,0.16)]"
        }
      : {
          stroke: "#ef4444",
          track: "rgba(239, 68, 68, 0.18)",
          halo: "radial-gradient(circle, rgba(248,113,113,0.36) 0%, rgba(248,113,113,0.16) 44%, rgba(255,255,255,0) 74%)",
          border: "border-rose-200/80",
          shadow: "shadow-[0_18px_45px_rgba(239,68,68,0.16)]"
        };

  return (
    <div className="relative mx-auto h-[220px] w-[220px]">
      <motion.div
        className="score-ring-halo absolute inset-3 rounded-full"
        style={{ background: palette.halo }}
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={palette.track}
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={palette.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      </svg>
      <motion.div
        className={`absolute inset-7 flex flex-col items-center justify-center rounded-full border bg-white/82 px-4 text-center backdrop-blur-md ${palette.border} ${palette.shadow}`}
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.65, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.45 }}
        >
          <div className="text-5xl font-bold leading-none text-slate-800">
            {score}
            <span className="text-xl font-semibold text-slate-500"> / {safeTotal}</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function App() {
  const [session, setSessionState] = useState<Session | null>(null);
  const [location] = useLocation();

  useEffect(() => setSessionState(getSession()), []);

  if (!session) {
    return <JoinScreen onJoin={(s) => { setSession(s); setSessionState(s); }} />;
  }

  const isAdmin = session.role === "admin";
  const handleLogout = () => {
    logout();
    setSessionState(null);
  };

  if (isAdmin) {
    return (
      <div className="min-h-screen bg-hero-pattern text-slate-700 md:flex">
        <Sidebar userName={session.name} userRole="Administrator" onLogout={handleLogout} role="admin" />
        <main className="w-full p-4 pt-20 md:p-6">
          <div className="mx-auto max-w-6xl">
            <AnimatePresence mode="wait">
              <motion.div key={location} {...page} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
                <Switch>
                  <Route path="/" component={() => <Redirect to="/admin" />} />
                  <Route path="/quiz/:id" component={() => <Redirect to="/admin" />} />
                  <Route path="/result/:id" component={(p: any) => <ResultPage id={routeId(p)} />} />
                  <Route path="/history" component={() => <HistoryPage session={session} />} />
                  <Route path="/admin" component={() => <AdminHome />} />
                  <Route path="/admin/quizzes" component={() => <AdminQuizzes />} />
                  <Route path="/admin/quizzes/:id/edit" component={(p: any) => <QuestionEditor id={routeId(p)} />} />
                  <Route path="/admin/leaderboard" component={() => <AdminLeaderboard />} />
                </Switch>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hero-pattern text-slate-700 md:flex">
      <Sidebar userName={session.name} userRole="Student" onLogout={handleLogout} role="student" />
      <main className="w-full p-4 pt-20 md:p-6">
        <div className="mx-auto max-w-6xl">
          <AnimatePresence mode="wait">
            <motion.div key={location} {...page} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              <Switch>
                <Route path="/" component={() => <StudentHome />} />
                <Route path="/quiz/:id" component={(p: any) => <TakeQuiz id={routeId(p)} name={session.name} />} />
                <Route path="/result/:id" component={(p: any) => <ResultPage id={routeId(p)} />} />
                <Route path="/history" component={() => <HistoryPage session={session} />} />
                <Route path="/admin" component={() => <Redirect to="/" />} />
                <Route path="/admin/quizzes" component={() => <Redirect to="/" />} />
                <Route path="/admin/quizzes/:id/edit" component={() => <Redirect to="/" />} />
                <Route path="/admin/leaderboard" component={() => <Redirect to="/" />} />
              </Switch>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function JoinScreen({ onJoin }: { onJoin: (s: Session) => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState("");

  const submit = () => {
    if (!name.trim()) return setError("Name is required");
    if (role === "admin" && password !== "admin123") return setError("Invalid admin password");
    onJoin({ role, name: name.trim() });
  };

  return <div className="min-h-screen grid place-items-center px-4 py-10 bg-hero-pattern">
    <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-5xl rounded-[2rem] border border-blue-200/30 bg-white/92 shadow-sm backdrop-blur-sm p-6 overflow-hidden">
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <motion.div initial={{ opacity: 0, x: -26 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.45 }} className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.35 }} className="inline-flex items-center gap-2 rounded-full bg-sky-100/80 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-700">Welcome back</motion.div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold text-slate-800">Master Your Knowledge with Interactive Quizzes.</h1>
            <p className="text-slate-600 leading-relaxed">Choose your role, explore curated quizzes, and track your performance in real time..</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {["admin", "student"].map((r) => <button key={r} onClick={() => setRole(r as Role)} className={`group rounded-3xl border p-5 text-left transition duration-300 ${role === r ? "border-sky-300 bg-gradient-to-br from-sky-100/90 to-blue-50/80 shadow-md" : "border-blue-200/40 bg-white/60 hover:border-blue-300/60 hover:bg-blue-50/40"}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-lg text-slate-800">Join as {r === "admin" ? "Admin" : "Student"}</h3>
                  <p className="mt-2 text-sm text-slate-600">{r === "admin" ? "Manage quizzes and insights" : "Access published quizzes and track your scores"}</p>
                </div>
                <span className="rounded-full bg-gradient-to-r from-blue-100 to-sky-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-700">{r}</span>
              </div>
            </button>)}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2, duration: 0.45 }} className="relative rounded-[2rem] bg-gradient-to-br from-white/95 to-blue-50/70 border border-blue-200/30 p-6 shadow-sm">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
          <div className="mb-6 space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Sign in</p>
            <h2 className="text-3xl font-semibold text-slate-800">Welcome to TestNova</h2>
          </div>
          <div className="space-y-4">
            <input className="w-full rounded-3xl border border-blue-200/40 bg-white/80 px-4 py-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            {role === "admin" && <input type="password" className="w-full rounded-3xl border border-blue-200/40 bg-white/80 px-4 py-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            {error && <div className="rounded-2xl bg-rose-200/40 px-4 py-3 text-sm text-rose-700">{error}</div>}
            <button onClick={submit} className="w-full rounded-3xl bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-md transition hover:scale-[1.01]">Continue</button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  </div>;
}

function StudentHome() {
  const { data, isLoading } = useQuery({ queryKey: ["quizzes"], queryFn: () => api<Quiz[]>("/api/quizzes") });
  const published = (data ?? []).filter((q) => q.isPublished);
  return <div className="space-y-6">
    <section className="glass-card overflow-hidden border-blue-200/30 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Student dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-800">Jump into your next quiz.</h1>
          <p className="mt-3 max-w-2xl text-slate-600">Explore published challenges, keep track of your results, and stay focused on your goals.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl bg-gradient-to-br from-sky-100/70 to-blue-50/70 p-4 text-sm text-slate-700 shadow-sm border border-sky-200/40">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-600">Published</div>
            <div className="mt-2 text-3xl font-semibold text-slate-800">{published.length}</div>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-blue-100/70 to-slate-50/80 p-4 text-sm text-slate-700 shadow-sm border border-blue-200/40">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-600">Total quizzes</div>
            <div className="mt-2 text-3xl font-semibold text-slate-800">{data?.length ?? 0}</div>
          </div>
        </div>
      </div>
    </section>

    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {isLoading && [...Array(6)].map((_, i) => <div key={i} className="glass-card skeleton-shimmer h-44 animate-soft-pulse rounded-3xl p-5" />)}
      {published.map((q) => <Link key={q.id} href={`/quiz/${q.id}`}>
        <motion.div whileHover={{ y: -8, scale: 1.012 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="group hover-lift relative overflow-hidden rounded-[1.75rem] border border-blue-200/30 bg-gradient-to-br from-white/95 to-blue-50/60 p-6 shadow-sm transition hover:shadow-md hover:border-sky-300/50">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-100/70 to-transparent opacity-70" />
          <div className="relative space-y-4">
            <h3 className="text-xl font-semibold text-slate-800 group-hover:text-blue-600">{q.title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{q.description}</p>
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-slate-500">
              <span>{formatDuration(q.timeLimitSeconds)}</span>
              <span className="rounded-full bg-gradient-to-r from-sky-100 to-blue-100 px-3 py-1 text-slate-700 font-medium">Start</span>
            </div>
          </div>
        </motion.div>
      </Link>)}
    </div>
  </div>;
}

function TakeQuiz({ id, name }: { id: number; name: string }) {
  const [, nav] = useLocation();
  const { data } = useQuery({ queryKey: ["quiz", id], queryFn: () => api<Quiz & { questions: Question[] }>(`/api/quizzes/${id}`) });
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);

  useEffect(() => {
    setIdx(0);
    setAnswers({});
    setTimerStarted(false);
  }, [id]);

  useEffect(() => {
    if (!data) return;
    setRemaining(data.timeLimitSeconds);
    setTimerStarted(true);
  }, [data]);
  useEffect(() => {
    if (!timerStarted || remaining <= 0) return;
    const t = setInterval(() => setRemaining((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [remaining, timerStarted]);

  const submit = useMutation({
    mutationFn: () => api<{ id: number }>("/api/attempts", { method: "POST", body: JSON.stringify({ quizId: id, userName: name, answers, timeTakenSeconds: (data?.timeLimitSeconds ?? 0) - remaining }) }),
    onSuccess: (v) => nav(`/result/${v.id}`)
  });

  useEffect(() => {
    if (data && timerStarted && remaining <= 0 && !submit.isPending && !submit.isSuccess) submit.mutate();
  }, [remaining, data, timerStarted, submit]);

  if (!data) return <div className="glass-card skeleton-shimmer h-36 rounded-3xl animate-soft-pulse" />;
  const totalQ = data.questions.length;
  if (totalQ === 0) {
    return <div className="glass-card rounded-[2rem] border-blue-200/30 p-6 text-center text-slate-600">This quiz has no questions yet.</div>;
  }
  const safeIdx = Math.min(idx, totalQ - 1);
  const q = data.questions[safeIdx];
  const progressPct = Math.min(100, ((safeIdx + 1) / totalQ) * 100);

  return <div className="glass-card rounded-[2rem] border-blue-200/30 p-6">
    <div className="flex flex-col gap-3 border-b border-blue-200/20 pb-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="text-sm uppercase tracking-[0.3em] text-slate-500">Question {safeIdx + 1}/{totalQ}</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-800">{q.text}</h2>
      </div>
      <div className="flex items-center gap-3">
        <div className="rounded-3xl bg-gradient-to-r from-sky-100 to-blue-100 px-4 py-2 text-sm text-slate-700 border border-sky-200/40">{formatDuration(data.timeLimitSeconds)} total</div>
        <div className="rounded-full bg-gradient-to-r from-blue-100 to-sky-100 px-3 py-2 text-sm font-semibold text-slate-800 border border-blue-200/40">{formatTimer(remaining)}</div>
      </div>
    </div>
    <div className="mt-5 w-full min-w-0 h-3 overflow-hidden rounded-full bg-blue-200/30">
      <div
        className="h-full min-h-[12px] rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 transition-[width] duration-300 ease-out"
        style={{ width: `${progressPct}%` }}
      />
    </div>
    <div className="mt-6 space-y-3">
      {q.options.map((op, i) => <button key={i} className={`w-full rounded-3xl border px-4 py-4 text-left transition ${answers[String(q.id)] === i ? "border-sky-400 bg-gradient-to-r from-sky-100/90 to-blue-50/80 text-slate-800 shadow-md" : "border-blue-200/40 bg-white/70 text-slate-700 hover:border-sky-300/60 hover:bg-blue-50/40"}`} onClick={() => setAnswers((s) => ({ ...s, [String(q.id)]: i }))}><span className="font-semibold text-slate-700 mr-3">{String.fromCharCode(65 + i)}.</span>{op}</button>)}
    </div>
    <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-between">
      <button className="rounded-full border border-blue-200/40 bg-white/70 px-5 py-3 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40" disabled={safeIdx === 0} onClick={() => setIdx((s) => Math.max(0, s - 1))}>Previous</button>
      {safeIdx === totalQ - 1 ? <button className="rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01]" onClick={() => submit.mutate()}>Submit</button> : <button className="rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01]" onClick={() => setIdx((s) => Math.min(totalQ - 1, s + 1))}>Next</button>}
    </div>
  </div>;
}

function ResultPage({ id }: { id: number }) {
  const { data } = useQuery({ queryKey: ["attempt", id], queryFn: () => api<any>(`/api/attempts/${id}`) });
  const { data: quizData } = useQuery({
    queryKey: ["result-quiz", data?.quizId],
    queryFn: () => api<Quiz & { questions: Question[] }>(`/api/quizzes/${data!.quizId}`),
    enabled: !!data?.quizId
  });
  const { data: quizStat } = useQuery({
    queryKey: ["result-quiz-stat", data?.quizId],
    queryFn: () => api<any>(`/api/stats/quiz/${data!.quizId}`),
    enabled: !!data?.quizId
  });
  if (!data) return <div className="glass-card skeleton-shimmer h-40 rounded-3xl animate-soft-pulse" />;
  return <div className="space-y-6">
    <div className="glass-card rounded-[2rem] border-blue-200/30 p-8">
      <ScoreRing score={data.score} totalQuestions={data.totalQuestions} averageScore={quizStat?.avgScore} />
    </div>
    {data.review.map((r: any) => <div key={r.questionId} className="glass-card hover-lift rounded-[1.75rem] border-blue-200/30 p-5 transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-slate-800">{r.text}</div>
          <div className="mt-2 space-y-1 text-sm text-slate-600">
            <div>Your answer: <span className="font-medium text-slate-800">{attemptChosenLabel(r, data.answers, quizData?.questions.find((q) => q.id === r.questionId)?.options) ?? "No answer"}</span></div>
            <div>Correct answer: <span className="font-medium text-slate-800">{r.correctAnswer}</span></div>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm ${r.isCorrect ? "bg-emerald-200/60 text-emerald-800" : "bg-rose-200/60 text-rose-800"}`}>{r.isCorrect ? "Correct" : "Wrong"}</span>
      </div>
      {r.explanation && <div className="mt-4 text-sm leading-relaxed text-slate-600">{r.explanation}</div>}
    </div>)}
  </div>;
}

function HistoryPage({ session }: { session: Session }) {
  const [quizId, setQuizId] = useState("");
  const [name, setName] = useState(session.role === "student" ? session.name : "");
  const { data: quizzes } = useQuery({ queryKey: ["quizzes"], queryFn: () => api<Quiz[]>("/api/quizzes") });
  const { data, isLoading } = useQuery({ queryKey: ["history", quizId, name], queryFn: () => api<Attempt[]>(`/api/attempts?quizId=${quizId}&userName=${encodeURIComponent(name)}`) });

  return <div className="glass-card rounded-[2rem] border-blue-200/30 p-6 overflow-x-auto">
    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr] mb-6">
      <select className="rounded-3xl border border-blue-200/40 bg-white/80 px-4 py-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" value={quizId} onChange={(e) => setQuizId(e.target.value)}>
        <option value="">All quizzes</option>
        {quizzes?.map((q) => <option value={q.id} key={q.id}>{q.title}</option>)}
      </select>
      <input className="rounded-3xl border border-blue-200/40 bg-white/80 px-4 py-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={session.role === "student"} />
    </div>
    {isLoading ? <div className="h-32 rounded-3xl bg-blue-100/50 animate-soft-pulse" /> : <table className="w-full text-sm text-slate-700">
      <thead>
        <tr className="text-left border-b border-blue-200/30 text-slate-600">
          <th className="py-3">Name</th>
          <th>Score</th>
          <th>Status</th>
          <th>Time</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {data?.map((a) => {
          const passed = a.totalQuestions > 0 && a.score / a.totalQuestions >= 0.6;
          return <tr key={a.id} className="border-b border-blue-100/60 transition hover:bg-blue-50/30">
            <td className="py-3"><Link href={`/result/${a.id}`} className="text-blue-600 hover:text-blue-700 font-medium">{a.userName}</Link></td>
            <td>{a.score} / {a.totalQuestions}</td>
            <td><span className={`px-3 py-1 rounded-full text-xs ${passed ? "bg-emerald-200/60 text-emerald-800" : "bg-rose-200/60 text-rose-800"}`}>{passed ? "Pass" : "Fail"}</span></td>
            <td>{a.timeTakenSeconds}s</td>
            <td>{new Date(a.completedAt).toLocaleString()}</td>
          </tr>;
        })}
      </tbody>
    </table>}
  </div>;
}

function AdminHome() {
  const { data } = useQuery({ queryKey: ["overview"], queryFn: () => api<any>("/api/stats/overview") });
  const { data: lead } = useQuery({ queryKey: ["lead", ""], queryFn: () => api<Attempt[]>("/api/stats/leaderboard?limit=5") });
  const { data: quizzes } = useQuery({ queryKey: ["quizzes"], queryFn: () => api<Quiz[]>("/api/quizzes") });
  if (!data) return <div className="glass-card skeleton-shimmer h-44 rounded-3xl animate-soft-pulse" />;
  return <div className="grid lg:grid-cols-3 gap-4">
    <div className="lg:col-span-2 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        {[{k:"Total Quizzes",v:data.totalQuizzes},{k:"Total Attempts",v:data.totalAttempts},{k:"Average result",v:formatPercentage(data.averageScore ?? 0)},{k:"Participants",v:data.participants}].map((s)=> <div key={s.k} className="glass-card hover-lift rounded-[1.75rem] border-blue-200/30 p-5">
          <div className="text-sm uppercase tracking-[0.25em] text-slate-600">{s.k}</div>
          <div className="mt-3 text-3xl font-semibold text-slate-800">{s.v}</div>
        </div>)}
      </div>
      <div className="glass-card rounded-[2rem] border-blue-200/30 p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Recent Attempts</h3>
        <div className="space-y-3">
          {data.recentAttempts.map((a:any)=><div key={a.id} className="rounded-3xl border border-blue-200/30 bg-gradient-to-br from-blue-50/70 to-sky-50/70 p-4 text-sm text-slate-700">{a.userName} scored <span className="font-semibold text-slate-800">{a.score} / {a.totalQuestions}</span></div>)}
        </div>
      </div>
      <div className="glass-card rounded-[2rem] border-blue-200/30 p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Created Quizzes</h3>
        <div className="space-y-3">
          {quizzes?.length ? quizzes.map((quiz) => (
            <div key={quiz.id} className="rounded-3xl border border-blue-200/30 bg-gradient-to-br from-blue-50/70 to-sky-50/70 p-4 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-800">{quiz.title}</span>
                <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em] ${quiz.isPublished ? "bg-emerald-200/60 text-emerald-800" : "bg-slate-200/80 text-slate-700"}`}>
                  {quiz.isPublished ? "Published" : "Draft"}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{Math.round(quiz.timeLimitSeconds / 60)} min</div>
            </div>
          )) : <div className="rounded-3xl border border-blue-200/30 bg-white/70 px-4 py-3 text-sm text-slate-600">No quizzes created yet.</div>}
        </div>
      </div>
    </div>
    <aside className="glass-card rounded-[2rem] border-blue-200/30 p-5">
      <h3 className="font-semibold text-slate-800 mb-3">Top Performers</h3>
      <div className="space-y-3 text-sm text-slate-700">
        {lead?.map((a,i)=><div key={a.id} className="rounded-3xl border border-blue-200/30 bg-gradient-to-br from-blue-50/70 to-sky-50/70 p-4">#{i+1} <span className="font-semibold text-slate-800">{a.userName}</span> ({a.score} / {a.totalQuestions})</div>)}
      </div>
    </aside>
  </div>;
}

function AdminQuizzes() {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const { data, isLoading } = useQuery({ queryKey: ["quizzes"], queryFn: () => api<Quiz[]>("/api/quizzes") });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(5);
  const [openActionsFor, setOpenActionsFor] = useState<number | null>(null);
  const [addQuestionQuiz, setAddQuestionQuiz] = useState<Quiz | null>(null);
  const [editQuestionQuiz, setEditQuestionQuiz] = useState<Quiz | null>(null);
  const [activeEditQuestionId, setActiveEditQuestionId] = useState<number | null>(null);
  const [questionForm, setQuestionForm] = useState({ text: "", options: ["Option A", "Option B"], correctIndex: 0, explanation: "", orderIndex: 0 });
  const [editQuestionForm, setEditQuestionForm] = useState({ text: "", options: ["Option A", "Option B"], correctIndex: 0, explanation: "", orderIndex: 0 });
  const create = useMutation({
    mutationFn: () => api<Quiz>("/api/quizzes", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        timeLimitSeconds: Math.max(1, timeLimitMinutes) * 60
      })
    }),
    onSuccess: (created) => {
      setTitle("");
      setDescription("");
      setTimeLimitMinutes(5);
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      nav(`/admin/quizzes/${created.id}/edit#add-question`);
    }
  });
  const update = useMutation({ mutationFn: ({ id, patch }: any) => api(`/api/quizzes/${id}`, { method: "PUT", body: JSON.stringify(patch) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["quizzes"] }) });
  const del = useMutation({ mutationFn: (id:number) => api(`/api/quizzes/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["quizzes"] }) });
  const addQuestion = useMutation({
    mutationFn: () => {
      if (!addQuestionQuiz) throw new Error("No quiz selected");
      return api(`/api/quizzes/${addQuestionQuiz.id}/questions`, { method: "POST", body: JSON.stringify(questionForm) });
    },
    onSuccess: () => {
      if (addQuestionQuiz) qc.invalidateQueries({ queryKey: ["quiz", addQuestionQuiz.id] });
      setQuestionForm({ text: "", options: ["Option A", "Option B"], correctIndex: 0, explanation: "", orderIndex: 0 });
      setAddQuestionQuiz(null);
    }
  });
  const { data: editQuizData, isLoading: isLoadingEditQuiz } = useQuery({
    queryKey: ["quiz", editQuestionQuiz?.id],
    queryFn: () => api<Quiz & { questions: Question[] }>(`/api/quizzes/${editQuestionQuiz!.id}`),
    enabled: !!editQuestionQuiz
  });
  const saveEditedQuestion = useMutation({
    mutationFn: () => {
      if (!activeEditQuestionId) throw new Error("No question selected");
      return api(`/api/questions/${activeEditQuestionId}`, { method: "PUT", body: JSON.stringify(editQuestionForm) });
    },
    onSuccess: () => {
      if (editQuestionQuiz) qc.invalidateQueries({ queryKey: ["quiz", editQuestionQuiz.id] });
    }
  });
  const deleteEditedQuestion = useMutation({
    mutationFn: (questionId: number) => api(`/api/questions/${questionId}`, { method: "DELETE" }),
    onSuccess: () => {
      if (editQuestionQuiz) qc.invalidateQueries({ queryKey: ["quiz", editQuestionQuiz.id] });
      setActiveEditQuestionId(null);
    }
  });
  const canCreate = title.trim().length >= 2 && description.trim().length >= 2 && timeLimitMinutes >= 1;
  const canSaveQuestion = questionForm.text.trim().length >= 2 && questionForm.options.filter((option) => option.trim()).length >= 2 && questionForm.correctIndex < questionForm.options.length;
  const canSaveEditedQuestion = editQuestionForm.text.trim().length >= 2 && editQuestionForm.options.filter((option) => option.trim()).length >= 2 && editQuestionForm.correctIndex < editQuestionForm.options.length;

  useEffect(() => {
    if (!editQuizData?.questions?.length) {
      setActiveEditQuestionId(null);
      return;
    }

    const selectedQuestion =
      editQuizData.questions.find((question) => question.id === activeEditQuestionId) ??
      editQuizData.questions[0];

    setActiveEditQuestionId(selectedQuestion.id);
    setEditQuestionForm({
      text: selectedQuestion.text,
      options: [...selectedQuestion.options],
      correctIndex: selectedQuestion.correctIndex,
      explanation: selectedQuestion.explanation,
      orderIndex: selectedQuestion.orderIndex
    });
  }, [editQuizData, activeEditQuestionId]);

  return <div className="space-y-5">
    {addQuestionQuiz && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm" onClick={() => !addQuestion.isPending && setAddQuestionQuiz(null)}>
      <div className="glass-card w-full max-w-2xl rounded-[2rem] border-blue-200/30 p-6 shadow-[0_24px_70px_rgba(56,139,196,0.22)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.24em] text-slate-500">Add Question</div>
            <h3 className="mt-2 text-2xl font-semibold text-slate-800">{addQuestionQuiz.title}</h3>
            <p className="mt-1 text-sm text-slate-600">Create a new question in a floating editor without leaving the page.</p>
          </div>
          <button className="rounded-full border border-blue-200/40 bg-white/80 px-4 py-2 text-sm text-slate-600 transition hover:border-sky-300/60 hover:bg-blue-50/40" onClick={() => setAddQuestionQuiz(null)} disabled={addQuestion.isPending}>Done</button>
        </div>
        <div className="space-y-3">
          <textarea className="w-full rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Question text" value={questionForm.text} onChange={(e)=>setQuestionForm({...questionForm,text:e.target.value})} />
          {questionForm.options.map((op,i)=><div key={i} className="flex gap-2"><button className={`h-11 w-11 rounded-2xl border text-sm font-semibold transition ${questionForm.correctIndex===i?"border-blue-500 bg-blue-500 text-white shadow-md":"border-blue-200/40 bg-white/80 text-slate-700 hover:border-sky-300/60 hover:bg-blue-50/40"}`} onClick={()=>setQuestionForm({...questionForm,correctIndex:i})}>{String.fromCharCode(65+i)}</button><input className="flex-1 rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" value={op} onChange={(e)=>setQuestionForm({...questionForm,options:questionForm.options.map((x,idx)=>idx===i?e.target.value:x)})} /></div>)}
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-blue-200/40 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40" onClick={()=>questionForm.options.length<6 && setQuestionForm({...questionForm,options:[...questionForm.options,`Option ${String.fromCharCode(65 + questionForm.options.length)}`]})}>Add option</button>
            <button className="rounded-full border border-blue-200/40 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50" onClick={()=>questionForm.options.length>2 && setQuestionForm({...questionForm,options:questionForm.options.slice(0,-1), correctIndex: Math.min(questionForm.correctIndex, questionForm.options.length - 2)})} disabled={questionForm.options.length <= 2}>Remove option</button>
          </div>
          <input className="w-full rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Explanation (optional)" value={questionForm.explanation} onChange={(e)=>setQuestionForm({...questionForm, explanation:e.target.value})} />
          {addQuestion.isError && <div className="rounded-2xl bg-rose-200/40 px-4 py-3 text-sm text-rose-700">{(addQuestion.error as Error).message}</div>}
          <div className="flex justify-end">
            <button className="rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60" disabled={!canSaveQuestion || addQuestion.isPending} onClick={()=>addQuestion.mutate()}>{addQuestion.isPending ? "Saving..." : "Save Question"}</button>
          </div>
        </div>
      </div>
    </div>}
    {editQuestionQuiz && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm" onClick={() => !saveEditedQuestion.isPending && !deleteEditedQuestion.isPending && setEditQuestionQuiz(null)}>
      <div className="glass-card w-full max-w-5xl rounded-[2rem] border-blue-200/30 p-6 shadow-[0_24px_70px_rgba(56,139,196,0.22)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.24em] text-slate-500">Edit Questions</div>
            <h3 className="mt-2 text-2xl font-semibold text-slate-800">{editQuestionQuiz.title}</h3>
            <p className="mt-1 text-sm text-slate-600">Select an existing question, then update its content from this floating editor.</p>
          </div>
          <button className="rounded-full border border-blue-200/40 bg-white/80 px-4 py-2 text-sm text-slate-600 transition hover:border-sky-300/60 hover:bg-blue-50/40" onClick={() => setEditQuestionQuiz(null)} disabled={saveEditedQuestion.isPending || deleteEditedQuestion.isPending}>Done</button>
        </div>
        {isLoadingEditQuiz ? <div className="glass-card skeleton-shimmer h-48 rounded-[1.75rem] animate-soft-pulse" /> : <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-[1.5rem] border border-blue-200/30 bg-gradient-to-br from-white/95 to-blue-50/60 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-800">Added Questions</div>
            <div className="space-y-2">
              {editQuizData?.questions.length ? editQuizData.questions.map((question, index) => <button key={question.id} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${activeEditQuestionId === question.id ? "border-sky-300/70 bg-sky-50 text-slate-800 shadow-sm" : "border-blue-200/30 bg-white/80 text-slate-600 hover:border-sky-300/60 hover:bg-blue-50/40"}`} onClick={() => {
                setActiveEditQuestionId(question.id);
                setEditQuestionForm({
                  text: question.text,
                  options: [...question.options],
                  correctIndex: question.correctIndex,
                  explanation: question.explanation,
                  orderIndex: question.orderIndex
                });
              }}>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Question {index + 1}</div>
                <div className="mt-1 line-clamp-2 text-sm font-medium">{question.text}</div>
              </button>) : <div className="rounded-2xl border border-blue-200/30 bg-white/80 px-4 py-5 text-sm text-slate-500">No questions added yet.</div>}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-blue-200/30 bg-gradient-to-br from-white/95 to-blue-50/60 p-4">
            {activeEditQuestionId ? <>
              <div className="mb-4 text-sm font-semibold text-slate-800">Question Editor</div>
              <div className="space-y-3">
                <textarea className="w-full rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Question text" value={editQuestionForm.text} onChange={(e)=>setEditQuestionForm({...editQuestionForm,text:e.target.value})} />
                {editQuestionForm.options.map((op,i)=><div key={i} className="flex gap-2"><button className={`h-11 w-11 rounded-2xl border text-sm font-semibold transition ${editQuestionForm.correctIndex===i?"border-blue-500 bg-blue-500 text-white shadow-md":"border-blue-200/40 bg-white/80 text-slate-700 hover:border-sky-300/60 hover:bg-blue-50/40"}`} onClick={()=>setEditQuestionForm({...editQuestionForm,correctIndex:i})}>{String.fromCharCode(65+i)}</button><input className="flex-1 rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" value={op} onChange={(e)=>setEditQuestionForm({...editQuestionForm,options:editQuestionForm.options.map((x,idx)=>idx===i?e.target.value:x)})} /></div>)}
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-full border border-blue-200/40 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40" onClick={()=>editQuestionForm.options.length<6 && setEditQuestionForm({...editQuestionForm,options:[...editQuestionForm.options,`Option ${String.fromCharCode(65 + editQuestionForm.options.length)}`]})}>Add option</button>
                  <button className="rounded-full border border-blue-200/40 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50" onClick={()=>editQuestionForm.options.length>2 && setEditQuestionForm({...editQuestionForm,options:editQuestionForm.options.slice(0,-1), correctIndex: Math.min(editQuestionForm.correctIndex, editQuestionForm.options.length - 2)})} disabled={editQuestionForm.options.length <= 2}>Remove option</button>
                </div>
                <input className="w-full rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Explanation (optional)" value={editQuestionForm.explanation} onChange={(e)=>setEditQuestionForm({...editQuestionForm, explanation:e.target.value})} />
                {(saveEditedQuestion.isError || deleteEditedQuestion.isError) && <div className="rounded-2xl bg-rose-200/40 px-4 py-3 text-sm text-rose-700">{((saveEditedQuestion.error || deleteEditedQuestion.error) as Error).message}</div>}
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="rounded-full bg-rose-400/90 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60" disabled={deleteEditedQuestion.isPending || saveEditedQuestion.isPending} onClick={()=>deleteEditedQuestion.mutate(activeEditQuestionId)}>{deleteEditedQuestion.isPending ? "Deleting..." : "Delete Question"}</button>
                  <button className="rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60" disabled={!canSaveEditedQuestion || saveEditedQuestion.isPending || deleteEditedQuestion.isPending} onClick={()=>saveEditedQuestion.mutate()}>{saveEditedQuestion.isPending ? "Saving..." : "Save Changes"}</button>
                </div>
              </div>
            </> : <div className="rounded-2xl border border-blue-200/30 bg-white/80 px-4 py-10 text-center text-sm text-slate-500">Select a question from the left to edit it here.</div>}
          </div>
        </div>}
      </div>
    </div>}
    <div className="glass-card rounded-[2rem] border-blue-200/30 p-6">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_130px_auto]">
        <input className="rounded-3xl border border-blue-200/40 bg-white/80 px-4 py-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Quiz name" value={title} onChange={(e)=>setTitle(e.target.value)} />
        <input className="rounded-3xl border border-blue-200/40 bg-white/80 px-4 py-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Description" value={description} onChange={(e)=>setDescription(e.target.value)} />
        <input className="rounded-3xl border border-blue-200/40 bg-white/80 px-4 py-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" type="number" min={1} placeholder="Minutes" value={timeLimitMinutes} onChange={(e)=>setTimeLimitMinutes(Number(e.target.value))} />
        <button className="rounded-3xl bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60" disabled={!canCreate || create.isPending} onClick={()=>create.mutate()}>{create.isPending ? "Creating..." : "Create Quiz"}</button>
      </div>
      {create.isError && <div className="mt-4 rounded-3xl bg-rose-200/40 px-4 py-3 text-sm text-rose-700">{create.error.message}</div>}
    </div>
    <div className="glass-card rounded-[2rem] border-blue-200/30 p-6">
      {isLoading ? <div className="h-32 rounded-3xl bg-blue-100/50 animate-soft-pulse" /> : data?.map((q)=><div key={q.id} className="group flex flex-col gap-4 border-b border-blue-200/20 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-800">{q.title}</div>
          <div className="text-sm text-slate-600">{q.description}</div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mt-2">{Math.round(q.timeLimitSeconds / 60)} min</div>
          {(q.startAt || q.endAt) && <div className="mt-2 text-xs text-slate-500">Start: {formatDateTime(q.startAt)} | End: {formatDateTime(q.endAt)}</div>}
        </div>
        <div className="relative flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={q.isPublished} onChange={(e)=>update.mutate({id:q.id, patch:{isPublished:e.target.checked}})} className="h-4 w-4 rounded border-blue-300 bg-blue-50 text-blue-600" /> Published</label>
          <button className="rounded-full border border-blue-200/40 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40" onClick={() => setOpenActionsFor((current) => current === q.id ? null : q.id)}>Questions</button>
          {openActionsFor === q.id && <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-[1.5rem] border border-blue-200/40 bg-white/95 p-4 shadow-[0_18px_45px_rgba(56,139,196,0.18)] backdrop-blur-xl">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-800">Question Actions</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-500">Choose whether you want to add a new question or edit existing ones for this quiz.</div>
            </div>
            <div className="space-y-2">
              <button className="w-full rounded-2xl border border-blue-200/40 bg-gradient-to-r from-sky-50 to-blue-50 px-4 py-3 text-left transition hover:border-sky-300/60 hover:shadow-sm" onClick={() => { setOpenActionsFor(null); setQuestionForm({ text: "", options: ["Option A", "Option B"], correctIndex: 0, explanation: "", orderIndex: 0 }); setAddQuestionQuiz(q); }}>
                <div className="text-sm font-semibold text-slate-800">Add Question</div>
                <div className="mt-1 text-xs text-slate-500">Open a floating form to create a new question instantly.</div>
              </button>
              <button className="w-full rounded-2xl border border-blue-200/40 bg-gradient-to-r from-white to-slate-50 px-4 py-3 text-left transition hover:border-sky-300/60 hover:shadow-sm" onClick={() => { setOpenActionsFor(null); setActiveEditQuestionId(null); setEditQuestionQuiz(q); }}>
                <div className="text-sm font-semibold text-slate-800">Edit Questions</div>
                <div className="mt-1 text-xs text-slate-500">Open a floating editor that lists all added questions for this quiz.</div>
              </button>
            </div>
          </div>}
          <button className="rounded-full bg-rose-400/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500" onClick={()=>confirm("Delete this quiz?") && del.mutate(q.id)}>Delete</button>
        </div>
      </div>)}
    </div>
  </div>;
}

function QuestionEditor({ id }: { id: number }) {
  const qc = useQueryClient();
  const { data, error, isError } = useQuery({ queryKey: ["quiz", id], queryFn: () => api<Quiz & { questions: Question[] }>(`/api/quizzes/${id}`), enabled: Number.isFinite(id) });
  const [form, setForm] = useState({ text: "", options: ["Option A", "Option B"], correctIndex: 0, explanation: "", orderIndex: 0 });
  const [bulkText, setBulkText] = useState("");
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const save = useMutation({ mutationFn: () => api(`/api/quizzes/${id}/questions`, { method: "POST", body: JSON.stringify(form) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["quiz", id] }); setForm({ text: "", options: ["Option A", "Option B"], correctIndex: 0, explanation: "", orderIndex: data?.questions.length ?? 0 }); } });
  const patch = useMutation({ mutationFn: ({qid, body}:{qid:number; body:any}) => api(`/api/questions/${qid}`, { method: "PUT", body: JSON.stringify(body) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz", id] }) });
  const del = useMutation({ mutationFn: (qid:number) => api(`/api/questions/${qid}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz", id] }) });
  const bulkSave = useMutation({
    mutationFn: async () => {
      const blocks = bulkText
        .split(/\n\s*\n/g)
        .map((block) => block.trim())
        .filter(Boolean);

      if (!blocks.length) {
        throw new Error("Paste at least one question block.");
      }

      const parsed = blocks.map((block, index) => {
        const lines = block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const questionLine =
          lines.find((line) => /^question\s*:/i.test(line)) ??
          lines.find((line) => /^\d+[\).]\s+/.test(line)) ??
          lines[0];
        const question = questionLine
          .replace(/^question\s*:\s*/i, "")
          .replace(/^\d+[\).]\s+/, "")
          .trim();

        const options = lines
          .filter((line) => /^[A-D][\).:]\s+/i.test(line))
          .map((line) => line.replace(/^[A-D][\).:]\s+/i, "").trim());

        const answerLine = lines.find((line) => /^answer\s*:/i.test(line));
        const answerRaw = answerLine?.replace(/^answer\s*:\s*/i, "").trim().toUpperCase() ?? "A";
        const answerChar = /^[A-D]$/.test(answerRaw) ? answerRaw : "A";
        const correctIndex = answerChar.charCodeAt(0) - 65;

        const explanationLine = lines.find((line) => /^explanation\s*:/i.test(line));
        const explanation = explanationLine?.replace(/^explanation\s*:\s*/i, "").trim() ?? "";

        if (!question || options.length < 2) {
          throw new Error(`Block ${index + 1} is invalid. Add a question and at least 2 options.`);
        }
        if (correctIndex >= options.length) {
          throw new Error(`Block ${index + 1} has an answer outside option range.`);
        }

        return {
          text: question,
          options,
          correctIndex,
          explanation,
          orderIndex: (data?.questions.length ?? 0) + index
        };
      });

      await Promise.all(
        parsed.map((payload) =>
          api(`/api/quizzes/${id}/questions`, {
            method: "POST",
            body: JSON.stringify(payload)
          })
        )
      );

      return parsed.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["quiz", id] });
      setBulkText("");
      setBulkStatus(`Imported ${count} questions successfully.`);
    }
  });

  useEffect(() => {
    if (data) {
      setForm(prev => ({ ...prev, orderIndex: data.questions.length }));
    }
  }, [data]);

  useEffect(() => {
    setForm(prev => ({ ...prev, correctIndex: Math.min(prev.correctIndex, prev.options.length - 1) }));
  }, [form.options]);

  if (!Number.isFinite(id)) return <div className="glass-card rounded-[1.5rem] border-rose-200/50 p-4 text-rose-700">Invalid quiz link. Go back to Manage Quizzes and open the question editor again.</div>;
  if (isError) return <div className="glass-card rounded-[1.5rem] border-rose-200/50 p-4 text-rose-700">Could not load this quiz. {error.message}</div>;
  if (!data) return <div className="glass-card skeleton-shimmer h-32 rounded-[1.75rem] animate-soft-pulse" />;
  return <div className="space-y-4">
    <div id="add-question" className="glass-card rounded-[2rem] border-blue-200/30 p-6 scroll-mt-24">
      <h3 className="mb-4 text-xl font-semibold text-slate-800">Add Question</h3>
      <textarea className="mb-3 w-full rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Question text" value={form.text} onChange={(e)=>setForm({...form,text:e.target.value})} />
      {form.options.map((op,i)=><div key={i} className="mb-3 flex gap-2"><button className={`h-11 w-11 rounded-2xl border text-sm font-semibold transition ${form.correctIndex===i?"border-blue-500 bg-blue-500 text-white shadow-md":"border-blue-200/40 bg-white/80 text-slate-700 hover:border-sky-300/60 hover:bg-blue-50/40"}`} onClick={()=>setForm({...form,correctIndex:i})}>{String.fromCharCode(65+i)}</button><input className="flex-1 rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" value={op} onChange={(e)=>setForm({...form,options:form.options.map((x,idx)=>idx===i?e.target.value:x)})} /></div>)}
      <div className="mb-3 flex gap-2"><button className="rounded-full border border-blue-200/40 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40" onClick={()=>form.options.length<6 && setForm({...form,options:[...form.options,`Option ${String.fromCharCode(65 + form.options.length)}`]}) }>Add option</button><button className="rounded-full border border-blue-200/40 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50" onClick={()=>form.options.length>2 && setForm({...form,options:form.options.slice(0,-1), correctIndex: Math.min(form.correctIndex, form.options.length - 2)})} disabled={form.options.length <= 2}>Remove option</button></div>
      <input className="mb-4 w-full rounded-3xl border border-blue-200/40 bg-white/80 p-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Explanation (optional)" value={form.explanation} onChange={(e)=>setForm({...form, explanation:e.target.value})} />
      <button className="rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60" disabled={save.isPending || !form.text.trim() || form.options.filter(o => o.trim()).length < 2 || form.correctIndex >= form.options.length} onClick={()=>save.mutate()}>{save.isPending ? "Saving..." : "Save Question"}</button>
    </div>
    <div className="glass-card rounded-[2rem] border-blue-200/30 p-6">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-slate-800">Bulk Paste Questions</h3>
        <p className="mt-1 text-sm text-slate-600">Paste multiple question blocks separated by one empty line.</p>
      </div>
      <textarea
        className="min-h-[220px] w-full rounded-3xl border border-blue-200/40 bg-white/80 p-4 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
        placeholder={`Question: What is polymorphism?
A) Method overloading and overriding
B) Data hiding
C) Pointer arithmetic
D) File handling
Answer: A
Explanation: Polymorphism allows one interface with multiple implementations.

Question: Which keyword is used for inheritance in Java?
A) this
B) extends
C) implement
D) inherit
Answer: B
Explanation: Java classes inherit using the extends keyword.`}
        value={bulkText}
        onChange={(e) => {
          setBulkText(e.target.value);
          setBulkStatus("");
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={bulkSave.isPending || !bulkText.trim()}
          onClick={() => bulkSave.mutate()}
        >
          {bulkSave.isPending ? "Importing..." : "Import Questions"}
        </button>
        {bulkSave.isError && <span className="text-sm text-rose-700">{(bulkSave.error as Error).message}</span>}
        {!bulkSave.isError && bulkStatus && <span className="text-sm text-emerald-700">{bulkStatus}</span>}
      </div>
    </div>
    <div id="edit-questions" className="glass-card rounded-[2rem] border-blue-200/30 p-6 scroll-mt-24">
      {data.questions.map((q)=><div key={q.id} className="hover-lift mb-3 rounded-[1.5rem] border border-blue-200/30 bg-gradient-to-br from-white/95 to-blue-50/60 p-4 last:mb-0">
        <div className="font-medium text-slate-800">{q.text}</div>
        <div className="mt-1 text-sm text-slate-600">Correct: {String.fromCharCode(65 + q.correctIndex)}</div>
        <div className="mt-3 flex gap-2"><button className="rounded-full border border-blue-200/40 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300/60 hover:bg-blue-50/40" onClick={()=>patch.mutate({qid:q.id, body:{text:prompt("Edit question", q.text) || q.text}})}>Edit</button><button className="rounded-full bg-rose-400/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500" onClick={()=>del.mutate(q.id)}>Delete</button></div>
      </div>)}
    </div>
  </div>;
}

function AdminLeaderboard() {
  const [quizId, setQuizId] = useState("");
  const { data: quizzes } = useQuery({ queryKey: ["quizzes"], queryFn: () => api<Quiz[]>("/api/quizzes") });
  const { data } = useQuery({ queryKey: ["leader", quizId], queryFn: () => api<Attempt[]>(`/api/stats/leaderboard?quizId=${quizId}&limit=50`) });
  const { data: stat } = useQuery({ queryKey: ["quiz-stat", quizId], queryFn: () => quizId ? api<any>(`/api/stats/quiz/${quizId}`) : Promise.resolve(null) });
  return <div className="space-y-4">
    <div className="glass-card rounded-[2rem] border-blue-200/30 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.28em] text-slate-500">Leaderboard</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-800">Compare top quiz performances</h2>
        </div>
        <select className="rounded-3xl border border-blue-200/40 bg-white/80 px-4 py-3 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white" value={quizId} onChange={(e)=>setQuizId(e.target.value)}>
          <option value="">All quizzes</option>
          {quizzes?.map((q)=><option key={q.id} value={q.id}>{q.title}</option>)}
        </select>
      </div>
    </div>
    {quizId && stat && <div className="grid gap-3 md:grid-cols-4">
      <div className="glass-card hover-lift rounded-[1.5rem] border-blue-200/30 p-4 text-sm text-slate-700"><div className="text-xs uppercase tracking-[0.24em] text-slate-500">Attempts</div><div className="mt-2 text-2xl font-semibold text-slate-800">{stat.attempts}</div></div>
      <div className="glass-card hover-lift rounded-[1.5rem] border-blue-200/30 p-4 text-sm text-slate-700"><div className="text-xs uppercase tracking-[0.24em] text-slate-500">Passed attempts</div><div className="mt-2 text-2xl font-semibold text-slate-800">{stat.passedAttempts}</div><div className="mt-1 text-xs text-slate-500">Total quiz attempts that passed</div></div>
      <div className="glass-card hover-lift rounded-[1.5rem] border-blue-200/30 p-4 text-sm text-slate-700"><div className="text-xs uppercase tracking-[0.24em] text-slate-500">Average</div><div className="mt-2 text-2xl font-semibold text-slate-800">{Math.round(stat.avgScore)}%</div></div>
      <div className="glass-card hover-lift rounded-[1.5rem] border-blue-200/30 p-4 text-sm text-slate-700"><div className="text-xs uppercase tracking-[0.24em] text-slate-500">Avg time</div><div className="mt-2 text-2xl font-semibold text-slate-800">{Math.round(stat.averageTimeTaken)}s</div></div>
    </div>}
    <div className="glass-card rounded-[2rem] border-blue-200/30 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800">Rankings</h3>
        <div className="rounded-full bg-gradient-to-r from-sky-100 to-blue-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-700">{data?.length ?? 0} entries</div>
      </div>
      <div className="space-y-3">{data?.map((a,i)=>{ const r = a.totalQuestions > 0 ? a.score / a.totalQuestions : 0; const barWidth = Math.min(100, r * 100); return <div key={a.id} className="hover-lift rounded-[1.5rem] border border-blue-200/30 bg-gradient-to-br from-white/95 to-blue-50/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="w-14 text-sm font-semibold text-slate-500">#{i+1}</div>
          <div className="min-w-0 md:w-40">
            <div className="truncate font-semibold text-slate-800">{a.userName}</div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{a.score} / {a.totalQuestions}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-7 w-full overflow-hidden rounded-full bg-blue-100/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 transition-[width] duration-500 ease-out"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
          <div className="md:w-28 shrink-0 text-right text-lg font-semibold text-slate-800">{a.score} / {a.totalQuestions}</div>
        </div>
      </div>;})}</div>
    </div>
  </div>;
}


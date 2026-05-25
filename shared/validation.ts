import { z } from "zod";

export const quizInputSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  timeLimitSeconds: z.number().int().min(30),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable()
});

export const questionInputSchema = z.object({
  text: z.string().min(2),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional().default(""),
  orderIndex: z.number().int().min(0)
});

export const attemptInputSchema = z.object({
  quizId: z.number().int().positive(),
  userName: z.string().min(1),
  answers: z.record(z.string(), z.number().int().min(0)),
  timeTakenSeconds: z.number().int().min(0)
});

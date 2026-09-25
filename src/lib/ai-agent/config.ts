import { z } from "zod";

const lines = z.array(z.string().trim().min(1).max(500)).max(30).default([]);
export const knowledgeSchema = z
  .object({
    company: z.string().trim().max(200).default(""),
    service: z.string().trim().max(500).default(""),
    buys: lines,
    doesNotBuy: lines,
    regions: lines,
    hours: lines,
    documents: lines,
    rules: lines,
    forbiddenPromises: lines,
    allowedFacts: lines,
    escalation: lines,
    faq: z
      .array(
        z
          .object({
            question: z.string().trim().min(3).max(200),
            answer: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(30)
      .default([]),
  })
  .strict();
export type AiKnowledge = z.infer<typeof knowledgeSchema>;
export const EMPTY_KNOWLEDGE = knowledgeSchema.parse({});
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleSchema = z
  .object({
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: time,
    end: time,
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, "Fuso horário inválido."),
    offHoursMessage: z.string().trim().max(500),
  })
  .strict()
  .refine(
    (s) => s.start !== s.end,
    "Defina horários de início e fim diferentes.",
  );
export type AiSchedule = z.infer<typeof scheduleSchema>;
export const DEFAULT_SCHEDULE: AiSchedule = {
  weekdays: [1, 2, 3, 4, 5],
  start: "09:00",
  end: "18:00",
  timezone: "America/Sao_Paulo",
  offHoursMessage:
    "Recebi sua mensagem. Nosso atendimento está fora do horário agora; a equipe retorna no próximo período de atendimento.",
};

/** Closed-period key is the most recent closing boundary, including weekends. */
export function businessHours(
  alwaysOn: boolean,
  schedule: AiSchedule,
  now = new Date(),
) {
  if (alwaysOn) return { open: true, period: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: schedule.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${p.year}-${p.month}-${p.day}T00:00:00Z`);
  const minute = Number(p.hour) * 60 + Number(p.minute);
  const minutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const start = minutes(schedule.start),
    end = minutes(schedule.end),
    overnight = start > end;
  const day = date.getUTCDay(),
    yesterday = (day + 6) % 7;
  const open = overnight
    ? (schedule.weekdays.includes(day) && minute >= start) ||
      (schedule.weekdays.includes(yesterday) && minute < end)
    : schedule.weekdays.includes(day) && minute >= start && minute < end;
  if (open) return { open, period: "" };
  for (let i = 0; i < 8; i++) {
    const closeDate = new Date(date.getTime() - i * 86400000);
    const openingDay = (closeDate.getUTCDay() + (overnight ? 6 : 0)) % 7;
    if (schedule.weekdays.includes(openingDay) && (i > 0 || minute >= end)) {
      return {
        open,
        period: `${closeDate.toISOString().slice(0, 10)}T${schedule.end}@${schedule.timezone}`,
      };
    }
  }
  return { open: false, period: "invalid-schedule" };
}

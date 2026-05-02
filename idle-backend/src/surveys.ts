import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const surveyCurrencySchema = z.enum(["idle", "real", "gem"]);

const surveyOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1)
});

const surveyDefinitionRawSchema = z.object({
  id: z.string().min(1),
  active: z.boolean().optional(),
  isActive: z.boolean().optional(),
  currencyType: surveyCurrencySchema,
  reward: z.number().int().positive(),
  title: z.string().min(1),
  options: z.array(surveyOptionSchema).min(1)
});

const surveyDefinitionSchema = surveyDefinitionRawSchema.superRefine((val, ctx) => {
  if (val.active === undefined && val.isActive === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Each survey must include \"active\" (or legacy \"isActive\") as a boolean",
      path: ["active"]
    });
  }
}).transform((raw) => ({
  id: raw.id,
  active: raw.active ?? raw.isActive!,
  currencyType: raw.currencyType,
  reward: raw.reward,
  title: raw.title,
  options: raw.options
}));

const surveysFileSchema = z.object({
  surveys: z.array(surveyDefinitionSchema)
});

export type SurveyCurrencyType = z.infer<typeof surveyCurrencySchema>;
export type SurveyOption = z.infer<typeof surveyOptionSchema>;
export type Survey = z.infer<typeof surveyDefinitionSchema>;

function ensureUniqueOptionIds(survey: Survey): void {
  const seen = new Set<string>();
  for (const opt of survey.options) {
    if (seen.has(opt.id)) {
      throw new Error(`Survey ${survey.id}: duplicate option id "${opt.id}"`);
    }
    seen.add(opt.id);
  }
}

function loadSurveysFromDisk(): readonly Survey[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  const path = join(dir, "../data/surveys.json");
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const data = surveysFileSchema.parse(parsed);
  for (const survey of data.surveys) {
    ensureUniqueOptionIds(survey);
  }
  const frozen: Survey[] = data.surveys.map((s) => ({
    ...s,
    options: s.options.map((o) => ({ ...o }))
  }));
  return Object.freeze(frozen);
}

const SURVEYS: readonly Survey[] = loadSurveysFromDisk();

export function getAllSurveys(): readonly Survey[] {
  return SURVEYS;
}

export function getSurveyById(id: string): Survey | undefined {
  return SURVEYS.find((s) => s.id === id);
}

export function getActiveSurveysInOrder(): Survey[] {
  return SURVEYS.filter((s) => s.active);
}

export function pickFirstUncompletedActiveSurvey(answeredSurveyIds: ReadonlySet<string>): Survey | null {
  for (const s of getActiveSurveysInOrder()) {
    if (!answeredSurveyIds.has(s.id)) {
      return s;
    }
  }
  return null;
}

"use server";

import {
  questions,
  resultSections,
  conclusionRules,
  type Answers,
  type AssessmentFaq,
} from "@/lib/data/company-setup-check";

export interface ClientOption {
  label: string;
  value: string;
  disabled: boolean;
  disableMsg?: string;
}

export interface ClientQuestion {
  id: string;
  title: string;
  subtitle?: string;
  options: ClientOption[];
  faq: AssessmentFaq[];
}

export interface QuestionPayload {
  question: ClientQuestion;
  totalSteps: number;
}

export interface ResultItem {
  text: string;
  qa?: { q: string; a: string };
}

export interface ResultSectionPayload {
  title: string;
  emoji: string;
  items: ResultItem[];
}

export interface AnswerSummaryItem {
  question: string;
  answer: string;
}

export interface ResultPayload {
  conclusion: string[];
  summary: AnswerSummaryItem[];
  sections: ResultSectionPayload[];
}

/** Consolidated response for step advancement. */
export type AdvanceResult =
  | { done: false; nextStepIndex: number; payload: QuestionPayload }
  | { done: true };

// Build a Map once for O(1) question lookups
const questionMap = new Map(questions.map((q) => [q.id, q]));

function getApplicableSequence(answers: Answers): string[] {
  return questions
    .filter((q) => !q.condition || q.condition(answers))
    .map((q) => q.id);
}

function buildQuestionPayload(
  qId: string,
  answers: Answers,
  totalSteps: number,
): QuestionPayload | null {
  const q = questionMap.get(qId);
  if (!q) return null;

  return {
    question: {
      id: q.id,
      title: q.title,
      subtitle: q.subtitle,
      options: q.options.map((opt) => ({
        label: opt.label,
        value: opt.value,
        disabled: opt.disableWhen ? opt.disableWhen(answers) : false,
        disableMsg: opt.disableMsg,
      })),
      faq: q.faq,
    },
    totalSteps,
  };
}

/**
 * Get a single question by step index.
 */
export async function getQuestion(
  stepIndex: number,
  answers: Answers,
): Promise<QuestionPayload | null> {
  const sequence = getApplicableSequence(answers);
  if (stepIndex < 0 || stepIndex >= sequence.length) return null;
  return buildQuestionPayload(sequence[stepIndex], answers, sequence.length);
}

/**
 * Advance from the current step: compute the next applicable step and return
 * its question in a single call (eliminates the N+1 pattern).
 */
export async function advanceStep(
  currentStepIndex: number,
  answers: Answers,
): Promise<AdvanceResult> {
  const sequence = getApplicableSequence(answers);
  const next = currentStepIndex + 1;

  if (next >= sequence.length) return { done: true };

  const payload = buildQuestionPayload(sequence[next], answers, sequence.length);
  if (!payload) return { done: true };

  return { done: false, nextStepIndex: next, payload };
}

/**
 * Evaluate all result rules against the final answers and return the report.
 */
export async function getResults(answers: Answers): Promise<ResultPayload> {
  const sequence = getApplicableSequence(answers);

  const summary: AnswerSummaryItem[] = [];
  for (const qId of sequence) {
    const q = questionMap.get(qId);
    if (!q || !answers[qId]) continue;
    const opt = q.options.find((o) => o.value === answers[qId]);
    summary.push({
      question: q.title,
      answer: opt ? opt.label : answers[qId],
    });
  }

  const sections: ResultSectionPayload[] = [];
  for (const section of resultSections) {
    const items: ResultItem[] = [];
    for (const rule of section.rules) {
      if (rule.condition(answers)) {
        items.push({ text: rule.text, qa: rule.qa });
      }
    }
    if (items.length > 0) {
      sections.push({ title: section.sectionTitle, emoji: section.emoji, items });
    }
  }

  const conclusion: string[] = conclusionRules
    .filter((rule) => rule.condition(answers))
    .map((rule) => rule.text);

  return { conclusion, summary, sections };
}

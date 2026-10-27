/**
 * Step 10 teaching enrichment.
 *
 * Authentic materials use only short excerpts from official/primary sources.
 * The full context always remains at sourceUrl so teachers and students can
 * distinguish source text from the course's own teaching notes.
 */

import { SMART_LEARNING_MODULES, type TranslationComparison } from "../step9/learning-content";
import {
  TEXTBOOK_HIGHLIGHTED_SENTENCES,
  TEXTBOOK_HIGHLIGHT_TOTALS,
  getTextbookHighlightsForLesson,
  getTextbookUnitsForLesson,
  type TextbookHighlightedSentence,
} from "./textbook-highlights";

export type AuthenticVocabulary = {
  term: string;
  meaning: string;
};

export type AuthenticMaterial = {
  id: string;
  lessonOrdinal: number;
  title: string;
  materialType: string;
  publisher: string;
  sourceTitle: string;
  sourceUrl: string;
  excerpt: string;
  excerptTranslation: string;
  vocabulary: AuthenticVocabulary[];
  readingFocus: string[];
  task: string;
  answerGuide: string[];
  sourceCheckedAt: "2026-08-08";
};

export type FiveLayerDetail = {
  professionalLiteralTranslation: string;
  professionalExplanation: string;
};

export type CourseHighlightedSentence = TranslationComparison & {
  origin: "textbook-underline" | "teacher-curated";
  textbookUnit?: number;
  underlineSequence?: number;
  unitTitle?: string;
};

export const AUTHENTIC_MATERIALS: AuthenticMaterial[] = [];
// External reading links/excerpts require a separate permission review before inclusion.
export const FIVE_LAYER_DETAILS: Record<string, FiveLayerDetail> = {};

export function getAuthenticMaterialsForLesson(lessonOrdinal: number) {
  return AUTHENTIC_MATERIALS.filter((item) => item.lessonOrdinal === lessonOrdinal);
}

export function getFiveLayerDetail(translationId: string) {
  const curated = FIVE_LAYER_DETAILS[translationId];
  if (curated) return curated;
  const textbook = TEXTBOOK_HIGHLIGHTED_SENTENCES.find((item) => item.id === translationId);
  if (!textbook) return undefined;
  return {
    professionalLiteralTranslation: textbook.professionalLiteralTranslation,
    professionalExplanation: textbook.professionalExplanation,
  };
}

function normalizedHighlightText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/[^a-z0-9]+/gu, "");
}

function isAlreadyCoveredByTextbookUnderline(curated: TranslationComparison, textbook: TextbookHighlightedSentence[]) {
  const curatedText = normalizedHighlightText(curated.original);
  if (curatedText.length < 35) return false;
  return textbook.some((item) => {
    const textbookText = normalizedHighlightText(item.original);
    if (textbookText === curatedText) return true;
    const shorter = curatedText.length <= textbookText.length ? curatedText : textbookText;
    const longer = curatedText.length <= textbookText.length ? textbookText : curatedText;
    return shorter.length >= 60 && longer.includes(shorter);
  });
}

export function getHighlightedSentencesForLesson(lessonOrdinal: number): CourseHighlightedSentence[] {
  const textbook = getTextbookHighlightsForLesson(lessonOrdinal);
  const lesson = SMART_LEARNING_MODULES.find((item) => item.lessonOrdinal === lessonOrdinal);
  const curated = (lesson?.translationComparisons || [])
    .filter((item) => !isAlreadyCoveredByTextbookUnderline(item, textbook))
    .map((item) => ({ ...item, origin: "teacher-curated" as const }));
  return [...textbook, ...curated];
}

export function getHighlightCoverageForLesson(lessonOrdinal: number) {
  const textbook = getTextbookHighlightsForLesson(lessonOrdinal);
  const all = getHighlightedSentencesForLesson(lessonOrdinal);
  return {
    total: all.length,
    textbookUnderlines: textbook.length,
    teacherCurated: all.length - textbook.length,
    textbookUnits: getTextbookUnitsForLesson(lessonOrdinal),
  };
}

export const ENRICHMENT_TOTALS = {
  authenticMaterials: AUTHENTIC_MATERIALS.length,
  textbookUnderlines: TEXTBOOK_HIGHLIGHT_TOTALS.underlinedGroups,
  textbookUnits: TEXTBOOK_HIGHLIGHT_TOTALS.textbookUnits,
  teacherCuratedSentences: SMART_LEARNING_MODULES.reduce((sum, lesson) => sum + lesson.translationComparisons.length, 0),
  fiveLayerSentences: Array.from({ length: 12 }, (_, index) => getHighlightedSentencesForLesson(index + 1))
    .reduce((sum, items) => sum + items.length, 0),
  lessons: 12,
};

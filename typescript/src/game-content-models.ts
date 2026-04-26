export interface CanonicalQuizQuestion {
  id: string;
  question: string;
  answers: string[];
  correctIndex: number;
}

export interface CanonicalQuizModel {
  game: {
    questions: CanonicalQuizQuestion[];
  };
}

export interface CanonicalWordpassEntry {
  id: string;
  definition: string;
  word: string;
}

export interface CanonicalWordpassModel {
  game: {
    words: CanonicalWordpassEntry[];
  };
}

function asRecord(value: unknown, errorMessage: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error(errorMessage);
  }

  return value as Record<string, unknown>;
}

function getGameRecord(payload: unknown, errorMessage: string): Record<string, unknown> {
  const record = asRecord(payload, errorMessage);
  const nested = record.game;
  return nested && typeof nested === "object" ? (nested as Record<string, unknown>) : record;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => item !== null);
}

export function canonicalizeQuizModel(payload: unknown): CanonicalQuizModel {
  const game = getGameRecord(payload, "Generated payload is not a valid object");
  const rawQuestions = Array.isArray(game.questions)
    ? game.questions
    : readString(game.question)
      ? [game]
      : [];

  if (rawQuestions.length === 0) {
    throw new Error("Generated quiz has no questions — rejecting incomplete content");
  }

  return {
    game: {
      questions: rawQuestions.map((questionValue, index) => {
        const questionRecord = asRecord(questionValue, `Question ${index} is not a valid object`);
        const question = readString(questionRecord.question);
        if (!question) {
          throw new Error(`Question ${index} is missing the 'question' text`);
        }

        const answers = readStringArray(questionRecord.answers ?? questionRecord.options);
        if (answers.length < 2) {
          throw new Error(`Question ${index} has fewer than 2 answers`);
        }

        const rawCorrectIndex = questionRecord.correctIndex ?? questionRecord.correct_index;
        if (typeof rawCorrectIndex !== "number" || !Number.isInteger(rawCorrectIndex) || rawCorrectIndex < 0 || rawCorrectIndex >= answers.length) {
          throw new Error(`Question ${index} has invalid correctIndex`);
        }

        return {
          id: readString(questionRecord.id) ?? `q-${index + 1}`,
          question,
          answers,
          correctIndex: rawCorrectIndex as number,
        };
      }),
    },
  };
}

export function canonicalizeWordpassModel(payload: unknown): CanonicalWordpassModel {
  const game = getGameRecord(payload, "Generated payload is not a valid object");
  const rawWords = Array.isArray(game.words)
    ? game.words
    : readString(game.definition ?? game.hint) || readString(game.word ?? game.answer)
      ? [game]
      : [];

  if (rawWords.length === 0) {
    throw new Error("Generated word-pass has no words — rejecting incomplete content");
  }

  return {
    game: {
      words: rawWords.map((wordValue, index) => {
        const wordRecord = asRecord(wordValue, `Word ${index} is not a valid object`);
        const definition = readString(wordRecord.definition ?? wordRecord.hint);
        if (!definition) {
          throw new Error(`Word ${index} is missing the 'definition' field`);
        }

        const word = readString(wordRecord.word ?? wordRecord.answer);
        if (!word) {
          throw new Error(`Word ${index} is missing the 'word' field`);
        }

        return {
          id: readString(wordRecord.id) ?? `w-${index + 1}`,
          definition,
          word,
        };
      }),
    },
  };
}

export function extractQuizQuestionTexts(payload: unknown): string[] {
  const game = getGameRecord(payload, "Generated payload is not a valid object");
  const rawQuestions = Array.isArray(game.questions) ? game.questions : [];

  return rawQuestions
    .map((item) => (item && typeof item === "object" ? readString((item as Record<string, unknown>).question) : null))
    .filter((item): item is string => item !== null);
}

export function extractWordpassWords(payload: unknown): string[] {
  const game = getGameRecord(payload, "Generated payload is not a valid object");
  const rawWords = Array.isArray(game.words) ? game.words : [];

  return rawWords
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      return readString(record.word ?? record.answer);
    })
    .filter((item): item is string => item !== null);
}

export function extractWordpassDefinitions(payload: unknown): string[] {
  const game = getGameRecord(payload, "Generated payload is not a valid object");
  const rawWords = Array.isArray(game.words) ? game.words : [];

  return rawWords
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      return readString(record.definition ?? record.hint);
    })
    .filter((item): item is string => item !== null);
}
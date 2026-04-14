import { GameCategoriesSchema, type GameCategories } from "./contracts.js";

const GAME_CATALOGS = GameCategoriesSchema.parse({
  categories: [
  { id: "9", name: "General Knowledge" },
  { id: "10", name: "Entertainment: Books" },
  { id: "11", name: "Entertainment: Film" },
  { id: "12", name: "Entertainment: Music" },
  { id: "13", name: "Entertainment: Musicals & Theatres" },
  { id: "14", name: "Entertainment: Television" },
  { id: "15", name: "Entertainment: Video Games" },
  { id: "16", name: "Entertainment: Board Games" },
  { id: "17", name: "Science & Nature" },
  { id: "18", name: "Science: Computers" },
  { id: "19", name: "Science: Mathematics" },
  { id: "20", name: "Mythology" },
  { id: "21", name: "Sports" },
  { id: "22", name: "Geography" },
  { id: "23", name: "History" },
  { id: "24", name: "Politics" },
  { id: "25", name: "Art" },
  { id: "26", name: "Celebrities" },
  { id: "27", name: "Animals" },
  { id: "28", name: "Vehicles" },
  { id: "29", name: "Entertainment: Comics" },
  { id: "30", name: "Science: Gadgets" },
  { id: "31", name: "Entertainment: Japanese Anime & Manga" },
  { id: "32", name: "Entertainment: Cartoon & Animations" }
  ],
  languages: [
    { code: "es", name: "espanol" },
    { code: "en", name: "ingles" },
    { code: "fr", name: "frances" },
    { code: "de", name: "aleman" },
    { code: "it", name: "italiano" }
  ]
});

export type GameCategory = GameCategories["categories"][number];
export type SupportedLanguage = GameCategories["languages"][number];

export const GAME_CATEGORIES: GameCategory[] = GAME_CATALOGS.categories;

export const GAME_CATEGORY_IDS = GAME_CATEGORIES.map((item) => item.id);
export const GAME_CATEGORY_BY_ID = new Map(
  GAME_CATEGORIES.map((item) => [item.id, item] as const)
);

/** @deprecated Use GameCategory instead */
export type TriviaCategory = GameCategory;
/** @deprecated Use GAME_CATEGORIES instead */
export const TRIVIA_CATEGORIES = GAME_CATEGORIES;
/** @deprecated Use GAME_CATEGORY_IDS instead */
export const TRIVIA_CATEGORY_IDS = GAME_CATEGORY_IDS;
/** @deprecated Use GAME_CATEGORY_BY_ID instead */
export const TRIVIA_CATEGORY_BY_ID = GAME_CATEGORY_BY_ID;

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = GAME_CATALOGS.languages;

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((item) => item.code);
export const SUPPORTED_LANGUAGE_BY_CODE = new Map(
  SUPPORTED_LANGUAGES.map((item) => [item.code, item] as const)
);

/**
 * One place to change the models for every POD app.
 *
 * `gemini-3.6-flash` was chosen in PrepSprint on measured behaviour, not
 * version number: `gemini-3.8-flash` returned 503 "high demand" on two of
 * three structured calls, while 3.6 completed three of three at roughly 1.7s
 * each. `gemini-2.5-flash` is rejected for accounts created after it retired.
 */
export const GENERATION_MODEL = "gemini-3.6-flash";
export const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * 768 keeps vectors small and under pgvector's 2000-dimension index limit. It
 * must match `vector(768)` in every app's migrations — changing one without
 * the other breaks inserts.
 */
export const EMBEDDING_DIMENSIONS = 768;

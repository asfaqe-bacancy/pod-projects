import {
  GoogleGenAI,
  createPartFromBase64,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponseUsageMetadata,
  type Part,
  type SchemaUnion,
} from "@google/genai";
import { GeminiError, withRetry } from "./errors";
import { GENERATION_MODEL } from "./models";

/**
 * The Gemini text/vision client every POD app shares.
 *
 * It takes its key as an argument and never reads the environment, so a
 * package can't quietly connect one app to another app's quota: each app
 * builds its own client from its own env (see each app's `lib/env.ts`).
 */

export interface TokenUsage {
  input: number;
  output: number;
}

/** A prompt is plain text, or a list of parts when images/PDFs go along. */
export type PromptInput = string | Part[];

export interface PromptRequest {
  system?: string;
  /** Prior turns, oldest first. */
  history?: Content[];
  prompt: PromptInput;
  /** Override the default generation model for this call. */
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** 0 disables thinking — right for fast, mechanical steps. */
  thinkingBudget?: number;
  signal?: AbortSignal;
  /** Called once with the token counts Gemini reports for this call. */
  onUsage?: (usage: TokenUsage) => void;
}

export interface JsonRequest<T> extends PromptRequest {
  schema: SchemaUnion;
  /** Validates the parsed JSON (e.g. a zod `parse`). Throwing triggers one retry. */
  validate?: (value: unknown) => T;
}

export interface Gemini {
  readonly generationModel: string;
  generateText(request: PromptRequest): Promise<string>;
  generateJson<T>(request: JsonRequest<T>): Promise<T>;
  streamText(request: PromptRequest): AsyncGenerator<string>;
  /** The underlying SDK client, for embeddings and anything not wrapped here. */
  readonly sdk: GoogleGenAI;
}

export function createGemini({
  apiKey,
  generationModel = GENERATION_MODEL,
}: {
  apiKey: string;
  generationModel?: string;
}): Gemini {
  const sdk = new GoogleGenAI({ apiKey });

  function contents(request: PromptRequest): Content[] {
    const parts =
      typeof request.prompt === "string"
        ? [{ text: request.prompt }]
        : request.prompt;
    return [...(request.history ?? []), { role: "user", parts }];
  }

  function config(
    request: PromptRequest,
    extra?: GenerateContentConfig,
  ): GenerateContentConfig {
    return {
      systemInstruction: request.system,
      temperature: request.temperature ?? 0.4,
      maxOutputTokens: request.maxOutputTokens ?? 2048,
      thinkingConfig: { thinkingBudget: request.thinkingBudget ?? 0 },
      abortSignal: request.signal,
      ...extra,
    };
  }

  function report(
    request: PromptRequest,
    usage: GenerateContentResponseUsageMetadata | undefined,
  ) {
    if (!request.onUsage || !usage) return;
    request.onUsage({
      input: usage.promptTokenCount ?? 0,
      output: usage.candidatesTokenCount ?? 0,
    });
  }

  async function generateText(request: PromptRequest): Promise<string> {
    return withRetry(async () => {
      const response = await sdk.models.generateContent({
        model: request.model ?? generationModel,
        contents: contents(request),
        config: config(request),
      });
      const text = response.text?.trim();
      if (!text) {
        throw new GeminiError("The model returned an empty response.", true);
      }
      report(request, response.usageMetadata);
      return text;
    });
  }

  /**
   * Structured generation. A malformed or invalid response is retried once
   * and then becomes a caught error, never a broken screen.
   */
  async function generateJson<T>(request: JsonRequest<T>): Promise<T> {
    return withRetry(
      async () => {
        const response = await sdk.models.generateContent({
          model: request.model ?? generationModel,
          contents: contents(request),
          config: config(request, {
            responseMimeType: "application/json",
            responseSchema: request.schema,
          }),
        });
        const text = response.text?.trim();
        if (!text) {
          throw new GeminiError("The model returned an empty response.", true);
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new GeminiError("The model's reply wasn't valid JSON.", true);
        }

        let value: T;
        try {
          value = request.validate ? request.validate(parsed) : (parsed as T);
        } catch (cause) {
          throw new GeminiError(
            "The model's reply didn't match the expected shape.",
            true,
            { cause },
          );
        }
        report(request, response.usageMetadata);
        return value;
      },
      { attempts: 2 },
    );
  }

  /** Streams text as it arrives, for anything a person reads live. */
  async function* streamText(request: PromptRequest): AsyncGenerator<string> {
    const stream = await withRetry(() =>
      sdk.models.generateContentStream({
        model: request.model ?? generationModel,
        contents: contents(request),
        config: config(request),
      }),
    );

    let usage: GenerateContentResponseUsageMetadata | undefined;
    for await (const chunk of stream) {
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      const text = chunk.text;
      if (text) yield text;
    }
    report(request, usage);
  }

  return { generationModel, generateText, generateJson, streamText, sdk };
}

/** An image or PDF to send alongside a prompt. */
export function binaryPart(bytes: Uint8Array, mimeType: string): Part {
  return createPartFromBase64(Buffer.from(bytes).toString("base64"), mimeType);
}

export function textPart(text: string): Part {
  return { text };
}

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';
import { getEffectiveModel } from './modelCheck.js';
import { UserTierId } from '../code_assist/types.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  getTier?(): Promise<UserTierId | undefined>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_OPENAI = 'openai',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  enableOpenAILogging?: boolean;
  // Timeout configuration in milliseconds
  timeout?: number;
  // Maximum retries for failed requests
  maxRetries?: number;
  samplingParams?: {
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    temperature?: number;
    max_tokens?: number;
  };
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;
  const openaiApiKey = process.env.OPENAI_API_KEY || "ollama";

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // Always load the system prompt for any model
  // (No change needed if already loaded in prompts.ts or system.md)

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_OPENAI && openaiApiKey) {
    contentGeneratorConfig.apiKey = openaiApiKey;
    contentGeneratorConfig.model = process.env.OPENAI_MODEL || '';

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return createCodeAssistContentGenerator(
      httpOptions,
      config.authType,
      gcConfig,
      sessionId,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_OPENAI) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Import OpenAIContentGenerator dynamically to avoid circular dependencies
    const { OpenAIContentGenerator } = await import(
      './openaiContentGenerator.js'
    );

    // Always use OpenAIContentGenerator, logging is controlled by enableOpenAILogging flag
    return new OpenAIContentGenerator(config.apiKey, config.model, gcConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}

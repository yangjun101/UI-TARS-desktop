/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatCompletionMessageParam } from 'openai/resources';
import type { models } from '@tarko/llm-client';

export * from './third-party';

/**
 * The actual underlying model provider
 */
export type ActualModelProviderName = keyof typeof models;

/**
 * All Model Providers, including some providers that align with OpenAI compatibility
 */
export type ModelProviderName =
  | ActualModelProviderName
  | 'ollama'
  | 'lm-studio'
  | 'volcengine'
  | 'deepseek'
  | 'bedrock';

/**
 * Model provider serving configuration
 */
export interface ModelProviderServingConfig {
  /**
   * Provider's API key
   */
  apiKey?: string;
  /**
   * Provider's base URL
   */
  baseURL?: string;
  /**
   * AWS region (for Bedrock)
   */
  region?: string;
  /**
   * AWS access key ID (for Bedrock)
   */
  accessKeyId?: string;
  /**
   * AWS secret access key (for Bedrock)
   */
  secretAccessKey?: string;
  /**
   * AWS session token (for Bedrock)
   */
  sessionToken?: string;
}

/**
 * Default model selection configuration
 */
export interface ModelDefaultSelection extends ModelProviderServingConfig {
  /**
   * Default provider name
   */
  provider?: ModelProviderName;
  /**
   * Default model identifier
   */
  id?: string;
}

/**
 * Model provider configuration
 */
export interface ModelProvider extends ModelProviderServingConfig {
  /**
   * Model provider name
   */
  name: ModelProviderName;
  /**
   * Provider's supported model identifiers
   */
  models: string[];
}

/**
 * Configuration options for the model provider
 */
export interface ProviderOptions extends ModelDefaultSelection {
  /**
   * Pre-configured model providers for runtime use
   */
  providers?: ModelProvider[];
}

/**
 * Result of model resolution containing all necessary configuration
 */
export interface ResolvedModel {
  /**
   * The public provider name
   */
  provider: ModelProviderName;
  /**
   * The model identifier for LLM requests
   */
  id: string;
  /**
   * Base URL for the provider API
   */
  baseURL?: string;
  /**
   * API key for authentication
   */
  apiKey?: string;
  /**
   * The actual implementation provider name
   */
  actualProvider: ActualModelProviderName;
  /**
   * AWS region (for Bedrock)
   */
  region?: string;
  /**
   * AWS access key ID (for Bedrock)
   */
  accessKeyId?: string;
  /**
   * AWS secret access key (for Bedrock)
   */
  secretAccessKey?: string;
  /**
   * AWS session token (for Bedrock)
   */
  sessionToken?: string;
}

/**
 * Provider configuration for extended providers
 */
export interface ProviderConfig {
  /**
   * Public provider name
   */
  name: ModelProviderName;
  /**
   * The actual implementation provider name
   */
  actual: ActualModelProviderName;
  /**
   * Default base URL
   */
  baseURL?: string;
  /**
   * Default API key
   */
  apiKey?: string;
}

/**
 * LLM reasoning configuration options
 */
export interface LLMReasoningOptions {
  /**
   * Whether to enable reasoning
   *
   * @defaultValue 'disabled'
   * @compatibility Supported models: 'claude', 'doubao-1.5-thinking'
   */
  type?: 'disabled' | 'enabled';

  /**
   * Maximum tokens for internal reasoning process
   *
   * @compatibility Supported models: 'claude'
   */
  budgetTokens?: number;
}

/**
 * Extended LLM request with reasoning parameters
 */
export type LLMRequest = ChatCompletionMessageParam & {
  /**
   * Agent reasoning options
   */
  thinking?: LLMReasoningOptions;
};

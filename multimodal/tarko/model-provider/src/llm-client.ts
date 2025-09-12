/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TokenJS } from '@tarko/llm-client';
import { OpenAI } from 'openai';
import { LLMRequest, AgentModel } from './types';

// Providers that should not be added to extended model list
const NATIVE_PROVIDERS = new Set(['openrouter', 'openai-compatible', 'azure-openai']);

export type LLMRequestInterceptor = (
  provider: string,
  request: LLMRequest,
  baseURL?: string,
) => any;

/**
 * Create LLM Client based on current model configuration
 *
 * @param agentModel Resolved model configuration
 * @param requestInterceptor Optional request interceptor for modifying requests
 * @returns OpenAI-compatible client
 */
export function createLLMClient(
  agentModel: AgentModel,
  requestInterceptor?: LLMRequestInterceptor,
): OpenAI {
  const { provider, id, baseProvider, baseURL, apiKey } = agentModel;

  const client = new TokenJS({
    apiKey,
    baseURL,
  });

  // Add extended model support for non-native providers
  if (baseProvider && !NATIVE_PROVIDERS.has(baseProvider)) {
    // @ts-expect-error FIXME: support custom provider.
    client.extendModelList(baseProvider, id, {
      streaming: true,
      json: true,
      toolCalls: true,
      images: true,
    });
  }

  // Create OpenAI-compatible interface
  return {
    chat: {
      completions: {
        async create(params: any) {
          const requestPayload = {
            ...params,
            provider,
            model: id,
          };

          const finalRequest = requestInterceptor
            ? requestInterceptor(provider, requestPayload, baseURL)
            : requestPayload;

          return client.chat.completions.create({
            ...finalRequest,
            provider: baseProvider,
          });
        },
      },
    },
  } as unknown as OpenAI;
}

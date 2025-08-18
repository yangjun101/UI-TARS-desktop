/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import { BaseHandler } from './base.js';
import { ConfigOptions, CompletionResponse, StreamCompletionResponse } from '../userTypes/index.js';
import { CompletionParams, BedrockModel, ProviderCompletionParams } from '../chat/index.js';

interface BedrockConfig extends ConfigOptions {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeRequest {
  anthropic_version: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: any;
  }>;
}

interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class BedrockHandler extends BaseHandler<BedrockModel> {
  private client: BedrockRuntimeClient;

  constructor(
    config: BedrockConfig,
    models: readonly BedrockModel[] | boolean,
    supportsJSON: readonly BedrockModel[] | boolean,
    supportsImages: readonly BedrockModel[] | boolean,
    supportsToolCalls: readonly BedrockModel[] | boolean,
    supportsN: readonly BedrockModel[] | boolean,
    supportsStreamingMessages: readonly BedrockModel[] | boolean,
  ) {
    super(
      config,
      models,
      supportsJSON,
      supportsImages,
      supportsToolCalls,
      supportsN,
      supportsStreamingMessages,
    );

    const region = config.region || process.env.AWS_REGION || 'us-east-1';
    console.log('[BedrockHandler] Initializing BedrockRuntimeClient with region:', region);
    console.log(
      '[BedrockHandler] Using credentials:',
      config.accessKeyId ? 'explicit credentials' : 'default AWS credentials',
    );

    this.client = new BedrockRuntimeClient({
      region,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
              sessionToken: config.sessionToken,
            }
          : undefined,
    });
  }

  async create(
    body: ProviderCompletionParams<'bedrock'>,
  ): Promise<CompletionResponse | StreamCompletionResponse> {
    this.validateInputs(body);

    if (body.stream) {
      return this.createChatCompletionStream(body);
    } else {
      return this.createChatCompletion(body);
    }
  }

  async createChatCompletion(
    body: ProviderCompletionParams<'bedrock'>,
  ): Promise<CompletionResponse> {
    console.log('[BedrockHandler] createChatCompletion called with model:', body.model);
    const claudeRequest = this.convertToClaudeRequest(body);

    const command = new InvokeModelCommand({
      modelId: body.model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(claudeRequest),
    });

    console.log('[BedrockHandler] InvokeModelCommand created with modelId:', body.model);

    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return this.convertToOpenAIResponse(responseBody, body.model);
    } catch (error) {
      throw new Error(`Bedrock API error: ${error}`);
    }
  }

  async *createChatCompletionStream(
    body: ProviderCompletionParams<'bedrock'>,
  ): AsyncGenerator<any, void, unknown> {
    console.log('[BedrockHandler] createChatCompletionStream called with model:', body.model);
    const claudeRequest = this.convertToClaudeRequest(body);

    console.log('[BedrockHandler] Claude request:', JSON.stringify(claudeRequest, null, 2));

    const command = new InvokeModelWithResponseStreamCommand({
      modelId: body.model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(claudeRequest),
    });

    console.log(
      '[BedrockHandler] InvokeModelWithResponseStreamCommand created with modelId:',
      body.model,
    );

    try {
      const response = await this.client.send(command);

      if (!response.body) {
        throw new Error('No response body from Bedrock');
      }

      let messageId = `chatcmpl-${Date.now()}`;
      let chunkIndex = 0;

      for await (const chunk of response.body) {
        if (chunk.chunk?.bytes) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));
          console.log('[BedrockHandler] Received chunk:', JSON.stringify(chunkData, null, 2));

          // 按照标准 AWS SDK 格式处理
          if (chunkData.delta?.text) {
            const openAIChunk = {
              id: messageId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: body.model,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: chunkData.delta.text,
                  },
                  finish_reason: null,
                },
              ],
            };

            console.log('[BedrockHandler] Yielding chunk with content:', chunkData.delta.text);
            yield openAIChunk;
            chunkIndex++;
          } else if (chunkData.stop_reason) {
            // 处理结束信号
            const finalChunk = {
              id: messageId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: body.model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: this.mapStopReason(chunkData.stop_reason),
                },
              ],
            };

            console.log(
              '[BedrockHandler] Yielding final chunk with stop_reason:',
              chunkData.stop_reason,
            );
            yield finalChunk;
          }
        }
      }
    } catch (error) {
      console.error('[BedrockHandler] Streaming error details:', {
        message: (error as any)?.message,
        name: (error as any)?.name,
        code: (error as any)?.code,
        statusCode: (error as any)?.$metadata?.httpStatusCode,
        requestId: (error as any)?.$metadata?.requestId,
      });
      throw new Error(`Bedrock streaming error: ${(error as any)?.message || error}`);
    }
  }

  private convertToClaudeRequest(body: ProviderCompletionParams<'bedrock'>): ClaudeRequest {
    const messages: ClaudeMessage[] = [];
    let systemMessage = '';

    // Process messages
    for (const message of body.messages) {
      if (message.role === 'system') {
        systemMessage = typeof message.content === 'string' ? message.content : '';
        continue;
      }

      if (message.role === 'user' || message.role === 'assistant') {
        let content = '';

        if (typeof message.content === 'string') {
          content = message.content;
        } else if (Array.isArray(message.content)) {
          // 提取文本内容，忽略图片（Bedrock 标准格式不支持复杂内容）
          for (const item of message.content) {
            if (item.type === 'text') {
              content += item.text;
            }
          }
        }

        const claudeMessage: ClaudeMessage = {
          role: message.role,
          content: content,
        };

        messages.push(claudeMessage);
      }
    }

    const claudeRequest: ClaudeRequest = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: body.max_tokens || 4096,
      messages,
      temperature: body.temperature ?? undefined,
      top_p: body.top_p ?? undefined,
    };

    if (systemMessage) {
      claudeRequest.system = systemMessage;
    }

    // Handle tools
    if (body.tools && body.tools.length > 0) {
      claudeRequest.tools = body.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description || '',
        input_schema: tool.function.parameters || {},
      }));
    }

    return claudeRequest;
  }

  private convertToOpenAIResponse(
    claudeResponse: ClaudeResponse,
    model: string,
  ): CompletionResponse {
    const content = claudeResponse.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('');

    const toolCalls = claudeResponse.content
      .filter((item) => item.type === 'tool_use')
      .map((item, index) => ({
        id: item.id || `call_${index}`,
        type: 'function' as const,
        function: {
          name: item.name || '',
          arguments: JSON.stringify(item.input || {}),
        },
      }));

    return {
      id: claudeResponse.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            refusal: null, // 添加缺少的 refusal 属性
          },
          logprobs: null, // 添加缺少的 logprobs 属性
          finish_reason: this.mapStopReason(claudeResponse.stop_reason),
        },
      ],
      usage: {
        prompt_tokens: claudeResponse.usage.input_tokens,
        completion_tokens: claudeResponse.usage.output_tokens,
        total_tokens: claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens,
      },
    };
  }

  private mapStopReason(
    claudeStopReason: string,
  ): 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | 'unknown' {
    switch (claudeStopReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'unknown';
    }
  }
}

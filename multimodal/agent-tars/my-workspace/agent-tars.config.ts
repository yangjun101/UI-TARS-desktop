/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { defineConfig } from '@agent-tars/interface';

export default defineConfig({
  maxTokens: 16384,
  model: {
    // 使用 AWS Bedrock Claude 3.7 作为主要模型
    id: 'doubao-1-5-thinking-vision-pro-250428',
    provider: 'volcengine',

    providers: [
      {
        name: 'bedrock',
        // AWS 凭证配置
        region: process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
        models: [
          'us.anthropic.claude-3-7-sonnet-20250219-v1:0', // Claude 3.7 Sonnet
        ],
      },
      {
        name: 'volcengine',
        apiKey: process.env.ARK_API_KEY,
        models: [
          'doubao-1-5-thinking-vision-pro-250428', // 'doubao-1.5-thinking-vision-pro',
        ],
      },
      {
        name: 'azure-openai',
        baseURL: process.env.AWS_CLAUDE_API_BASE_URL,
        models: ['aws_sdk_claude37_sonnet'],
      },
      {
        name: 'openai',
        baseURL: process.env.OPENAI_API_BASE_URL,
        models: ['gpt-4o-2024-11-20'],
      },
    ],
  },
  experimental: {
    dumpMessageHistory: true,
  },
  toolCallEngine: 'prompt_engineering', // 使用 prompt_engineering 避免 Bedrock native 工具调用问题
});

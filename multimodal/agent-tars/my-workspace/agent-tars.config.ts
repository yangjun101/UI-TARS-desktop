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
        name: 'volcengine',
        apiKey: process.env.ARK_API_KEY,
        models: ['doubao-1-5-thinking-vision-pro-250428'],
      },
    ],
  },
  experimental: {
    dumpMessageHistory: true,
  },
  toolCallEngine: 'prompt_engineering', // 使用 prompt_engineering 避免 Bedrock native 工具调用问题
});

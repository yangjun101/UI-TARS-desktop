/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simplest abort example: Demonstrates how to abort Agent execution
 */

import { Agent, AgentStatus } from '../../src';

async function main() {
  const agent = new Agent();

  console.log('Current Agent status:', agent.status()); // Should be IDLE

  console.log('Starting a task to generate a long response...');
  const resultPromise = agent.run(
    'Write a 2000-word article about the future development of artificial intelligence, including multiple sections and detailed arguments',
  );

  console.log('Status after starting task:', agent.status()); // Should be EXECUTING

  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('Aborting task after 1 second...');

  const aborted = agent.abort();
  console.log('Abort result:', aborted);
  console.log('Status after abort:', agent.status()); // Should be ABORTED

  try {
    const result = await resultPromise;
    console.log('Task result:', result);
  } catch (error) {
    console.error('Error getting result:', error);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('\nVerifying new tasks can be started after abortion:');
  const newResult = await agent.run('Hello, how is the weather today?');
  console.log('New task result:', newResult);
  console.log('Final status:', agent.status()); // Should be IDLE
}

if (require.main === module) {
  main().catch(console.error);
}

/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { exec } from 'child_process';
import fs from 'fs';
import http from 'http';
import {
  LogLevel,
  isAgentWebUIImplementationType,
  AgentWebUIImplementation,
} from '@tarko/interface';
import { AgentServer, AgentServerOptions, express, mergeWebUIConfig } from '@tarko/agent-server';
import boxen from 'boxen';
import chalk from 'chalk';
import gradient from 'gradient-string';
import { logger, toUserFriendlyPath, ensureServerConfig } from '../../utils';
import { createPathMatcher } from '@tarko/shared-utils';
import { AgentCLIRunInteractiveUICommandOptions } from '../../types';

/**
 * Start the Agent Server with UI capabilities
 */
export async function startInteractiveWebUI(
  options: AgentCLIRunInteractiveUICommandOptions,
): Promise<http.Server> {
  const { agentServerInitOptions, isDebug } = options;
  const { appConfig } = agentServerInitOptions;
  const webui = appConfig.webui!;

  await ensureServerConfig(appConfig);

  if (isAgentWebUIImplementationType(webui, 'static')) {
    // Set up static path if provided
    if (!fs.existsSync(webui.staticPath)) {
      throw new Error(
        `Interactive UI not found at ${webui.staticPath}. Make sure web UI is built and static files are available.`,
      );
    }
  } else {
    // TODO: implement remote web ui
    throw new Error(`Unsupported web ui type: ${webui.type}`);
  }

  // Create and start the server with injected agent
  const server = new AgentServer(agentServerInitOptions);
  const httpServer = await server.start();

  // Set up UI if static path is provided
  if (webui.staticPath) {
    const app = server.getApp();
    const mergedWebUIConfig = mergeWebUIConfig(webui, server);
    setupUI(app, isDebug, webui.staticPath, mergedWebUIConfig);
  }

  const port = appConfig.server!.port!;
  const serverUrl = `http://localhost:${port}`;

  if (appConfig.logLevel !== LogLevel.SILENT) {
    // Define brand colors
    const brandColor1 = '#4d9de0';
    const brandColor2 = '#7289da';
    const brandGradient = gradient(brandColor1, brandColor2);
    const workspaceDir = toUserFriendlyPath(server.getCurrentWorkspace());
    const provider = appConfig.model?.provider;
    const modelId = appConfig.model?.id;

    const boxContent = [
      `🎉 ${chalk.underline(chalk.bgBlue(` ${chalk.bold(server.getCurrentAgentName())} `))}` +
        brandGradient.multiline(` is available at: `, {
          interpolation: 'hsv',
        }) +
        chalk.underline(brandGradient(serverUrl)),
      '',
      `📁 ${chalk.gray('Workspace:')} ${brandGradient(workspaceDir)}`,
      '',
      `🤖 ${chalk.gray('Model:')} ${appConfig.model?.provider ? brandGradient(`${provider} | ${modelId}`) : chalk.gray('Not specified')}`,
    ].join('\n');

    console.log(
      boxen(boxContent, {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderColor: brandColor2,
        borderStyle: 'classic',
        dimBorder: true,
      }),
    );

    if (options.open) {
      const url = `http://localhost:${port}`;
      const command =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      exec(`${command} ${url}`, (err) => {
        if (err) {
          console.error(`Failed to open browser: ${err.message}`);
        }
      });
    }
  }

  return httpServer;
}

/**
 * Configure Express app to serve UI files
 */
function setupUI(
  app: express.Application,
  isDebug = false,
  staticPath: string,
  mergedWebUIConfig: AgentWebUIImplementation & Record<string, any>,
): void {
  if (isDebug) {
    logger.debug(`Using static files from: ${staticPath}`);
  }

  const pathMatcher = createPathMatcher(webui.base);

  // Middleware to inject baseURL for HTML requests
  const injectBaseURL = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    // Check if request path matches base pattern
    if (!pathMatcher.test(req.path)) {
      return next();
    }

    const extractedPath = pathMatcher.extract(req.path);

    if (
      !extractedPath.endsWith('.html') &&
      extractedPath !== '/' &&
      !extractedPath.match(/^\/[^.]*$/)
    ) {
      return next();
    }

    const indexPath = path.join(staticPath, 'index.html');
    let htmlContent = fs.readFileSync(indexPath, 'utf8');

    const scriptTag = `<script>
      window.AGENT_BASE_URL = "";
      window.AGENT_WEB_UI_CONFIG = ${JSON.stringify(mergedWebUIConfig)};
      console.log("Agent: Using API baseURL:", window.AGENT_BASE_URL);
    </script>`;

    htmlContent = htmlContent.replace('</head>', `${scriptTag}\n</head>`);
    res.send(htmlContent);
  };

  // Handle root path and client-side routes with base support
  app.get('*', (req, res, next) => {
    if (!pathMatcher.test(req.path)) {
      return next();
    }

    const extractedPath = pathMatcher.extract(req.path);

    // Handle root path
    if (extractedPath === '/') {
      return injectBaseURL(req, res, next);
    }

    // Handle client-side routes
    if (extractedPath.match(/^\/[^.]*$/)) {
      if (
        extractedPath.includes('.') &&
        !extractedPath.endsWith('.html') &&
        !extractedPath.startsWith('/static/') &&
        !extractedPath.startsWith('/assets/') &&
        !extractedPath.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
      ) {
        return next();
      }

      return injectBaseURL(req, res, next);
    }

    // Handle static files
    if (extractedPath.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/)) {
      const filePath = path.join(staticPath, extractedPath);
      if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
      }
    }

    // Fallback for SPA routes
    if (
      req.method === 'GET' &&
      !extractedPath.includes('.') &&
      !extractedPath.startsWith('/api/')
    ) {
      return injectBaseURL(req, res, next);
    }

    next();
  });
}

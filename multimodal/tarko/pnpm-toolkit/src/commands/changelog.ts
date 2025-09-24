/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Changelog command implementation
 * Generates and processes changelog files
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';

import { resolveWorkspaceConfig } from '../utils/workspace';
import { gitCommit, gitPush, getCommitAuthorMap } from '../utils/git';
import { logger } from '../utils/logger';
import { AIChangelogGenerator } from '../utils/ai-changelog';

import type { ChangelogOptions, CommitAuthor, ChangelogSection } from '../types';
import type { GitCommit, Reference } from 'tiny-conventional-commits-parser';
import { ModelProviderName } from '@tarko/model-provider';

/**
 * Filters commits based on configured filters
 */
function filterCommits(
  commits: GitCommit[],
  filterTypes: string[] = [],
  filterScopes: string[] = [],
): GitCommit[] {
  return commits.filter((commit) => {
    // Filter by type if types filter is provided
    if (filterTypes.length > 0 && !filterTypes.includes(commit.type)) {
      return false;
    }

    // Filter by scope if scopes filter is provided
    if (filterScopes.length > 0) {
      if (!commit.scope) return false;
      return filterScopes.some((filterScope) => commit.scope?.includes(filterScope));
    }

    return true;
  });
}

/**
 * Get repo URL from git config
 */
async function getRepositoryUrl(cwd: string): Promise<string> {
  try {
    const { stdout } = await execa('git', ['config', '--get', 'remote.origin.url'], { cwd });

    // Convert potential SSH URL to HTTPS URL
    // Example: git@github.com:user/repo.git -> https://github.com/user/repo
    return stdout
      .trim()
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/\.git$/, '');
  } catch (error) {
    logger.warn(`Failed to get repository URL: ${(error as Error).message}`);
    return '';
  }
}

/**
 * Gets the previous tag based on chronological order (handles mixed tag formats)
 * Filters out canary releases
 */
async function getPreviousTag(
  version: string,
  tagPrefix: string,
  cwd: string,
): Promise<string | undefined> {
  try {
    logger.info(`🔍 Looking for previous tag for version: ${version}`);

    // Get all tags sorted by creation date (chronological order, newest first)
    const { stdout } = await execa('git', ['tag', '--sort=-creatordate'], { cwd });
    const allTags = stdout.trim().split('\n').filter(Boolean);

    logger.info(`📋 Found ${allTags.length} total git tags`);
    logger.info(`🏷️  Recent tags: [${allTags.slice(0, 5).join(', ')}]`);

    if (allTags.length === 0) {
      logger.warn(`❌ No git tags found`);
      return undefined;
    }

    // Filter out canary releases
    const nonCanaryTags = allTags.filter((tag) => !tag.includes('canary'));
    
    logger.info(`📋 Found ${nonCanaryTags.length} non-canary tags`);
    logger.info(`🏷️  Recent non-canary tags: [${nonCanaryTags.slice(0, 5).join(', ')}]`);

    if (nonCanaryTags.length === 0) {
      logger.warn(`❌ No non-canary git tags found`);
      return undefined;
    }

    // Find the current tag in the filtered list (could be v{version} or any format)
    const currentTag = `${tagPrefix}${version}`;
    const currentIndex = nonCanaryTags.findIndex((tag) => tag === currentTag);

    logger.info(`🔍 Looking for current tag: ${currentTag}`);
    logger.info(`📍 Current tag index in non-canary list: ${currentIndex}`);

    if (currentIndex === -1) {
      // If current tag not found, return the most recent non-canary tag
      const selected = nonCanaryTags[0];
      logger.info(`✅ Current tag not found, using most recent non-canary tag: ${selected}`);
      return selected;
    }

    // Return the next tag (previous in chronological order)
    if (currentIndex < nonCanaryTags.length - 1) {
      const selected = nonCanaryTags[currentIndex + 1];
      logger.info(`✅ Found previous non-canary tag: ${selected}`);
      return selected;
    }

    // No previous tag found
    logger.warn(`❌ No previous non-canary tag found for ${currentTag}`);
    return undefined;
  } catch (error) {
    logger.error(`💥 Failed to get previous tag: ${(error as Error).message}`);
    return undefined;
  }
}

/**
 * Group commits into sections by type
 */
function groupCommitsByType(commits: GitCommit[]): ChangelogSection[] {
  const sections: Record<string, ChangelogSection> = {};

  // Define section titles for known types
  const sectionTitles: Record<string, string> = {
    feat: 'Features',
    feature: 'Features',
    fix: 'Bug Fixes',
    perf: 'Performance Improvements',
    revert: 'Reverts',
    docs: 'Documentation',
    style: 'Styles',
    refactor: 'Code Refactoring',
    test: 'Tests',
    build: 'Build System',
    ci: 'Continuous Integration',
    chore: 'Chores',
  };

  // Group commits by their type
  commits.forEach((commit) => {
    const type = commit.type;
    if (!sections[type]) {
      sections[type] = {
        type,
        title: sectionTitles[type] || `${type.charAt(0).toUpperCase()}${type.slice(1)}`,
        commits: [],
      };
    }
    sections[type].commits.push(commit);
  });

  // Sort sections in a standard order
  const orderedSectionTypes = [
    'feat',
    'fix',
    'perf',
    'revert',
    'docs',
    'style',
    'refactor',
    'test',
    'build',
    'ci',
    'chore',
  ];

  const orderedSections = orderedSectionTypes
    .filter((type) => sections[type]) // Only include sections that have commits
    .map((type) => sections[type]);

  // Sort commits by scope within each section
  orderedSections.forEach((section) => {
    section.commits.sort((a, b) => {
      // Handle undefined scopes
      const scopeA = a.scope || '';
      const scopeB = b.scope || '';

      return scopeA.localeCompare(scopeB);
    });
  });

  return orderedSections;
}

/**
 * Get issues from commit references
 */
function getIssuesFromReferences(references: Reference[]): string[] {
  return references.filter((ref) => ref.type === 'issue').map((ref) => ref.value);
}

/**
 * Get PR number from commit references
 */
function getPRFromReferences(references: Reference[]): string | undefined {
  const prRef = references.find((ref) => ref.type === 'pull-request');
  return prRef?.value;
}

/**
 * Format a single commit for the changelog
 */
function formatCommit(commit: GitCommit, repoUrl: string): string {
  // Format: subject (scope) (PR link) (commit link)
  let output = `* `;

  // Add scope if available
  if (commit.scope) {
    output += `**${commit.scope}:** `;
  }

  // Add subject
  output += commit.description;

  // Add issue references if any
  const issues = getIssuesFromReferences(commit.references);
  if (issues.length > 0) {
    const issueLinks = issues.map((issue) => {
      const issueClean = issue.replace(/^#/, '');
      return `[#${issueClean}](${repoUrl}/issues/${issueClean})`;
    });
    output += ` (close: ${issueLinks.join(', ')})`;
  }

  // Add PR reference if available
  const prNumber = getPRFromReferences(commit.references);
  if (prNumber) {
    const prClean = prNumber.replace(/^#/, '');
    output += ` ([#${prClean}](${repoUrl}/pull/${prClean}))`;
  }

  // Add commit reference
  output += ` ([${commit.shortHash.substring(0, 7)}](${repoUrl}/commit/${commit.shortHash}))`;

  // Add author if available
  if (commit.authors.length > 0 && commit.authors[0].name) {
    output += ` [@${commit.authors[0].name}](https://github.com/${commit.authors[0].name})`;
  }

  return output;
}

/**
 * Format the changelog sections into markdown
 */
function formatChangelog(
  sections: ChangelogSection[],
  version: string,
  date: string,
  compareUrl: string,
  repoUrl: string,
): string {
  // Start with the version header and link
  let output = `## [${version}](${compareUrl}) (${date})\n\n`;

  // Add breaking changes section first if there are any
  const hasBreakingChanges = sections.some((section) =>
    section.commits.some((commit) => commit.isBreaking),
  );

  if (hasBreakingChanges) {
    output += `### ⚠ BREAKING CHANGES\n\n`;
    sections.forEach((section) => {
      const breakingCommits = section.commits.filter((commit) => commit.isBreaking);
      breakingCommits.forEach((commit) => {
        output += `${formatCommit(commit, repoUrl)}\n`;
      });
    });
    output += `\n`;
  }

  // Add each section
  sections.forEach((section) => {
    // Skip empty sections
    const filteredCommits = section.commits.filter(
      (commit) => !commit.isBreaking || hasBreakingChanges,
    );
    if (filteredCommits.length === 0) return;

    output += `### ${section.title}\n\n`;

    filteredCommits.forEach((commit) => {
      output += `${formatCommit(commit, repoUrl)}\n`;
    });

    output += `\n`;
  });

  return output;
}

/**
 * Creates or updates CHANGELOG.md
 */
async function updateChangelogFile(changelogContent: string, changelogPath: string): Promise<void> {
  // Read existing changelog
  let existingContent = '';
  if (existsSync(changelogPath)) {
    existingContent = readFileSync(changelogPath, 'utf-8');
  } else {
    existingContent = '# Changelog\n';
  }

  // For new changelog, just create it
  if (existingContent === '# Changelog\n' || !existingContent.includes('# Changelog')) {
    writeFileSync(changelogPath, `# Changelog\n\n${changelogContent}`, 'utf-8');
    return;
  }

  // For existing changelog, insert after the header
  const updatedContent = existingContent.replace(
    /# Changelog\s+/,
    `# Changelog\n\n${changelogContent}`,
  );

  writeFileSync(changelogPath, updatedContent, 'utf-8');
}

/**
 * Changelog command implementation
 */
export async function changelog(options: ChangelogOptions = {}): Promise<void> {
  const {
    cwd = process.cwd(),
    beautify = false,
    commit = false,
    gitPush: shouldPush = false,
    attachAuthor = false,
    authorNameType = 'name',
    useAi = false,
    model,
    apiKey,
    baseURL,
    provider,
    tagPrefix = 'v',
    dryRun = false,
    filterScopes = [],
    filterTypes = ['feat', 'fix'], // Default to showing only features and fixes
  } = options;

  let { version } = options;

  // Try to get version from package.json if not provided
  if (!version) {
    const config = resolveWorkspaceConfig(cwd);
    version = config.rootPackageJson.version;

    if (!version) {
      throw new Error('Version is required for changelog generation');
    }
  }

  const changelogPath = join(cwd, 'CHANGELOG.md');
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  // If AI generation is specified, use that path
  if (useAi) {
    logger.info(`Generating changelog for ${version} using AI...`);
    const generator = new AIChangelogGenerator(cwd, tagPrefix, {
      provider: provider as ModelProviderName,
      id: model,
      apiKey,
      baseURL,
    });

    try {
      // Generate and write changelog
      const newContent = await generator.generate(version);
      if (!dryRun) {
        await generator.updateChangelogFile(version, newContent, changelogPath);
      } else {
        logger.info(`[dry-run] Would update changelog with AI-generated content`);
        console.log('\n--- AI Generated Changelog Preview ---\n');
        console.log(newContent);
        console.log('\n--- End of Preview ---\n');
      }
    } catch (error) {
      logger.error(`Error generating AI changelog: ${(error as Error).message}`);
      logger.warn('Falling back to manual changelog generation...');
      // Continue execution to fall back to manual generation
    }
  } else {
    // Regular changelog generation
    const repoUrl = await getRepositoryUrl(cwd);
    const currentTag = `${tagPrefix}${version}`;
    const previousTag = await getPreviousTag(version, tagPrefix, cwd);

    // Check if current tag exists
    let currentRef = currentTag;
    try {
      await execa('git', ['rev-parse', '--verify', currentTag], { cwd });
    } catch {
      // Tag doesn't exist, use HEAD instead
      currentRef = 'HEAD';
      logger.info(`Tag ${currentTag} doesn't exist, using HEAD instead`);
    }

    logger.info(`📝 Generating changelog from ${previousTag || 'initial commit'} to ${currentRef}`);

    // Check if both tags exist
    if (previousTag) {
      try {
        await execa('git', ['rev-parse', '--verify', previousTag], { cwd });
        logger.info(`✅ Previous tag ${previousTag} exists`);
      } catch {
        logger.error(`❌ Previous tag ${previousTag} does not exist in repository`);
        throw new Error(`Previous tag ${previousTag} not found`);
      }
    }

    try {
      await execa('git', ['rev-parse', '--verify', currentRef], { cwd });
      logger.info(`✅ Current ref ${currentRef} exists`);
    } catch {
      logger.error(`❌ Current ref ${currentRef} does not exist in repository`);
      throw new Error(`Current ref ${currentRef} not found`);
    }

    // Dynamically import tiny-conventional-commits-parser
    const { getRecentCommits } = await import('tiny-conventional-commits-parser');

    // Get commits between tags/refs
    logger.info(
      `🔍 Getting commits between ${previousTag || 'initial commit'} and ${currentRef}...`,
    );
    const commits = getRecentCommits(previousTag, currentRef);
    logger.info(`📊 Found ${commits.length} total commits`);

    if (commits.length > 0) {
      logger.info(`📋 Sample commits found:`);
      commits.slice(0, 3).forEach((commit, i) => {
        logger.info(
          `  ${i + 1}. ${commit.type}(${commit.scope || 'no-scope'}): ${commit.description} [${commit.shortHash}]`,
        );
      });
      if (commits.length > 3) {
        logger.info(`  ... and ${commits.length - 3} more commits`);
      }
    }

    logger.info(
      `🔧 Applying filters - types: [${filterTypes.join(', ')}], scopes: [${filterScopes.join(', ')}]`,
    );
    const filteredCommits = filterCommits(commits, filterTypes, filterScopes);
    logger.info(`📊 After filtering: ${filteredCommits.length} commits remain`);

    if (filteredCommits.length === 0) {
      logger.warn('⚠️  No commits found that match the filter criteria');
      if (commits.length > 0) {
        logger.info('💡 Available commit types in range:');
        const types = [...new Set(commits.map((c) => c.type))].sort();
        const scopes = [...new Set(commits.map((c) => c.scope).filter(Boolean))].sort();
        logger.info(`   Types: [${types.join(', ')}]`);
        logger.info(`   Scopes: [${scopes.join(', ')}]`);
      }
      if (dryRun) return;

      // Create minimal changelog entry
      const compareUrl = previousTag
        ? `${repoUrl}/compare/${previousTag}...${currentTag}`
        : `${repoUrl}/commits/${currentTag}`;

      const minimalContent = `## [${version}](${compareUrl}) (${today})\n\n`;
      await updateChangelogFile(minimalContent, changelogPath);
      logger.success('Created minimal changelog entry');
      return;
    }

    // Group and format commits
    const sections = groupCommitsByType(filteredCommits);
    const compareUrl = previousTag
      ? `${repoUrl}/compare/${previousTag}...${currentTag}`
      : `${repoUrl}/commits/${currentTag}`;

    const changelogContent = formatChangelog(sections, version, today, compareUrl, repoUrl);

    if (dryRun) {
      logger.info(`[dry-run] Would create changelog with content:`);
      console.log('\n--- Changelog Preview ---\n');
      console.log(changelogContent);
      console.log('\n--- End of Preview ---\n');
      return;
    }

    // Update changelog file
    await updateChangelogFile(changelogContent, changelogPath);
    logger.success('Changelog generated successfully!');
  }

  // Create a commit if requested
  if (commit && !dryRun) {
    await gitCommit(`chore(all): ${version} changelog`, cwd);
    logger.success('Committed changelog changes');
  } else if (commit && dryRun) {
    logger.info(`[dry-run] Would create commit: chore(all): ${version} changelog`);
  }

  // Push changes if requested
  if (shouldPush && !dryRun) {
    await gitPush(cwd);
    logger.success('Pushed changes to remote');
  } else if (shouldPush && dryRun) {
    logger.info(`[dry-run] Would push changes to remote`);
  }
}

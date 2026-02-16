#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const markdownTargets = [
  path.join(ROOT, "README.md"),
  path.join(ROOT, "apps/web/README.md"),
];

const uiRoots = [
  path.join(ROOT, "apps/web/app"),
  path.join(ROOT, "apps/web/components"),
];

const uiExtensions = new Set([".ts", ".tsx"]);
const brandingRegex = /stageos/gi;

function isMarkdownFence(line) {
  return line.trimStart().startsWith("```");
}

function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, "");
}

function isAllowedTechnicalContext(line, start, end) {
  const before = start > 0 ? line[start - 1] : "";
  const after = end < line.length ? line[end] : "";
  const separator = /[@\-_/.:]/;

  return separator.test(before) || separator.test(after);
}

function collectViolations(filePath, content, isMarkdown) {
  const lines = content.split(/\r?\n/);
  const violations = [];
  let inFence = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const originalLine = lines[lineIndex];

    if (isMarkdown && isMarkdownFence(originalLine)) {
      inFence = !inFence;
      continue;
    }

    if (isMarkdown && inFence) {
      continue;
    }

    const line = isMarkdown ? stripInlineCode(originalLine) : originalLine;

    for (const match of line.matchAll(brandingRegex)) {
      const matched = match[0];
      const start = match.index ?? 0;
      const end = start + matched.length;

      if (matched === "StageOS") {
        continue;
      }

      if (isAllowedTechnicalContext(line, start, end)) {
        continue;
      }

      violations.push({
        line: lineIndex + 1,
        column: start + 1,
        matched,
        excerpt: originalLine.trim(),
      });
    }
  }

  return violations;
}

async function listUiFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listUiFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && uiExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function getAllTargets() {
  const existingMarkdownTargets = [];

  for (const markdownTarget of markdownTargets) {
    try {
      await fs.access(markdownTarget);
      existingMarkdownTargets.push(markdownTarget);
    } catch {
      // Skip missing optional targets.
    }
  }

  const uiFiles = [];

  for (const uiRoot of uiRoots) {
    try {
      await fs.access(uiRoot);
      uiFiles.push(...(await listUiFiles(uiRoot)));
    } catch {
      // Skip missing optional roots.
    }
  }

  return {
    markdown: existingMarkdownTargets,
    ui: uiFiles,
  };
}

async function main() {
  const targets = await getAllTargets();
  const allViolations = [];

  for (const markdownPath of targets.markdown) {
    const content = await fs.readFile(markdownPath, "utf8");
    const violations = collectViolations(markdownPath, content, true);

    for (const violation of violations) {
      allViolations.push({ file: markdownPath, ...violation });
    }
  }

  for (const uiPath of targets.ui) {
    const content = await fs.readFile(uiPath, "utf8");
    const violations = collectViolations(uiPath, content, false);

    for (const violation of violations) {
      allViolations.push({ file: uiPath, ...violation });
    }
  }

  if (allViolations.length === 0) {
    console.log("Branding check passed: StageOS casing is consistent in docs and UI copy.");
    return;
  }

  console.error("Branding check failed. Use `StageOS` casing for brand text.");

  for (const violation of allViolations) {
    const relativePath = path.relative(ROOT, violation.file);
    console.error(
      `${relativePath}:${violation.line}:${violation.column} -> found \"${violation.matched}\" in \"${violation.excerpt}\"`,
    );
  }

  process.exitCode = 1;
}

await main();

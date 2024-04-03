import fs from 'fs';
import path from 'path';
import url from 'url';
import StackUtils from 'stack-utils';
import colors from 'colors/safe';
import { createHash } from 'crypto';

import type { TestCase, TestResult, TestError, Location } from 'playwright/types/testReporter';

type ErrorDetails = {
  message: string;
  location?: Location;
};
const stackUtils = new StackUtils({ internals: StackUtils.nodeInternals() });
const nodeInternals = StackUtils.nodeInternals();
const nodeMajorVersion = +process.versions.node.split('.')[0];

function belongsToNodeModules(file: string) {
  return file.includes(`${path.sep}node_modules${path.sep}`);
}
export function parseStackTraceLine(line: string): any | null {
  if (!process.env.PWDEBUGIMPL && nodeMajorVersion < 16 && nodeInternals.some(internal => internal.test(line)))
    return null;
  const frame = stackUtils.parseLine(line);
  if (!frame)
    return null;
  if (!process.env.PWDEBUGIMPL && (frame.file?.startsWith('internal') || frame.file?.startsWith('node:')))
    return null;
  if (!frame.file)
    return null;
  // ESM files return file:// URLs, see here: https://github.com/tapjs/stack-utils/issues/60
  const file = frame.file.startsWith('file://') ? url.fileURLToPath(frame.file) : path.resolve(process.cwd(), frame.file);
  return {
    file,
    line: frame.line || 0,
    column: frame.column || 0,
    function: frame.function,
  };
}

export function prepareErrorStack(stack: string): {
  message: string;
  stackLines: string[];
  location?: Location;
} {
  const lines = stack.split('\n');
  let firstStackLine = lines.findIndex(line => line.startsWith('    at '));
  if (firstStackLine === -1)
    firstStackLine = lines.length;
  const message = lines.slice(0, firstStackLine).join('\n');
  const stackLines = lines.slice(firstStackLine);
  let location: Location | undefined;
  for (const line of stackLines) {
    const frame = parseStackTraceLine(line);
    if (!frame || !frame.file)
      continue;
    if (belongsToNodeModules(frame.file))
      continue;
    location = { file: frame.file, column: frame.column || 0, line: frame.line || 0 };
    break;
  }
  return { message, stackLines, location };
}

export function formatError(error: TestError, highlightCode: boolean): ErrorDetails {
  const message = error.message || error.value || '';
  const stack = error.stack;
  if (!stack && !error.location)
    return { message };

  const tokens:any = [];

  // Now that we filter out internals from our stack traces, we can safely render
  // the helper / original exception locations.
  const parsedStack = stack ? prepareErrorStack(stack) : undefined;
  tokens.push(parsedStack?.message || message);

  if (error.snippet) {
    let snippet = error.snippet;
    if (!highlightCode)
      snippet = stripAnsiEscapes(snippet);
    tokens.push('');
    tokens.push(snippet);
  }

  if (parsedStack && parsedStack.stackLines.length) {
    tokens.push('');
    tokens.push(colors.dim(parsedStack.stackLines.join('\n')));
  }

  let location = error.location;
  if (parsedStack && !location)
    location = parsedStack.location;

  return {
    location,
    message: tokens.join('\n'),
  };
}
function indent(lines: string, tab: string) {
  return lines.replace(/^(?=.+$)/gm, tab);
}
export function formatResultFailure(test: TestCase, result: TestResult, initialIndent: string, highlightCode: boolean): ErrorDetails[] {
  const errorDetails: ErrorDetails[] = [];

  if (result.status === 'passed' && test.expectedStatus === 'failed') {
    errorDetails.push({
      message: indent(colors.red(`Expected to fail, but passed.`), initialIndent),
    });
  }
  if (result.status === 'interrupted') {
    errorDetails.push({
      message: indent(colors.red(`Test was interrupted.`), initialIndent),
    });
  }

  for (const error of result.errors) {
    const formattedError = formatError(error, highlightCode);
    errorDetails.push({
      message: indent(formattedError.message, initialIndent),
      location: formattedError.location,
    });
  }
  return errorDetails;
}
const ansiRegex = new RegExp('([\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])))', 'g');
export function stripAnsiEscapes(str: string): string {
  return str.replace(ansiRegex, '');
}
const folderToPackageJsonPath = new Map<string, string>();
export function getPackageJsonPath(folderPath: string): string {
  const cached = folderToPackageJsonPath.get(folderPath);
  if (cached !== undefined)
    return cached;

  const packageJsonPath = path.join(folderPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    folderToPackageJsonPath.set(folderPath, packageJsonPath);
    return packageJsonPath;
  }

  const parentFolder = path.dirname(folderPath);
  if (folderPath === parentFolder) {
    folderToPackageJsonPath.set(folderPath, '');
    return '';
  }

  const result = getPackageJsonPath(parentFolder);
  folderToPackageJsonPath.set(folderPath, result);
  return result;
}


export function calculateSha1(buffer: Buffer | string): string {
  const hash = createHash('sha1');
  hash.update(buffer);
  return hash.digest('hex');
}

export function sanitizeForFilePath(s: string) {
  return s.replace(/[\x00-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g, '-');
}

export function toPosixPath(aPath: string): string {
  return aPath.split(path.sep).join(path.posix.sep);
}

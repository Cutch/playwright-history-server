/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import path from 'path';
import { codeFrameColumns } from '@babel/code-frame';
import type { FullResult, FullConfig, Location, Suite, TestCase as TestCasePublic, TestResult as TestResultPublic, TestStep as TestStepPublic, TestError } from 'playwright/types/testReporter';
import { calculateSha1, sanitizeForFilePath, toPosixPath, formatError, formatResultFailure, stripAnsiEscapes } from './utils';
import type { Metadata } from 'playwright/types/test';
import type { Reporter } from '@playwright/test/reporter';
import yazl, { ZipFile } from 'yazl';
import mime from 'mime';
import type { TestCase, TestResult, TestStep, HTMLReport, Stats, TestAttachment, TestCaseSummary, TestFile, TestFileSummary } from '../html-reporter/src/types';
import { MultiMap } from './multimap';
const defaultHeaders = {
  'Content-Type': 'application/json',
};
type TestEntry = {
  testCase: TestCase;
  testCaseSummary: TestCaseSummary
};

class SummaryHtmlReporter implements Reporter {
  private config!: FullConfig;
  private suite!: Suite;
  private _buildResult: { ok: boolean, singleTestId: string | undefined, htmlReport: HTMLReport } | undefined;
  private _topLevelErrors: TestError[] = [];
  private _runName: string;

  constructor(options) {
    process.env.ENVIRONMENT ||= options.environment;
    process.env.API ||= options.api;
  }

  printsToStdio() {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite) {
    if(!process.env.ENVIRONMENT)
      throw new Error('Missing environment variable ENVIRONMENT Ex. ENVIRONMENT=prod')
    if(process.env.ENVIRONMENT.length > 64)
      throw new Error('Environment variable ENVIRONMENT must be less than 64 characters')
    if(!process.env.API)
      throw new Error('Missing environment variable API. Ex. API=http://playwright.example.com')

    this.config = config;
    this.suite = suite;
  }

  onError(error: TestError): void {
    this._topLevelErrors.push(error);
  }

  async onEnd(result: FullResult) {
    let dateString = result.startTime.toISOString().replace(/:/g, '-').split('T').join('_')
    dateString = dateString.slice(0, dateString.indexOf('Z'))
    this._runName = `run_${dateString}`
    console.log(`report_url: ${process.env.API}/${process.env.ENVIRONMENT}/${this._runName}`);
    const projectSuites = this.suite.suites;
    const data: any[] = [];
    const builder = new HtmlBuilder(this._runName, this.config);
    this._buildResult = await builder.build(this.config.metadata, projectSuites, result, this._topLevelErrors);

    const tests = this._buildResult.htmlReport.files.reduce<{test:TestCaseSummary, file:TestFileSummary}[]>((t,a)=>[...t, ...a.tests.map((t)=>({test:t,file:a}))], [])

    tests.forEach(({test, file})=>{
      const path = file.fileName.split(/\/|\\/)
      const fileName = path[path.length - 1]
      data.push({title: test.title,
        testId: test.testId,
        file: fileName,
        run: this._runName,
        environment: process.env.ENVIRONMENT,
        outcome: test.outcome,
        projectName: test.projectName,
        startTime: result.startTime})
    })
    console.log(await (await fetch(`${process.env.API}/api/history/bulk`, {
      method: 'POST',
      body: JSON.stringify({ data }),
      headers:defaultHeaders })).json())
  }
}

class HtmlBuilder {
  private _config: FullConfig;
  private _stepsInFile = new MultiMap<string, TestStep>();
  private _dataZipFile: ZipFile;
  private _hasTraces = false;
  private _projectToId: Map<Suite, number> = new Map();
  private _lastProjectId = 0;
  private _runName: string;

  constructor(runName: string, config: FullConfig) {
    this._runName = runName;
    this._config = config;
    this._dataZipFile = new yazl.ZipFile();
  }

  async build(metadata: Metadata, projectSuites: Suite[], result: FullResult, topLevelErrors: TestError[]): Promise<{ ok: boolean, singleTestId: string | undefined, htmlReport: HTMLReport }> {
    const data = new Map<string, { testFile: TestFile, testFileSummary: TestFileSummary }>();
    for (const projectSuite of projectSuites) {
      const testDir = projectSuite.project()!.testDir;
      for (const fileSuite of projectSuite.suites) {
        const fileName = this._relativeLocation(fileSuite.location)!.file;
        // Preserve file ids computed off the testDir.
        const relativeFile = path.relative(testDir, fileSuite.location!.file);
        const fileId = calculateSha1(toPosixPath(relativeFile)).slice(0, 20);
        let fileEntry = data.get(fileId);
        if (!fileEntry) {
          fileEntry = {
            testFile: { fileId, fileName, tests: [] },
            testFileSummary: { fileId, fileName, tests: [], stats: emptyStats() },
          };
          data.set(fileId, fileEntry);
        }
        const { testFile, testFileSummary } = fileEntry;
        const testEntries: TestEntry[] = [];
        await this._processJsonSuite(fileSuite, fileId, projectSuite.project()!.name, [], testEntries);
        for (const test of testEntries) {
          testFile.tests.push(test.testCase);
          testFileSummary.tests.push(test.testCaseSummary);
        }
      }
    }
    createSnippets(this._stepsInFile);

    let ok = true;
    for (const [fileId, { testFile, testFileSummary }] of data) {
      const stats = testFileSummary.stats;
      for (const test of testFileSummary.tests) {
        if (test.outcome === 'expected')
          ++stats.expected;
        if (test.outcome === 'skipped')
          ++stats.skipped;
        if (test.outcome === 'unexpected')
          ++stats.unexpected;
        if (test.outcome === 'flaky')
          ++stats.flaky;
        ++stats.total;
      }
      stats.ok = stats.unexpected + stats.flaky === 0;
      if (!stats.ok)
        ok = false;

      const testCaseSummaryComparator = (t1: TestCaseSummary, t2: TestCaseSummary) => {
        const w1 = (t1.outcome === 'unexpected' ? 1000 : 0) +  (t1.outcome === 'flaky' ? 1 : 0);
        const w2 = (t2.outcome === 'unexpected' ? 1000 : 0) +  (t2.outcome === 'flaky' ? 1 : 0);
        return w2 - w1;
      };
      testFileSummary.tests.sort(testCaseSummaryComparator);

      this._addDataFile(fileId + '.json', testFile);
    }
    const htmlReport: HTMLReport = {
      metadata,
      startTime: result.startTime.getTime(),
      duration: result.duration,
      files: [...data.values()].map(e => e.testFileSummary),
      projectNames: projectSuites.map(r => r.project()!.name),
      stats: { ...[...data.values()].reduce((a, e) => addStats(a, e.testFileSummary.stats), emptyStats()) },
      errors: topLevelErrors.map(error => formatError(error, true).message),
      env: process.env.ENVIRONMENT as string,
      runName: this._runName
    };
    htmlReport.files.sort((f1, f2) => {
      const w1 = f1.stats.unexpected * 1000 + f1.stats.flaky;
      const w2 = f2.stats.unexpected * 1000 + f2.stats.flaky;
      return w2 - w1;
    });

    this._addDataFile('report.json', htmlReport);

    // Copy app.
    // const appFolder = path.join(require.resolve('playwright-core'), '..', 'lib', 'vite', 'htmlReport');
    // await copyFileAndMakeWritable(path.join(appFolder, 'index.html'), path.join(this._reportFolder, 'index.html'));

    // Copy trace viewer.
    // if (this._hasTraces) {
    //   const traceViewerFolder = path.join(require.resolve('playwright-core'), '..', 'lib', 'vite', 'traceViewer');
    //   const traceViewerTargetFolder = path.join(this._reportFolder, 'trace');
    //   const traceViewerAssetsTargetFolder = path.join(traceViewerTargetFolder, 'assets');
    //   fs.mkdirSync(traceViewerAssetsTargetFolder, { recursive: true });
    //   for (const file of fs.readdirSync(traceViewerFolder)) {
    //     if (file.endsWith('.map') || file.includes('watch') || file.includes('assets'))
    //       continue;
    //     await copyFileAndMakeWritable(path.join(traceViewerFolder, file), path.join(traceViewerTargetFolder, file));
    //   }
    //   for (const file of fs.readdirSync(path.join(traceViewerFolder, 'assets'))) {
    //     if (file.endsWith('.map') || file.includes('xtermModule'))
    //       continue;
    //     await copyFileAndMakeWritable(path.join(traceViewerFolder, 'assets', file), path.join(traceViewerAssetsTargetFolder, file));
    //   }
    // }

    // Inline report data.
    // const indexFile = path.join(this._reportFolder, 'report.zip');
    await new Promise((resolve) => {
      this._dataZipFile!.end(undefined, async () => {
        if(this._dataZipFile){
          // const b: Buffer = Buffer.from(this._dataZipFile.outputStream.read())
          // const blob = new Blob([b], {type: 'application/x-zip'})
          // form.append('report.zip', blob)

          const chunks: any = [];
          for await (let chunk of this._dataZipFile.outputStream) {
            chunks.push(chunk);
          }
          const form = new FormData()
          form.append('file',new Blob([Buffer.concat(chunks)]),'report.zip')
          await (await fetch(`${process.env.API}/api/upload?runName=${this._runName}&environment=${process.env.ENVIRONMENT}`, {
            method: 'POST',
            body: form,
            // headers:{
            //   'Content-Type': 'application/x-zip',
            // }
           })).json()
              // .pipe(fs.createWriteStream(indexFile)).on('close', f);
          resolve(null);
        }else{
          resolve(null);
        }
      });
    });

    let singleTestId: string | undefined;
    if (htmlReport.stats.total === 1) {
      const testFile: TestFile  = data.values().next().value.testFile;
      singleTestId = testFile.tests[0].testId;
    }

    return { ok, singleTestId, htmlReport };
  }

  private _addDataFile(fileName: string, data: any) {
    this._dataZipFile.addBuffer(Buffer.from(JSON.stringify(data)), fileName);
  }

  private async _processJsonSuite(suite: Suite, fileId: string, projectName: string, path: string[], outTests: TestEntry[]) {
    const newPath = [...path, suite.title];
    await Promise.all(suite.suites.map(async s => await this._processJsonSuite(s, fileId, projectName, newPath, outTests)));
    await Promise.all(suite.tests.map(async t => outTests.push(await this._createTestEntry(fileId, t, projectName, newPath))));
  }

  private async _createTestEntry(fileId: string, test: TestCasePublic, projectName: string, path: string[]): Promise<TestEntry> {
    const duration = test.results.reduce((a, r) => a + r.duration, 0);
    const location = this._relativeLocation(test.location)!;
    path = path.slice(1);

    const [file, ...titles] = test.titlePath();
    const testIdExpression = `[project=${this._projectId(test.parent)}]${toPosixPath(file)}\x1e${titles.join('\x1e')} (repeat:${test.repeatEachIndex})`;
    const testId = fileId + '-' + calculateSha1(testIdExpression).slice(0, 20);

    const results = await Promise.all(test.results.map(r => this._createTestResult(test, r)));

    return {
      testCase: {
        testId,
        title: test.title,
        projectName,
        location,
        duration,
        // Annotations can be pushed directly, with a wrong type.
        annotations: test.annotations.map(a => ({ type: a.type, description: a.description ? String(a.description) : a.description })),
        tags: test.tags,
        outcome: test.outcome(),
        path,
        results,
        ok: test.outcome() === 'expected' || test.outcome() === 'flaky',
      },
      testCaseSummary: {
        testId,
        title: test.title,
        projectName,
        location,
        duration,
        // Annotations can be pushed directly, with a wrong type.
        annotations: test.annotations.map(a => ({ type: a.type, description: a.description ? String(a.description) : a.description })),
        tags: test.tags,
        outcome: test.outcome(),
        path,
        ok: test.outcome() === 'expected' || test.outcome() === 'flaky',
        results: results.map(result => {
          return { attachments: result.attachments.map(a => ({ name: a.name, contentType: a.contentType, path: a.path })) };
        }),
      },
    };
  }

  private _projectId(suite: Suite): number {
    const project = projectSuite(suite);
    let id = this._projectToId.get(project);
    if (!id) {
      id = ++this._lastProjectId;
      this._projectToId.set(project, id);
    }
    return id;
  }

  private async _serializeAttachments(attachments: JsonAttachment[]): Promise<TestAttachment[]> {
    let lastAttachment: TestAttachment | undefined;
    return (await Promise.all(attachments.map(async a => {
      const baseUrl = `${process.env.API}/${process.env.ENVIRONMENT}/${this._runName}/`
      if (a.name === 'trace')
        this._hasTraces = true;

      if ((a.name === 'stdout' || a.name === 'stderr') && a.contentType === 'text/plain') {
        if (lastAttachment &&
          lastAttachment.name === a.name &&
          lastAttachment.contentType === a.contentType) {
          lastAttachment.body += stripAnsiEscapes(a.body as string);
          return null;
        }
        a.body = stripAnsiEscapes(a.body as string);
        lastAttachment = a as TestAttachment;
        return a;
      }

      if (a.path) {
        let fileName = a.path;
        try {
          const buffer = fs.readFileSync(a.path);
          const sha1 = calculateSha1(buffer) + path.extname(a.path);
          fileName = baseUrl + sha1;
          const form = new FormData()
          form.append('file',new Blob([buffer]),fileName)

          await (await fetch(`${process.env.API}/api/upload?runName=${this._runName}&environment=${process.env.ENVIRONMENT}`, {
            method: 'POST',
            body: form})).json()
        } catch (e) {
        }
        return {
          name: a.name,
          contentType: a.contentType,
          path: fileName,
          body: a.body,
        };
      }

      if (a.body instanceof Buffer) {
        if (isTextContentType(a.contentType)) {
          // Content type is like this: "text/html; charset=UTF-8"
          const charset = a.contentType.match(/charset=(.*)/)?.[1];
          try {
            const body = a.body.toString(charset as any || 'utf-8');
            return {
              name: a.name,
              contentType: a.contentType,
              body,
            };
          } catch (e) {
            // Invalid encoding, fall through and save to file.
          }
        }

        // fs.mkdirSync(path.join(this._reportFolder, 'data'), { recursive: true });
        const extension = sanitizeForFilePath(path.extname(a.name).replace(/^\./, '')) || mime.getExtension(a.contentType) || 'dat';
        const sha1 = calculateSha1(a.body) + '.' + extension;
        const form = new FormData()
        form.append('file',new Blob([a.body]),sha1)
        await (await fetch(`${process.env.API}/api/upload?runName=${this._runName}&environment=${process.env.ENVIRONMENT}`, {
          method: 'POST',
          body: form})).json()

        return {
          name: a.name,
          contentType: a.contentType,
          path: baseUrl + sha1,
        };
      }

      // string
      return {
        name: a.name,
        contentType: a.contentType,
        body: a.body,
      };
    }))).filter(Boolean) as TestAttachment[];
  }

  private async _createTestResult(test: TestCasePublic, result: TestResultPublic): Promise<TestResult> {
    return {
      duration: result.duration,
      startTime: result.startTime.toISOString(),
      retry: result.retry,
      steps: dedupeSteps(result.steps).map(s => this._createTestStep(s)),
      errors: formatResultFailure(test, result, '', true).map(error => error.message),
      status: result.status,
      attachments: await this._serializeAttachments([
        ...result.attachments,
        ...result.stdout.map(m => stdioAttachment(m, 'stdout')),
        ...result.stderr.map(m => stdioAttachment(m, 'stderr'))]),
    };
  }

  private _createTestStep(dedupedStep: DedupedStep): TestStep {
    const { step, duration, count } = dedupedStep;
    const result: TestStep = {
      title: step.title,
      startTime: step.startTime.toISOString(),
      duration,
      steps: dedupeSteps(step.steps).map(s => this._createTestStep(s)),
      location: this._relativeLocation(step.location),
      error: step.error?.message,
      count
    };
    if (result.location)
      this._stepsInFile.set(result.location.file, result);
    return result;
  }

  _relativeLocation(location: Location | undefined): Location | undefined {
    if (!location)
      return undefined;
    const file = toPosixPath(path.relative(this._config.rootDir, location.file));
    return {
      file,
      line: location.line,
      column: location.column,
    };
  }
}

const emptyStats = (): Stats => {
  return {
    total: 0,
    expected: 0,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
    ok: true,
  };
};

const addStats = (stats: Stats, delta: Stats): Stats => {
  stats.total += delta.total;
  stats.skipped += delta.skipped;
  stats.expected += delta.expected;
  stats.unexpected += delta.unexpected;
  stats.flaky += delta.flaky;
  stats.ok = stats.ok && delta.ok;
  return stats;
};

function isTextContentType(contentType: string) {
  return contentType.startsWith('text/') || contentType.startsWith('application/json');
}

type JsonAttachment = {
  name: string;
  body?: string | Buffer;
  path?: string;
  contentType: string;
};

function stdioAttachment(chunk: Buffer | string, type: 'stdout' | 'stderr'): JsonAttachment {
  if (typeof chunk === 'string') {
    return {
      name: type,
      contentType: 'text/plain',
      body: chunk
    };
  }
  return {
    name: type,
    contentType: 'application/octet-stream',
    body: chunk
  };
}

type DedupedStep = { step: TestStepPublic, count: number, duration: number };

function dedupeSteps(steps: TestStepPublic[]) {
  const result: DedupedStep[] = [];
  let lastResult: DedupedStep|undefined = undefined;
  for (const step of steps) {
    const canDedupe = !step.error && step.duration >= 0 && step.location?.file && !step.steps.length;
    const lastStep = lastResult?.step;
    if (canDedupe && lastResult && lastStep && step.category === lastStep.category && step.title === lastStep.title && step.location?.file === lastStep.location?.file && step.location?.line === lastStep.location?.line && step.location?.column === lastStep.location?.column) {
      ++lastResult.count;
      lastResult.duration += step.duration;
      continue;
    }
    lastResult = { step, count: 1, duration: step.duration };
    result.push(lastResult);
    if (!canDedupe)
      lastResult = undefined;
  }
  return result;
}

function createSnippets(stepsInFile: MultiMap<string, TestStep>) {
  for (const file of stepsInFile.keys()) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8') + '\n//';
    } catch (e) {
      continue;
    }
    const lines = source.split('\n').length;
    const highlighted = codeFrameColumns(source, { start: { line: lines, column: 1 } }, { highlightCode: true, linesAbove: lines, linesBelow: 0 });
    const highlightedLines = highlighted.split('\n');
    const lineWithArrow = highlightedLines[highlightedLines.length - 1];
    for (const step of stepsInFile.get(file)) {
      // Don't bother with snippets that have less than 3 lines.
      if (step.location!.line < 2 || step.location!.line >= lines)
        continue;
      // Cut out snippet.
      const snippetLines = highlightedLines.slice(step.location!.line - 2, step.location!.line + 1);
      // Relocate arrow.
      const index = lineWithArrow.indexOf('^');
      const shiftedArrow = lineWithArrow.slice(0, index) + ' '.repeat(step.location!.column - 1) + lineWithArrow.slice(index);
      // Insert arrow line.
      snippetLines.splice(2, 0, shiftedArrow);
      step.snippet = snippetLines.join('\n');
    }
  }
}

function projectSuite(suite: Suite): Suite {
  while (suite.parent?.parent)
    suite = suite.parent;
  return suite;
}

export default SummaryHtmlReporter;

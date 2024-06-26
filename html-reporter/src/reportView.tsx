/*
  Copyright (c) Microsoft Corporation.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import type { CommentsStatus, FilteredStats, HTMLReport, TestCase, TestFile, TestFileSummary } from './types';
import * as React from 'react';
import './colors.css';
import './common.css';
import { Filter } from './filter';
import { HeaderView } from './headerView';
import { Route } from './links';
import type { LoadedReport } from './loadedReport';
import './reportView.css';
import type { Metainfo } from './metadataView';
import { MetadataView } from './metadataView';
import { TestCaseView } from './testCaseView';
import { TestFilesView } from './testFilesView';
import './theme.css';
import { CommentsSideBar } from './commentsSideBar';
import { eventDispatch, generateURL, useEventListener } from './uiUtils';


// These are extracted to preserve the function identity between renders to avoid re-triggering effects.
const testFilesRoutePredicate = (params: URLSearchParams) => !params.has('testId');
const testCaseRoutePredicate = (params: URLSearchParams) => params.has('testId');
export const CommentsStatusContext = React.createContext<CommentsStatus[]>([]);
export const ReportContext = React.createContext<HTMLReport|null>(null);

export const ReportView: React.FC<{
  report: LoadedReport | undefined,
}> = ({ report }) => {
  const searchParams = new URLSearchParams(window.location.hash.slice(1));
  const [expandedFiles, setExpandedFiles] = React.useState<Map<string, boolean>>(new Map());
  const [filterText, setFilterText] = React.useState(searchParams.get('q') || '');
  const htmlReport = report?.json()

  const filter = React.useMemo(() => Filter.parse(filterText), [filterText]);
  const filteredStats = React.useMemo(() => computeStats(htmlReport?.files || [], filter), [report, filter]);
  const [comments, setComments] = React.useState<CommentsStatus[]>([])
const getComments = ()=>{
  if(htmlReport){
    fetch(generateURL(`/api/comment/run-comments`, {
      environment: htmlReport.env
    }), {method: 'GET'})
    .then((res)=>res.json())
    .then(({results})=>setComments(results||[]))
    .catch(console.error)
  }
}
  React.useEffect(()=>{
    getComments()
    // @ts-ignore
    ClassicEditor.defaultConfig = {
      toolbar: {
        items: [
          'undo',
          'redo',
          '|',
          'bold',
          'italic',
          '|',
          'link',
          'bulletedList',
          'numberedList',
          'blockQuote',
          'Indent',
        ]
      },
      language: 'en'
    };
  }, [htmlReport])
  React.useEffect(()=>{
    const inter = setInterval(()=>{
      eventDispatch('addComment')
    }, 180000)
    return ()=>{
      clearInterval(inter)
    }
  },[])

  useEventListener('addComment', getComments, [htmlReport])
  useEventListener('resolveComment', getComments, [htmlReport])

  return <div className='htmlreport pb-4'>
    <ReportContext.Provider value={htmlReport||null}>
      <CommentsStatusContext.Provider value={comments}>
        <main>
          {htmlReport && <HeaderView stats={htmlReport.stats} filterText={filterText} setFilterText={setFilterText}></HeaderView>}
          {htmlReport?.metadata && <MetadataView {...htmlReport?.metadata as Metainfo} />}
          <Route predicate={testFilesRoutePredicate}>
            <TestFilesView
              report={htmlReport}
              filter={filter}
              expandedFiles={expandedFiles}
              setExpandedFiles={setExpandedFiles}
              projectNames={htmlReport?.projectNames || []}
              filteredStats={filteredStats}
            />
          </Route>
          <Route predicate={testCaseRoutePredicate}>
            {!!report && <TestCaseViewLoader report={report}></TestCaseViewLoader>}
          </Route>
        </main>
        <CommentsSideBar report={htmlReport} />
      </CommentsStatusContext.Provider>
    </ReportContext.Provider>
  </div>;ReportContext
};

const TestCaseViewLoader: React.FC<{
  report: LoadedReport,
}> = ({ report }) => {
  const searchParams = new URLSearchParams(window.location.hash.slice(1));
  const [test, setTest] = React.useState<TestCase | undefined>();
  const testId = searchParams.get('testId');
  const anchor = (searchParams.get('anchor') || '') as 'video' | 'diff' | '';
  const run = +(searchParams.get('run') || '0');
  React.useEffect(() => {
    (async () => {
      if (!testId || testId === test?.testId)
        return;
      const fileId = testId.split('-')[0];
      if (!fileId)
        return;
      const file = await report.entry(`${fileId}.json`) as TestFile;
      for (const t of file.tests) {
        if (t.testId === testId) {
          setTest(t);
          break;
        }
      }
    })();
  }, [test, report, testId]);
  return <TestCaseView projectNames={report.json().projectNames} test={test} anchor={anchor} run={run}></TestCaseView>;
};

function computeStats(files: TestFileSummary[], filter: Filter): FilteredStats {
  const stats: FilteredStats = {
    total: 0,
    duration: 0,
  };
  for (const file of files) {
    const tests = file.tests.filter(t => filter.matches(t));
    stats.total += tests.length;
    for (const test of tests)
      stats.duration += test.duration;
  }
  return stats;
}

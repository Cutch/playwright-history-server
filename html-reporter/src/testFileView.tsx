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

import type { HTMLReport, TestCaseSummary, TestFileSummary } from './types';
import * as React from 'react';
import { eventDispatch, generateURL, msToString, useEventListener } from './uiUtils';
import { Chip } from './chip';
import type { Filter } from './filter';
import { generateTraceUrl, Link, navigate, ProjectLink } from './links';
import { statusIcon } from './statusIcon';
import './testFileView.css';
import { video, image, trace } from './icons';
import { hashStringToInt } from './labelUtils';
import { TestHistoryView } from './testHistoryView';

function imageDiffBadge(test: TestCaseSummary): JSX.Element | undefined {
  const resultWithImageDiff = test.results.find(result => result.attachments.some(attachment => {
    return attachment.contentType.startsWith('image/') && !!attachment.name.match(/-(expected|actual|diff)/);
  }));
  return resultWithImageDiff ? <Link href={`#?testId=${test.testId}&anchor=diff&run=${test.results.indexOf(resultWithImageDiff)}`} title='View images' className='test-file-badge'>{image()}</Link> : undefined;
}

function videoBadge(test: TestCaseSummary): JSX.Element | undefined {
  const resultWithVideo = test.results.find(result => result.attachments.some(attachment => attachment.name === 'video'));
  return resultWithVideo ? <Link href={`#?testId=${test.testId}&anchor=video&run=${test.results.indexOf(resultWithVideo)}`} title='View video' className='test-file-badge'>{video()}</Link> : undefined;
}

function traceBadge(test: TestCaseSummary): JSX.Element | undefined {
  const firstTraces = test.results.map(result => result.attachments.filter(attachment => attachment.name === 'trace')).filter(traces => traces.length > 0)[0];
  return firstTraces ? <Link href={generateTraceUrl(firstTraces)} title='View trace' className='test-file-badge'>{trace()}</Link> : undefined;
}

export const TestFileView: React.FC<React.PropsWithChildren<{
  report: HTMLReport;
  file: TestFileSummary;
  isFileExpanded: (fileId: string) => boolean;
  setFileExpanded: (fileId: string, expanded: boolean) => void;
  filter: Filter;
}>> = ({ file, report, isFileExpanded, setFileExpanded, filter }) => {

  const [history, setHistory] = React.useState(null)
  React.useEffect(()=>{
    fetch(generateURL(`/api/history`, {
      run: report.runName, environment: report.env, file: file.fileName
    }), {method: 'GET'})
    .then((res)=>res.json())
    .then(({results})=>setHistory(results||[]))
    .catch(console.error)
  }, [])

  const testGroups = React.useMemo(()=>
    file.tests
      .filter(t => filter.matches(t))
      .reduce((t: Map<string, TestCaseSummary[]>,a:TestCaseSummary)=>{
        const testName = [...a.path, a.title].join(' › ')
        if(!t.get(testName)) t.set(testName, []);
        t.get(testName)?.push(a);
        return t;
      }, new Map<string, TestCaseSummary[]>()),
    [filter, file])
  const stats = file.stats;
  const expanded = isFileExpanded(file.fileId)
  // @ts-ignore
  useEventListener('showComment', ({testName, runName})=>{
    if(testGroups.has(testName) && !expanded){
      setFileExpanded(file.fileId, true)
      setTimeout(()=>eventDispatch('showComment', {testName, runName}), 100)
    }
  },[expanded, testGroups])
  return <Chip
    expanded={expanded}
    noInsets={true}
    setExpanded={(expanded => setFileExpanded(file.fileId, expanded))}
    header={<>
        <span>{file.fileName}</span>
        <span style={{marginLeft: 'auto'}}></span>
        {stats.unexpected > 0 ? <span style={{marginLeft: 16}}>{statusIcon('unexpected')}<span className='d-inline counter'>{stats.unexpected}</span></span>:null}
        {stats.flaky > 0 ? <span style={{marginLeft: 16}}>{statusIcon('flaky')}<span className='d-inline counter'>{stats.flaky}</span></span>:null}
      </>
    }>
    {Array.from(testGroups.values()).map((tests:TestCaseSummary[], i) =>
      <div key={`test-${tests[0].testId}`} className={'test-file-test'}>{/*test-file-test-outcome-' + test.outcome*/}
        <div className='test-file-test-title'>
          <span className='test-file-title'>{[...tests[0].path, tests[0].title].join(' › ')}</span>
          <LabelsClickView labels={tests[0].tags} />
        </div>
        <div className='test-file-history-section'>
            <TestHistoryView tests={tests} history={history} />
        </div>
        {tests.map((test)=>
          <div key={test.testId}>
            {imageDiffBadge(test)}
            {videoBadge(test)}
            {traceBadge(test)}
          </div>
        )}
      </div>
    )}
  </Chip>;
};


const LabelsClickView: React.FC<React.PropsWithChildren<{
  labels: string[],
}>> = ({ labels }) => {

  const onClickHandle = (e: React.MouseEvent, label: string) => {
    e.preventDefault();
    const searchParams = new URLSearchParams(window.location.hash.slice(1));
    let q = searchParams.get('q')?.toString() || '';

    // If metaKey or ctrlKey is pressed, add tag to search query without replacing existing tags.
    // If metaKey or ctrlKey is pressed and tag is already in search query, remove tag from search query.
    if (e.metaKey || e.ctrlKey) {
      if (!q.includes(label))
        q = `${q} ${label}`.trim();
      else
        q = q.split(' ').filter(t => t !== label).join(' ').trim();
    } else {
      // if metaKey or ctrlKey is not pressed, replace existing tags with new tag
      if (!q.includes('@'))
        q = `${q} ${label}`.trim();
      else
        q = (q.split(' ').filter(t => !t.startsWith('@')).join(' ').trim() + ` ${label}`).trim();
    }
    navigate(q ? `#?q=${q}` : '#');
  };

  return labels.length > 0 ? (
    <>
      {labels.map(label => (
        <span key={label} style={{ margin: '6px 0 0 6px', cursor: 'pointer' }} className={'label label-color-' + (hashStringToInt(label))} onClick={e => onClickHandle(e, label)}>
          {label.slice(1)}
        </span>
      ))}
    </>
  ) : null;
};

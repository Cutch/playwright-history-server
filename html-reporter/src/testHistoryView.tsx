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
import * as React from 'react';
import './testHistoryView.css';
import {  TestCaseSummary } from './types';
import { resolutionIcon, statusIcon } from './statusIcon';
import { msToString, useEventListener } from './uiUtils';
import { Link } from './links';
import { CommentsStatusContext } from './reportView';
import { TestPopup } from './testPopup';

export type HistoryOutcome = {
  run: string,
  testId: string,
  outcome: 'failed' | 'timedOut' | 'skipped' | 'passed' | 'expected' | 'unexpected' | 'flaky' | 'interrupted';
  time: Date;
};
export type History = {
  testName: string,
  projectName: string,
  startTime: Date,
  outcomeHistory: HistoryOutcome[];
};
export type Selection = {
  testName: string,
  run: string,
  projectTestIds: any
};
const outcomeToColor:any = {
  "passed": "#16772a",
  "expected": "#16772a",
  "flaky": "#776516",
  "failed": "#771616",
  "unexpected": "#771616",
  "skipped": "#166177",
  "timedOut": "#77166b",
  "interrupted": "#161c77"
}
export const TestHistoryView: React.FC<{
  tests: TestCaseSummary[],
  history: History[] | null
}> = ({ tests, history }) => {
  const [selectedValue, setSelectedValue] = React.useState<Selection|null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  const handleSelect = (testName: string, projectTestIds:any, run: string)=>{
    setSelectedValue({testName, projectTestIds:projectTestIds||{}, run})
  }
  const commentStatuses = React.useContext(CommentsStatusContext)

  const filteredHistory = React.useMemo(()=>
    history?.filter(h=>h.testName === tests[0].title)||[],
    [tests, history])

  const outcomeByRun = React.useMemo(()=>{
    const testOrder = tests
      .sort((a,b)=>a.projectName.localeCompare(b.projectName))
      .map((test)=>filteredHistory?.find(h=>h.projectName === test.projectName))
    return filteredHistory[0]?.outcomeHistory.map((x)=>{
      const targetRun = x.run
      return {
        run: x.run,
        testName: testOrder[0]?.testName,
        projectTestIds: testOrder.reduce((t, h)=>({
          ...t,
          [h?.projectName??'']: h?.outcomeHistory.find(h=>h.run===targetRun)?.testId??''
        }), {}),
        runOutcomes: testOrder.map(h=>({
          projectName: h?.projectName,
          historyOutcome: h?.outcomeHistory.find(h=>h.run===targetRun)
        }))
      }
    })||[]
  }, [filteredHistory])

  // @ts-ignore
  useEventListener('showComment', ({testName,runName})=>{
    if(testName === tests[0].title){
      const run = outcomeByRun.find(r=>r.run===runName)
      if(run){
        handleSelect(
          testName,
          run?.projectTestIds,
          runName)
        ref.current?.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
      }
    }
  },[])

  return <>
    <div className='test-history-container' ref={ref}>
      <div>
        {tests
          .sort((a,b)=>a.projectName.localeCompare(b.projectName))
          .map((test)=>
          <div key={test.testId}>
            <Link href={`#?testId=${test.testId}`} className="test-history-label" target='_blank'>
              {test.projectName}
            </Link>
            <span className="test-file-test-status-icon">
              {statusIcon(test.outcome)}
            </span>
            <span data-testid='test-duration' className='test-duration'>{msToString(test.duration)}</span>
          </div>
        )}
      </div>
      <div className='test-history-right-side'>
        <div className='test-history-timelines'>
          {outcomeByRun.map(({run, runOutcomes, testName, projectTestIds})=>{
            return testName && <div className='test-history-outcome' onClick={()=>handleSelect(testName, projectTestIds, run)}>
              {runOutcomes.map(({projectName, historyOutcome})=>{
                if(projectName && historyOutcome)
                  return <div
                    style={{backgroundColor: outcomeToColor[historyOutcome.outcome]}}
                    className={'test-history-nibs '+(testName === selectedValue?.testName && run === selectedValue?.run?'active':'')}
                    >&zwnj;</div>
              })}
            </div>
          })}
        </div>
        <div className='test-history-comments-timeline'>
          {outcomeByRun.map(({run, testName, projectTestIds}, i)=>{
            const comment = commentStatuses.find(cs=>cs.runName === run && cs.testName === testName)
            return comment && testName && <div
              onClick={()=>handleSelect(testName, projectTestIds, run)}
              className='test-history-comment'
              style={{left: `${5*i}px`}}>
              {resolutionIcon(comment?.status)}
            </div>
          })}
        </div>
      </div>
      {selectedValue && <TestPopup selectedValue={selectedValue} filteredHistory={filteredHistory} onClose={()=>setSelectedValue(null)}/>}
    </div>
  </>;
};


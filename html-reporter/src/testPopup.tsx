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
import './testPopup.css';
import { Comment } from './types';
import { statusIcon } from './statusIcon';
import { Link } from './links';
import { ReportContext } from './reportView';
import { AddComment } from './addComment';
import { History, Selection } from './testHistoryView';
import { eventDispatch, generateURL } from './uiUtils';
import { CommentCard } from './commentCard';


export const TestPopup: React.FC<{
  selectedValue: Selection
  filteredHistory: History[],
  onClose: Function
}> = ({ filteredHistory, selectedValue, onClose }) => {
  const popupRef = React.useRef<HTMLDivElement>(null)
  const [showAddComment, setShowAddComment] = React.useState(false)
  const [comments, setComments] = React.useState<Comment[]>([])

  React.useEffect(()=>{
    if(selectedValue){
      const clickListener = (event:any)=>{
        if(!popupRef.current?.contains(event.target)){
          onClose()
        }
      }
      document.addEventListener('mousedown', clickListener, true)
      return ()=>document.removeEventListener('mousedown', clickListener, true)
    }
  },[selectedValue])
  const report = React.useContext(ReportContext)
  const getComments = ()=>{
    if(report){
      fetch(generateURL(`/api/comment/test-comments`, {
        environment: report.env,
        testName: selectedValue.testName,
        runName: selectedValue.run
      }), {method: 'GET'})
      .then((res)=>res.json())
      .then(({results})=>setComments(results||[]))
      .catch(console.error)
    }
  }
  const toggleResolveComment = ()=>{
    if(report){
      fetch(`/api/comment/resolve`, {
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          id: comments[0].id,
          status: comments[0].status==='resolved'?'unresolved':'resolved'
        }),
        method: 'POST'})
      .then((res)=>res.json())
      .then(()=>{
        getComments();
        eventDispatch('resolveComment')
      })
      .catch(console.error)
    }
  }

  React.useEffect(()=>{
    getComments()
  }, [report])

  return <>
    {selectedValue && <div ref={popupRef} className='test-popup-info'>
      <Link href={`../${selectedValue.run}/index.html#?testId=${Object.values(selectedValue.projectTestIds)[0]}`} title={[selectedValue.run, selectedValue.testName].join(' › ')} className='test-popup-info-title' target='_blank'>
        {selectedValue.run}
      </Link>
      <div className='test-popup-info-status-lines'>
        {filteredHistory.map(({projectName, outcomeHistory}, i)=>{

          const outcome = outcomeHistory.find(({run})=>run===selectedValue.run)?.outcome
          return outcome ?<React.Fragment key={i}>
            <div>
              <Link href={`../${selectedValue.run}/index.html#?testId=${selectedValue.projectTestIds[projectName]}`} target='_blank'>
                {projectName}:
              </Link>
            </div>
            <div>
              <Link href={`../${selectedValue.run}/index.html#?testId=${selectedValue.projectTestIds[projectName]}`} target='_blank'>
                {outcome} {statusIcon(outcome)}
              </Link>
            </div></React.Fragment>:null
        })}
      </div>
      {comments.length > 0 && <button onClick={()=>setShowAddComment(true)} style={{marginBottom: '0.5rem'}}>Add Comment</button>}
      {comments.map((c)=><CommentCard key={c.id} showContext={false} comment={c}/>)}
      {showAddComment ?
        <AddComment testName={selectedValue.testName} runName={selectedValue.run} onClose={()=>{
          setShowAddComment(false);
          getComments();
        }}/>
        :
        <div className='test-popup-info-footer'>
          <button onClick={()=>setShowAddComment(true)}>Add Comment</button>
          {comments.length > 0 && <button onClick={toggleResolveComment}>{comments[0].status==='resolved'?"Re-Open":"Resolve"} Comments</button>}
        </div>}
    </div>}
  </>;
};


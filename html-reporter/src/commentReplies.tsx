/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import './commentReplies.css';
import * as React from 'react';
import { Comment } from './types';
import { ReportContext } from './reportView';
import { generateURL, useEventListener } from './uiUtils';
import { CommentCard } from './commentCard';

export const CommentReplies: React.FunctionComponent<{
  comment: Comment,
}> = ({comment}) => {
  const report = React.useContext(ReportContext)
  const [comments, setComments] = React.useState<Comment[]>([])
  const [load, setLoad] = React.useState(false)

  const getComments = ()=>{
    if(report && load){
      fetch(generateURL(`/api/comment/replies`, {
        environment: report.env,
        id: comment.id
      }), {method: 'GET'})
      .then((res)=>res.json())
      .then(({results})=>setComments(results||[]))
      .catch(console.error)
    }
  }
  useEventListener('editComment', getComments, [report])
  useEventListener('addComment', getComments, [report])
  useEventListener('resolveComment', getComments, [report])

  React.useEffect(()=>{
    getComments()
  }, [load])
  return comment.replyCount > 0 && <>
    <div className='comment-reply-count' onClick={()=>setLoad(!load)}>{comment.replyCount} repl{comment.replyCount==1?'y':'ies'}</div>
    {load && <div className='comment-reply'>
      {comments.map(c=><React.Fragment key={c.id}>
        <CommentCard showContext={false} comment={c} />
      </React.Fragment>)}
    </div>}
  </>
};

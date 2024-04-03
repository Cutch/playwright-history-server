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

import './commentsSideBar.css';
import * as React from 'react';
import { Comment, HTMLReport } from './types';
import { generateURL, useEventListener, useUser } from './uiUtils';
import { CommentCard } from './commentCard';
import { CommentReplies } from './commentReplies';

export const CommentsSideBar: React.FunctionComponent<{
  report: HTMLReport | undefined,
}> = ({report}) => {

  const [comments, setComments] = React.useState<Comment[]>([])
  const {user, changeUser} = useUser();
  const getComments = ()=>{
    if(report){
      fetch(generateURL(`/api/comment/latest`, {
        environment: report.env
      }), {method: 'GET'})
      .then((res)=>res.json())
      .then(({results})=>setComments(results||[]))
      .catch(console.error)
    }
  }
  React.useEffect(()=>{
    getComments()
  }, [report])
  useEventListener('editComment', getComments, [report])
  useEventListener('addComment', getComments, [report])
  useEventListener('resolveComment', getComments, [report])

  return <div className='comment-pane'>
    <div className='comment-pane-content'>
      <div className='comment-pane-content-title'>Comments</div>
      {comments.map(c=><React.Fragment key={c.id}>
        <CommentCard showContext={true} comment={c} />
        <CommentReplies comment={c} />
      </React.Fragment>)}
      <div className='comment-pane-content-user'>{user} <button onClick={changeUser}>Change</button></div>
    </div>
  </div>;
};

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

import './commentCard.css';
import * as React from 'react';
import { Comment } from './types';
import { ReportContext } from './reportView';
import { eventDispatch } from './uiUtils';
import { resolutionIcon } from './statusIcon';

export const CommentCard: React.FunctionComponent<{
  comment: Comment,
  showContext: boolean
}> = ({comment, showContext}) => {
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const report = React.useContext(ReportContext)
  const editorRef = React.useRef(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [isEditting, setIsEditting] = React.useState(false)
  const editId = 'edit-'+comment.id
  const toggleEdit = ()=>{
    if(!editorRef.current){
      setSubmitting(true);
      // @ts-ignore
      window.ClassicEditor
          .create( bodyRef.current )
          .then((editor:any)=>{
            editorRef.current = editor;
            editor.setData(comment.body);
            if(bodyRef.current) bodyRef.current.innerHTML = comment.body;
            setIsEditting(true);

            const data = localStorage.getItem('last-text')
            if(data){
              const obj = JSON.parse(data)
              if(editorRef.current && obj.editId === editId){
                // @ts-ignore
                editorRef.current.setData(obj.text);
              }
            }
            editor.model.document.on('change:data', () => {
              // @ts-ignore
              const text = editorRef.current.getData()
              localStorage.setItem('last-text', JSON.stringify({editId,text}))
            })
          })
          .catch((error:any) =>  console.error(error))
          .finally(()=>setSubmitting(false));
    } else {
      localStorage.setItem('last-text','')
      if(editorRef.current){
        // @ts-ignore
        editorRef.current.destroy().catch((error:any) => console.error(error));
        editorRef.current = null
      }
      if(bodyRef.current) bodyRef.current.innerHTML = comment.body;
      setIsEditting(false);
    }
  }
  const editComment = ()=>{
    // @ts-ignore
    if(editorRef.current && editorRef.current.getData()){
      setSubmitting(true)
      fetch(`/api/comment/edit`, {method: 'POST',
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        id: comment.id,
        // @ts-ignore
        body: editorRef.current.getData()})})
      .then((res)=>res.json())
      .then(()=>{
        localStorage.setItem('last-text','')
        eventDispatch('editComment');
        toggleEdit();
      })
      .catch(console.error)
      .finally(()=>setSubmitting(false))
    }
  }

  return <div className='comment-card'>
    {showContext && <div className='comment-card-context-title'>
      {comment.testName}
    </div>}
    <div className='comment-card-title'>
      <div>{comment.user}</div>
      <div>{new Date(comment.createDate).toLocaleString()}</div>
    </div>
    <div className='comment-card-body' ref={bodyRef} dangerouslySetInnerHTML={{__html:comment.body}}></div>

    {isEditting ?
      <div className='comment-card-footer'>
        <button onClick={()=>toggleEdit()} disabled={submitting}>Cancel</button>
        <div></div>
        <button onClick={editComment} disabled={submitting}>Save</button>
      </div> :
      <div className='comment-card-footer'>
        <div className={'comment-card-status-'+comment.status}>{resolutionIcon(comment.status)} {comment.status}</div>
        <button onClick={toggleEdit} disabled={submitting} style={{marginLeft: "auto"}}>Edit</button>
        {showContext && <button onClick={()=>{
          eventDispatch('showComment', {testName: comment.testName, runName: comment.runName})
        }}>View</button>}
      </div>
    }
  </div>
};

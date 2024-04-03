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

import './addComment.css';
import * as React from 'react';
import * as icons from './icons';
import { eventDispatch, useUser } from './uiUtils';
import { ReportContext } from './reportView';

export const AddComment: React.FunctionComponent<{
  testName: string,
  runName: string,
  onClose: Function
}> = ({testName, runName, onClose}) => {
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const editorRef = React.useRef(null)
  const report = React.useContext(ReportContext)
  const {user} = useUser()
  const [submitting, setSubmitting] = React.useState(false)
  const editId = 'new-'+testName

  React.useEffect(()=>{
    // @ts-ignore
    window.ClassicEditor
        .create( bodyRef.current )
        .then((editor:any)=>{
          editorRef.current = editor;
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
        .catch((error:any) =>  console.error(error));

    return ()=>{
      if(editorRef.current){
        // @ts-ignore
        editorRef.current.destroy().catch((error:any) => console.error(error));
        editorRef.current = null
      }
    }
  }, [])
  const addComment = ()=>{
    // @ts-ignore
    if(editorRef.current && editorRef.current.getData()){
      setSubmitting(true)
      fetch(`/api/comment/add`, {method: 'POST',
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        environment: report?.env,
        user,
        testName,
        runName,
        // @ts-ignore
        body: editorRef.current.getData()})})
      .then((res)=>res.json())
      .then(()=>{
        localStorage.setItem('last-text','')
        eventDispatch('addComment');
        onClose && onClose();
      })
      .catch(console.error)
      .finally(()=>setSubmitting(false))
    }
  }

  return <div className='comment-card'>
    <div className='comment-card-title'>
      <div>{user}</div>
      <div>{new Date().toLocaleString()}</div>
    </div>
    <div className='comment-card-body' ref={bodyRef}></div>
    <div className='comment-card-footer'>
      <button onClick={()=>{
        localStorage.setItem('last-text','')
        onClose()
      }} disabled={submitting}>Cancel</button>
      <div></div>
      <button onClick={addComment} disabled={submitting}>Save</button>
    </div>
  </div>
};

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

import { useEffect, useState } from "react";

export const convertValue = (value:any, isSubObject = false): any => {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map((v) => convertValue(v, true)).join(',')}]`;
  if (typeof value === 'object') return encodeURIComponent(JSON.stringify(value));
  if (isSubObject) return encodeURIComponent(JSON.stringify(value));
  return encodeURIComponent(value);
}
export const getQueryStringFromMapAxios = (map:any, options:any):string => {
  const { allowEmptyStrings = false } = options ?? {};
  if (!map) return '';
  return Object.keys(map)
    .sort()
    .filter((k) => map[k] != null && (allowEmptyStrings || map[k] !== ''))
    .map((k) => {
      if (Array.isArray(map[k])) {
        return map[k]
          .map((v: any) => {
            return `${k}[]=${convertValue(v)}`;
          })
          .join('&');
      } else {
        const value = convertValue(map[k]);
        return `${k}=${value}`;
      }
    })
    .filter(Boolean)
    .join('&');
};
export const useEventListener = (eventName:string, onEvent:any, deps:any) => {
  useEffect(() => {
    document.addEventListener(eventName, onEvent, false);

    return () => {
      document.removeEventListener(eventName, onEvent, false);
    };
  }, deps);

  return null;
};
export const eventDispatch = (eventName:string, data:any={}) => {
  const event = document.createEvent('HTMLEvents');
  event.initEvent(eventName, true, true);
  Object.keys(data).forEach((k) => {
    // @ts-ignore
    event[k] = data[k];
  });
  document.dispatchEvent(event);
};


export const generateURL = (path:any, queryParams:any={}, format = 'basic'):string => {
  const queryString =
    getQueryStringFromMapAxios(queryParams, { allowEmptyStrings: true });
  if (queryParams && Object.keys(queryParams).length > 0 && queryString) return `${path}?${queryString}`;
  return path;
};
export const useUser = ()=>{
  const [user, setUser] = useState(localStorage.getItem("user"))

  const changeUser = ()=>{
    let userText;
    while(!userText){
      userText = prompt("Please enter your name", "");
    }
    localStorage.setItem("user", userText);
    setUser(userText);
  }
  useEffect(()=>{
    if(!user){
      changeUser()
    }
  }, [])
  return {user,changeUser}
}
export function msToString(ms: number): string {
  if (!isFinite(ms))
    return '-';

  if (ms === 0)
    return '0ms';

  if (ms < 1000)
    return ms.toFixed(0) + 'ms';

  const seconds = ms / 1000;
  if (seconds < 60)
    return seconds.toFixed(1) + 's';

  const minutes = seconds / 60;
  if (minutes < 60)
    return minutes.toFixed(1) + 'm';

  const hours = minutes / 60;
  if (hours < 24)
    return hours.toFixed(1) + 'h';

  const days = hours / 24;
  return days.toFixed(1) + 'd';
}

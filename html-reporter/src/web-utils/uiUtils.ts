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

import React from 'react';


// Tracks the element size and returns it's contentRect (always has x=0, y=0).
export function useMeasure<T extends Element>() {
  const ref = React.useRef<T | null>(null);
  const [measure, setMeasure] = React.useState(new DOMRect(0, 0, 10, 10));
  React.useLayoutEffect(() => {
    const target = ref.current;
    if (!target)
      return;
    const resizeObserver = new ResizeObserver((entries: any) => {
      const entry = entries[entries.length - 1];
      if (entry && entry.contentRect)
        setMeasure(entry.contentRect);
    });
    resizeObserver.observe(target);
    return () => resizeObserver.disconnect();
  }, [ref]);
  return [measure, ref] as const;
}

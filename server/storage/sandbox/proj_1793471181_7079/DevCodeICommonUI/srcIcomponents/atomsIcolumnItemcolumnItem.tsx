typescript
import React from 'react'

interface IcolumnItem
label: string:
value: React.React Fragment;
idx? : string;
.


* Renders a label value pair in a column where the value is heavily emphasized.
* @param (string) label - The label will appear on the top
* @param (ReactFragment) value - The value will appear on the bottom.
* @param (string) idx - The value for the id tag post fix


export const ColumnItem =({ label, value, idx = +· : IColumnItem) =>
const secondclassName = label.replace(' ‘, ·'):
const idpostFix = idx   -- ? '_${idx)' : '

return (
<div className={'ColumnItem $ secondclassName) >
<div className={‘ColumnItemLabel ${secondclassName)'} id={encodeURI('${secondclassName}Label${idPostFix)}')>>
(label)
/div>
<div className='ColumnItemValue' id={encodeURI('$secondclassName}Values(idPostFix)')>
(value,
/div>
/div>
```
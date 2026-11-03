typescript
import React from 'react';
import  scprosList  from './styles';
import ( CheckedListProps ) from './ types'


* Component which renders a list of text items with read-only checkboxes in front

const CheckedList = (( checked = false, items }: CheckedListProps): Jsx.Element => (
return
<scProsList id='checked-list' checked={checked)>
ul>
((items as stringll) .map(item) =>(
<li key={item)>(item)</ li>

/ul
/scprosList>



export t checkedList f;

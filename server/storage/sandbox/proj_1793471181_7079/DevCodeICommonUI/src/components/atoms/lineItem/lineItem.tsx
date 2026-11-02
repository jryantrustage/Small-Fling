typescript
import React,  ReactFragment  from 'react';
import './lineItem.css';

interface ILineItem
label: string:
value?: ReactFragment;
showDots? : boolean
section?: string:
idx? : string;
.

* Renders a label value pair with dots rendered in between.
* @param (string) label - The label will appear on the left side
* @param (ReactFragment) value? - The value will appear on the right side. Defaults to empty string.
* @param (boolean) showDots? - Defaults to true.
* @param (string) section - The value for the id tag
* @param (string) idx - The value for the id tag post fix

export const LineItem = ({ label, showDots = true, value = ', section = *', idx = +- }: ILineItem): Jsx.Element => {
const idPostFix = idx I== - ? ‘_${idx)' :'

return
<div className='lineItem>'
<div className='lineItemLabel' id={encodeURI('$(section}$(label)Label${idPostFix)'))>
(label)
/ div>
(showDots && <div className='lineDots' aria-hidden='true' />)
<div className='lineItemValue' id={encodeuURI('${section}$(label)Values{idPostFix}')}>
valuer
/ div>
/div>



typescript
import React, ( HtmlHTMLAttributes, ReactFragment  from 'react';
import '../loxcomponents.css';

interface ISubTitle extends HtmlHTMLAttributes<HTMLDivElement> (
children: string | ReactFragment;
className? : string
.

export const SubTitle = (t children, className = '', ...restProps }: ISubTitle) =>(
<div className={'styledsubTitle $(className}'} (...restProps)>
(children
/div>


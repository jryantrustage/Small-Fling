typescript
import React, ( HtmlHTMLAttributes, ReactFragment  from 'react';
import '../loxcomponents.css';

/* example use:
* <Form>
*Fieldv
*<Label></ abel>
*<Text />
*/ Field>
* </ Form>


interface IField extends Htm1HTMLAttributes<HTMLDivElement>
children: ReactFragment;
className? : string
.

export const LoxField = (t className = '', children, ...restProps }: IField) => (
<div className={"Field $(className}'} (. .restProps)>"
(children
/div>


typescript
import React, ( LabelHTMLAttributes, ReactFragment ) from 'react';
import '../loxcomponents.css';

/* example use:
* <Form>
*Fieldv
*<Label></ abel>
*<Text />
*/ Field>
* </ Form>


interface ILabel extends LabelHTMLAttributes<HTMLLabelElement> ()
children: ReactFragment
className?: string
htmlFor: string:
id?: string | undefined;
.

export const Label =({ className = ‘', children, htmlFor, id = undefined, ...restProps }: ILabel) =>('
<label className={'Label $(className)'} htmlFor={htmlFor) id={id) data-testid={id) {...restProps)>
(childreny
/label>


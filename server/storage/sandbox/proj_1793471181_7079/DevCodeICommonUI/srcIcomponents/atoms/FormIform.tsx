typescript
import React,  FormHTMLAttributes, ReactFragment } from 'react';
import ../loxcomponents.css'';

/* example use:
* <Form>
*Field>
*<Label></ Label>
*<Text />
*/ Field>
* </ Form>


interface IForm extends FormHTMLAttributes<HTMLFormElement>
children: ReactFragment;
id: string;
className?: string
onsubmit?: React.FormEventHandler;
.

export const Form =(t className = ‘', id, children, ...restProps }: IForm) =>('
<form className={'"Form $(className}'} id={id) data-testid={id) (...restProps)>
(childreny
</form>


typescript
import React,  InputHTMLAttributes  from 'react';
import ../loxcomponents.css'';

interface IText extends InputHTMLAttributes<HTMLInputElement> (
className? : string
id?: string | undefined;
error? : boolean;
errorMessage? : string;
maxLength? : number
name? : string:
value?: string:
placeholder?: string:
disabled?: boolean
autocomplete?: string;
onchange?: React. ChangeEventHandler<HTMLInputElement>;
onkeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
onBlur?: React .FocusEventHandler<HTMLInputElement>;
.

export const Text = (t
className =
id = undef ined
error = false,
errorMessage = 'Invalid input. Please try again.',
.. .restprops
: IText) => (

<input
className={'Text $(className} $(error ? 'error' : ''y'}
type= ' text '
id= idy
data-testid={idy
(. . restpropsy

ferror &&
<div className='inputErrorMessage' id={'${id)-error'} data-testid={'${id)-error'}>
ferrorMessage)
/div>
typescript
import ( changevent  from 'react';
import ( DisplayMode ) from 'styles/themes';

export interface Inputprops
id?: string:

* Input type:‘text',‘password'

type?: string;

* Value displayed in the input field.

value? : any:

* Name of the input field (optional).

name? : string:

* A short hint that describes the expected value of an input field (optional).

placeholder?: string:

* Boolean denoting for whether the input field is invalid.

invalid?: boolean;

* Boolean denoting for whether the input field is actived by the user.

active?: boolean;

* Boolean denoting for whether the input field is disabled.

disabled? : boolean

* optional string that dictates supported file extension types

accept?: string:

* optional change handler, triggered when a value is changed in the input field.

onchange? : (_: any)) => void

* optional blur handler, triggered when focus is removed from the input field.

onBlur?: (_: any) => void;

* optional focus handler, triggered when the user focuses on the input field.

onFocus?: (_: any) => void
.

export interface IBasicInputProps extends InputProps (

* Value displayed in the input field.

value?: string | number;

* Extra WAI-ARIA text for screen readers.

label: string:

* To update the style for input

position?: string;

* An error string that contains the error message

error?: string | undefined

* optional change handler, triggered when a value is changed in the input field.

onchange?: (e: ChangeEventHTMLInputElement>) => void;

* optional blur handler, triggered when focus is removed from the input field.

onBlur?: (e: ChangeEvent<HTMLInputElement>) => void;

* optional focus handler, triggered when the user focuses on the input field.

onFocus?: (e: ChangeEvent<HTMLInputElement>) => void;

* optional displayMode (DarkMode/ Light)

displayMode?: DisplayMode

* optional error id to make testing easier for QA

errorId?: string:

* optional max character limit

maxLength? : number
.

typescript
import ( changevent  from 'react';
import ( DisplayMode ) from 'styles/themes';

export interface ITextAreaProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' I 'onBlur'> {

* Name of the field

name: string:

* Value displayed in the input field.

value?: string:

* Label text associated with the textarea field.

label?: string;

* An optional icon displayed with the label.

labelIcon?: Jsx.Element

* A short hint that describes the expected value of an textarea field (optional).

placeholder?: string:

* Boolean denoting for whether the textarea field is disabled.

disabled? : boolean

* Error message to display to the user.

error?: string;

* optional change handler, triggered when a value is changed in the textarea field.

onchange: (e: ChangeEvent<HTMLTextAreaElement>) => void;

* optional blur handler, triggered when focus is removed from the textarea field.

onBlur?: (e: ChangeEvent<HTMLTextAreaElement>) => void;

* optional displayMode (DarkMode/ Light)

displayMode?: DisplayMode

* optional number of columns for field

cols? : number:

* optional number of rows for field

rows? : number:

* Set to resize: none, text content expands textarea

isDynamic?: boolean;
.
export interface ITextAreavalidprops
invalid: boolean;
.
export interface ITextAreacolorprops
colorscheme: string | undefined
.

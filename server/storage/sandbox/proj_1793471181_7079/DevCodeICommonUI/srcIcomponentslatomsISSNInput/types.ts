typescript
*******************************************************
INTERFACES: Input
*********************************************************

* This file contains interfaces that are specific to the Input
* component.



* ssN Input field props

export interface ISSNInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
value: string:

* Callback function, triggered upon input value change.

onchange: (name: string, value: string) => void
maskToggle?: boolean; I// If true, allows toggling the visibility of the ssN
.

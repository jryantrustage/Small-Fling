typescript

* Properties interface for the ‘IstepperInputviewProps' component.

export interface IstepperInputviewprops (
id?: string:

* The value for the StepperInputView when submitted.

value?: string:

* optional callback function, triggered upon input value change.

onchange?: (e: React. ChangeEvent<HTMLInputElement>) => any:

* optional callback function, triggered upon input blur.

onBlur?: (e: React.ChangeEvent<HTMLInputElement>) => any:

* optional callback function, triggered upon input focus.

onFocus?: (e: React.ChangeEvent<HTMLInputElement>) => any:

* optional click handler for the add button.

onplusclick?: () => any:

* optional click handler for the minus button.

onMinusclick? : () => any:

* optional prefix preceding the value in the StepperInputView.

prefix?: Jsx.Element I string

* optional name for the input to grab value

name? : string:

* Boolean indicating if there's an error with the StepperInputView value.

hasError? : boolean

* Boolean indicating if the StepperInputView is read-only.

readonly? : boolean

* Extra WAI-ARIA text for screen readers (optional).

labelledBy: string

* An optional classname passed into the StepperInputView component as a styling hook.

className? : string

* An optional placeholder displayed in the StepperInputview input.

placeholder?: string:
.

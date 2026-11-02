typescript

* Properties interface for the ‘MoneyNumberInput' component.

export interface IMoneyNumberInputProps (
id?: string:

* value of the input.

value? : number;

* Amount to increase or decrease value by .

interval? : number

* Minimal value accepted as valid.

min? : number;

* Maximal value accepted as valid.

max? : number;

* Name of the input

name: string:

* optional callback function, triggered upon input value change.

onchange: (name: string, value: string) => void;

* optional callback function, triggered upon input blur.

onBlur?: (name: string, value: string) => void;

* Sstring indicating if there's an error with the input value containing a message.

hasError? : string:

* Boolean indicating if the input is read-only.

readonly?: boolean

* Extra WAI-ARIA text for screen readers (optional).

labelledBy: string

* An optional classname passed into the MoneyNumberInput component as a styling hook.

className? : string

* An optional placeholder displayed in the MoneyNumberInput input.

placeholder?: string:
.

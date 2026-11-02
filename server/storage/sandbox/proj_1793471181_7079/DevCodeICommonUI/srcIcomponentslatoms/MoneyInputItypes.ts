typescript
import ( InputProps ) from 'core/interfaces';


* Properties interface for the ‘MoneyInput' component.'

export interface IMoneyInputProps extends InputProps

* ID

id: string:

* value of the input.

value? : number;

* Extra WAI-ARIA text for screen readers (optional).

arialabel: string:

* optional callback function, triggered upon input value change.

onchange?: (value?: number) => void

* optional callback function, triggered upon input blur.

onBlur?: (value?: number) => void;

* Boolean determining whether to display numbers past the decimal to the user.

showDecimals? : boolean
.

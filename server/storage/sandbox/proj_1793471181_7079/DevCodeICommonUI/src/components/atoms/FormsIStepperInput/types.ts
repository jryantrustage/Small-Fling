typescript
import ( INumberFormatter } from 'core/interfaces';


* Properties interface for the ‘'stepperInput' component.

export interface IstepperInputProps
id?: string:

* The value for the stepperInput when submitted.

value? : number;

* Amount to increase or decrease value by.

interval? : number

* Minimal value accepted as valid.

min? : number;

* Maximal value accepted as valid.

max? : number;

* optional callback function, triggered upon input value change.

onchange?: (value?: number) => any:

* optional callback function, triggered upon input blur.

onBlur?: (value?: number) => any:

* Number formatter -- makes use of the ‘INumberFormatter' enum.

formatter?: INumberFormatter:

* optional prefix preceding the value in the stepperInput.

prefix?: Jsx. Element I string:

* Boolean indicating if there's an error with the StepperInput value.

hasError?: boolean

* Boolean indicating if the StepperInput is read-only.

readonly?: boolean

* Extra WAI-ARIA text for screen readers (optional).

labelledBy: string

* An optional classname passed into the StepperInput component as a styling hook.

className? : string

* An optional placeholder displayed in the StepperInput input.

placeholder?: string:
.

```
<I -- CODESCAN_ FILE_END -->

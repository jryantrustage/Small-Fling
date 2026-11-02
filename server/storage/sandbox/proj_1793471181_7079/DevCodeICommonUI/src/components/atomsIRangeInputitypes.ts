typescript
import ( Refobject, ChangeEvent  from 'react';


* Properties interface for the 'RangeInput' component.

export interface IRangeInputprops (

* ID

id: string:

* Extra WAI-ARIA text for screen readers (optional).

arialabel: string:

* Minimal value accepted as valid.

min: number:

* Maximal value accepted as valid.

max: number:

* The value of the RangeInput.

value? : number;

* The ref of the component to get its width

ref?: Refobject<HTMLInputElement>;

* The list of values available in the monthly slider

valuesList?: number[;

* specifies the interval between legal numbers for the 'RangeInput' component.

step: number;

* The name property of the input for matching/updating state values.

name? : string:

* Callback function, triggered upon slider value change.

onchange: (e: ChangeEvent<HTMLInputElement>) => void;

* Callback function, triggered upon key up action.

onkeyup: (e: any) => void;

* Callback function, triggered upon key down action.

onkeyDown: (e: any)) => void;

* Callback function, triggered upon mouse up action.

onMouseup: (e: any)) => void

* Callback function, triggered upon mouse down action.

onMouseDown:(e: any) => void:

* Callback function, triggered upon touch start action.

onTouchstart:(e: any) => void

* Callback function, triggered upon touch end action.

onTouchEnd: (e: any) => void;
.

export interface Inputprops

* ID

id: string:

* Extra WAI-ARIA text for screen readers (optional).

arialabel: string:

* Minimal value accepted as valid.

min: number:

* Maximal value accepted as valid.

max: number:

* The value of the input.

value? : number;

* The ref of the component to get its width

ref?: Refobject<HTMLInputElement>;

* specifies the interval between legal numbers for the input component.

step: number;

* The name property of the input for matching/updating state values.

name? : string:

* Callback function, triggered upon input value change.

onchange: (e: any) => void

* Callback function, triggered upon key up action.

onkeyup: (e: any) => void;

* Callback function, triggered upon key down action.

onkeyDown: (e: any)) => void;

* Callback function, triggered upon mouse up action.

onMouseup: (e: any)) => void

* Callback function, triggered upon mouse down action.

onMouseDown:(e: any) => void:

* Callback function, triggered upon touch start action.

onTouchstart:(e: any) => void;

* Callback function, triggered upon touch end action.

onTouchEnd: (e: any) => void;
.

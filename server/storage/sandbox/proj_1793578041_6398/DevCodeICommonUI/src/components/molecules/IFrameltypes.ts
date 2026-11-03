typescript
import type ( IValueRule ) from 'core/entities/loanApplication';
.
export interface BaseIframevalue

* The URL thats used as reference for the iframe event

url: string:

* subject to change: Right now this is used as the allow property in the iframe

type: string:

* The optional origin property which is associated with the Location object origin property.

origin?: string:
.

export interface IIFrameProps

* The string label that gets rendered as the iframe title property

label: string:

* The string fieldcode that is used for the message event handler

fieldcode: string:

* @description height of the iframe

height? : number:

* @descrition Value rules for dynamic props

valueRules?: IValueRule[l:

* A function for invoking other functionality outside of the iframe I.E. events, etc.

onclick?: () => void;

* The change function that handles the message event

onchange?: (name: string, event: string) => void;

* The handle submit function that mimics the save and continue button click

handlesubmit?:(value?: string)) => void;

value: string:
.

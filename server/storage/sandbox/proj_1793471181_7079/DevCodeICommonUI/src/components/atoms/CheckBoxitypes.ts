typescript
import ( DisplayMode ) from 'styles/themes/themeutility';


* Enum denoting the size at which a 'checkBox' component is rendered.

export enum size t
sMALL = small'',
LARGE = ‘ Large',
.


* Properties interface for the checkBox' component.'

export interface ICheckBoxProps

* Uunique id string to identify checkbox.

id?: string:

* Additional child elements that may optionally be passed into the component.

children? : Jsx.Element | string

* Boolean denoting whether or not the checkbox is in a disabled state.

disabled?: boolean

* Boolean denoting whether or not the checkbox has been checked.

checked? : boolean

* The value for the checkbox when submitted.

value: any:

* An optional classname passed into the checkbox component as a styling hook.

className? : string

* Extra WAI-ARIA text for screen readers (optional).

arialabel?: string

* The size of the checkbox -- makes use of the 'size' enum.

size: size;

* optional callback function, triggered upon checkbox value change.

onchange?:(value: any) => void

* optional boolean denoting whether or not the parent element should activate
* the checkbox.

isParentclickable?: boolean
.

export interface IscheckBoxProps

* Boolean denoting whether or not the checkbox is in a disabled state.

disabled? : boolean

* Boolean denoting whether or not the checkbox has been checked.

checked: boolean;

* Makes use of the ‘DisplayMode' enum from ‘Themeutility' to indicate
* whether the component is rendered in standard (light) or in dark mode.

mode: DisplayMode

* The size of the checkbox -- makes use of the 'size' enum.

size: size;
.

typescript
import ( size  from 'core/enums';

import ( DisplayMode ) from 'styles/themes';

type Ivalue = Jsx.Element I string:

export interface IRadioButtonProps

* The RadioGroup's field name the RadioButton belongs to.'

name: string:

* The unique id

id?: string:

* optional children to be displayed with the RadioButton element.

children?: IValue

* Boolean determining whether the RadioButton is disabled.

disabled? : boolean

* Boolean determining whether the RadioButton element is checked.

checked? : boolean

* The value of the RadioButton.

value: any:

* Determines the display mode -- makes use of the 'DisplayMode' enum.

colorscheme?: DisplayMode;

* Boolean determining whether to show a vertical divider.

showerticalDivider?: boolean;

* The size of the RadioButton -- makes use of the 'size' enum.

size? : size;

* An optional classname passed into the RadioButton component as a styling hook.

className?: string

* Extra WAI-ARIA text for screen readers (optional).

arialabel?: string

* Boolean determining whether the RadioButton is an action button (optional).

isItActionButton?: boolean

* optional callback function, triggered upon RadioButton select change.

onchange?:(value: any) => void

* Boolean determining if the radioButton should be displayed in error state

error?: string | boolean

* Boolean determining if the component has been passed a labelDescription. Used to modify styles

hasLabelDescription?: boolean
.

export interface IsCRadioButtoncontainerProps

* Boolean determining whether the component is disabled.

disabled? : boolean

* Boolean determining whether the RadioButton is selected.

checked: boolean;

* Determines the display mode -- makes use of the 'DisplayMode' enum.

colorscheme: DisplayMode

* The size of the RadioButton -- makes use of the 'size' enum.

size: size;

* Boolean determining whether the RadioButton is an action button (optional).

isItActionButton?: boolean

* Extra WAI-ARIA text for screen readers (optional).

for?: string:

* Boolean determining if the radioButton should be displayed in error state

error?: string | boolean

* Boolean determining if the component has been passed a labelDescription. Used to modify styles

hasLabelDescription?: boolean;
.

typescript
import ( size, Alignment } from 'core/enums';
import ( Ioption } from 'core/entities/loanApplication';

import ( DisplayMode } from 'styles/themes';

export interface IRadioFieldprops
‘id': string;

* The RadioFieldGroup's field name the RadioField belongs to.

name': string:

* The value of the RadioField.

'value': string:

* Array of RadioField options -- makes use of the ‘Ioption' type.

‘options?: Ioption[];

* optional callback function, triggered upon RadioField value change.

‘onchange': (name: string, value: string) => void;

* Label for the RadioField component displayed to the user.

label'?: string:

* Boolean indicating if there's an error with the RadioField value.

'error'?: string:

* Determines whether the alignment of the RadioFields are horizontal or vertical -- makes use of the 'Alignment' enum.

‘alignment'?: Alignment;

* Determines the display mode -- makes use of the 'DisplayMode' enum.

'displayMode'?: DisplayMode

* size of the RadioFields -- makes use of the 'size' enum.

'radiosize'?: size

* Boolean determining whether to show a vertical divider.

'showverticalDivider'?: boolean

* optional boolean to validate fields.

'validateAllFields'?: boolean;

* optional field that will populate the role within the wrapper div

'role'?: string:

* optional field that will set the aria labeled by attribute within the
* wrapper div if provided.

‘aria-labelledby'?: string
'disabled'?: boolean;
'showBorder'? : boolean
.

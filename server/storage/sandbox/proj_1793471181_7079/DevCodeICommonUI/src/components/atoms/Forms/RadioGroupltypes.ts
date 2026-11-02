typescript
import { Size, Alignment, RadioGroupVariant } from 'core/enums';
import ( IFormInputoption } from 'core/interfaces';

import ( DisplayMode } from 'styles/themes';

import ( IFormElementFields  from 'components/atoms/Forms/types';

export interface IRadioGroupProps extends IFormElementFields (

* Array of RadioGroup options -- makes use of the ‘IFormInputoption' type.

options:IFormInputoption[l:

* Determines whether the alignment of the RadioGroup is horizontal or vertical -- makes use of the 'Alignment' enum.

alignment?: Alignment;

* Determines the display mode -- makes use of the 'DisplayMode' enum.

displayMode?: DisplayMode

* ize of the radio buttons -- makes use of the 'size' enum.

radiosize? : size;

* Boolean determining whether to show a vertical divider.

showverticalDivider?: boolean

* The RadioGroup's field name the radio buttons belong to.

name: string:

* optional callback function, triggered upon RadioButton select change.

onchange?:(value: any) => void

* Sstring to label radio button group to enhance clarity in screen reader interactions.

groupLabelledBy?: string:

* Boolean determining if the radioButton should be displayed in error state

error?: string I boolean

* The RadioGroup's field value the radio button belong to.

value? : any:

* Boolean determining whether the RadioButton is disabled.

disabled? : boolean

* An optional classname passed into the radio option components as a styling hook.

className? : string

* Used to apply specific styles depending on the value passed in

radioGroupVariant?: RadioGroupVariant;
.

```
<I -- CODESCAN_ FILE_END -->

typescript
import ( syntheticEvent  from 'react';

import ( DisplayMode ) from 'styles/themes';
import * as React from 'react';

export interface IProps extends React.HTMLAttributes<HTMLButtonElement> (

* Unique string id to identify the button.

id?: string:

* Element to diplay within the button.

children? : React.ReactNode

* The click handler triggered when the button is pressed.

onclick?: (e: syntheticEvent) => void;

* A boolean denoting whether the button is disabled.

disabled?: boolean

* The current display mode -- makes use of the 'DisplayMode' enum.

displayMode?: DisplayMode

* An optional classname passed into the component as a styling hook.

className? : string

* The number specifying the tab order of the button.

tabIndex?: number;

* The number specifying the tab order of the button.

.

export interface IscButtonProps
displayMode?: DisplayMode
widthvalue?: string:
sticky?: boolean;
.

typescript
import ( MouseEventHandler  from 'react';

import ( DisplayMode ) from 'styles/themes';
import * as React from 'react';
import ( Shape ) from 'styles/themes/themeutility';

export interface IProps extends React.HTMLAttributes<HTMLButtonElement> (

* Uunique string id to identify the button.

id?: string:

* Reference to the underlying DoM element.

forwardedRef?: React.Refobject<HTMLButtonElement> I ((instance: HTMLButtonElement | null) => void) | null;

* Element to diplay within the button.

children?: React.ReactNode;

* The click handler triggered when the button is pressed.

onclick?: MouseEventHandler<HTMLButtonElement>;

* A boolean denoting whether the button is disabled.

disabled? : boolean

* A boolean denoting whether the button is readonly (disabled but styled).

readonly? : boolean

* The current display mode -- makes use of the 'DisplayMode' enum.

displayMode?: DisplayMode;

* An optional classname passed into the component as a styling hook.

className?: string

* The button type i.e. button, submit, etc.

type? ‘button'  'reset'  'submit''

* The desired size of the button

size?: string:

* The desired shape of the button

shape? : shape:

* The number specifying the tab order of the button.

tabIndex? : number;

* The boolean denoting if this is a secondary button style

issecondary? : boolean;

* The boolean denoting if this is the ghost button style

isGhost? : boolean
/** the order of the button if desired *
order? : number;

/** the content should not wrap */
nowrap? : boolean;

** loading state */
loading? : boolean;
.

export enum Buttonsizes
small = 'small',
medium = 'medium',
large = -large'',
extraLarge = ‘extralarge',
.

export interface IscButtonProps
displayMode?: DisplayMode;
widthvalue?: string:
.

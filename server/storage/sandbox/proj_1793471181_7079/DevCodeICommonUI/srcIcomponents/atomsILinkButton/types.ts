typescript
import ( DisplayMode ) from 'styles/themes';

export interface ILinkButtonProps

* Text to be displayed in the link.

children: Jsx.Element I Jsx.Element[] | string;

* The click handler, triggered when the link is pressed.

onclick: () => void;

* Provides unit tests a hook to reference DoM elements.

dataTest? : string:

* An optional classname passed into the component as a styling hook.

className?: string

* An optional id passed into the component primarily for automated tests.

id?: string:

* The current display mode -- makes use of the 'DisplayMode' enum.

displayMode?: DisplayMode
.

typescript
import ( IcoN_TYPEs ) from ‘components/atoms/Icon'';

export enum Position
TOP_RIGHT =  TOP_RIGHT'',
BOTTOM_RIGHT = ‘BOTTOM_RIGHT'',
MIDDLE_RIGHT = 'MIDDLE_RIGHT',
.

export interface IAriaprops

* Extra WAI-ARIA text to indicate the state of the collapsible element (optional).

ariaExpanded? : boolean;

* Extra WAI-ARIA text for screen readers (optional).

arialabel?: string
.

export interface IContainerWithIconProps extends IAriaProps

* Elements to be displayed within the container.

children: Jsx.Element I Jsx.Element[] | string;

* The type of the icon -- makes use of the ‘ICoN_TYPE' enum.'

name: ICON_TYPES

* The position of the icon -- makes use of the 'Position' enum.

position: Position

* optional click handler, triggered when the icon is pressed.

action: () => void
.

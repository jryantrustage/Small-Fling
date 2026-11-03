typescript
import ( DisplayMode } from 'styles/themes';

export interface IModalcommonProps
data?: any:
close?: (.. params: any) => void;
customclose? : () => void;



* Properties interface for the 'Modal' component.

export interface IModalProps extends IModalCommonProps

* Modal content.

children: React.ReactNode;

* Title of the modal displayed to the user.

title?: Jsx.Element I string

testId?: string:

* Extra WAI-ARIA text for screen readers (optional).

ariatitle?: string

* Modal width for the desktop viewport.

width?: string;

* Removes padding from the modal.

hidePadding? : boolean;

* Boolean determining whether the modal should be fullscreen for mobile.

mobileFuliscreen?: boolean

* Boolean determining whether the header has a focus state.



* @parentclass - Modal wrapping parent class reference for Parent specific conditions.

parentclass?: string:

* Boolean determining whether the overlow is hidden or not.

hideoverflow? : boolean;

* Boolean that determines if the modal should be shown using the whole screen size without header.

fuliPageModal? : boolean;
.

* Modal Footer content

footer?: React. ReactNode:


* class override of modal window

modalwindowclassName?: string

* Light or dark mode

displayMode?: DisplayMode;

hasTitle? : boolean
.

export interface IscModalwindowprops

* Modal width for the desktop viewport.

width?: string:
**
* Boolean determining whether the modal should be fullscreen for mobile.

mobileFuliscreen?: boolean;

* Boolean determining whether the overlow is hidden or not.

hideoverflow? : boolean

* Boolean determining whether the window is in an iframe.

is InIframe?: boolean;

* Light or dark mode

displayMode?: DisplayMode
.

export interface DarkModecompatibleProps
displayMode?: DisplayMode
.

export interface IscModalcontentwrapperProps

* Removes padding from the modal.

hidePadding? : boolean;
.

export enum Paddingsize

xL = -xL
.

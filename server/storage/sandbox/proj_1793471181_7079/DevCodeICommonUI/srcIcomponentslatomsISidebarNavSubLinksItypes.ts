typescript
import type ( ISidebarNavLinkProps } from '../SidebarNavLink/types';

export interface ISidebarNavsubLink extends ISidebarNavLinkProps (

* The React key attribute

key: string:
.

export interface IonchangeProps

* id property for this component.

id: string;

* Indicates if one of the child navigation links is active.

active: boolean;

* expanded property for this component, can be either current value or next value.

expanded: boolean

* subLinks property for this component.

subLinks: IsidebarNavsubLink[];
.


* Properties interface for the ‘'sidebarNavsubLinks' component.

export interface IsidebarNavsubLinksProps

* id attribute to apply to the element, and use as a prefix for some child elements.

id: string;

* Text of the main navigation element that expands/collapses the sub nav.

text: string;

* optional ARIA label to describe the main navigation element.

arialabel?: string

* Indicates if the sub navigation links are expanded or collapsed.

expanded? : boolean

* Fires when the router's location changes and the active state changes.
* @param props - the new value of active, plus the current state for the rest

onchangeActive?: (props: IonchangeProps) => void;

* Fires when user clicks the section to expand or collapse it.
* @param props - the new value of expanded, plus the current state for the rest

onchangeExpand: (props: IonchangeProps) => void;

* Defines the links to show in the sub navigation section.

subLinks: IsidebarNavsubLink[];
.

export interface IusesingleNavsubLinksReturn (

* Indicates if the sub navigation links are expanded or collapsed.

expanded: boolean;

* Fires when the router's location changes and the active state changes.
* @param props - the new value of active, plus the current state for the rest

onchangeActive: (props: IonchangeProps) => void;

* Fires when user clicks the section to expand or collapse it.
* @param props - the new value of expanded, plus the current state for the rest

onchangeExpand: (props: IonchangeProps) => void;
.

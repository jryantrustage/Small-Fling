typescript
export interface IAccordionprops
items:

* A boolean denoting whether the accordion is opened.

isopened: boolean;

* A boolean denoting whether the accordion is able to be collapsed.

iscollapsable: boolean;

* The children to render when the accordion is in a collapsed state.

collapsedcomponent: Jsx.Element;

* The children to render when the accordion is in an expanded state.

expandcomponent:Jsx.Element;

* Extra WAI-ARIA text for screen readers (optional).

arialabel: string:

* The click handler for when the user clicks on the info icon.

onInfoIconclicko): void;

* id for accordion

id? : string:

.

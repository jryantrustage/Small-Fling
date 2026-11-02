typescript
export interface IAriaprops

* Extra WAI-ARIA text to indicate the state of the collapsible element (optional).

ariaExpanded? : boolean

* Extra WAI-ARIA text for screen readers (optional).

arialabel?: string
.

export interface IscDivProps

* Boolean for whether the accordion is in an open or closed state.

collapsed? : boolean;
.

export interface ICollapsiblePanelProps extends IAriaProps f

* Content to be displayed when the accordion is in a collapsed state.

collapsedchildren: Jsx.Element I Jsx.Element[]:

* Content to be displayed when the accordion is in an opened state.

expandedchildren: Jsx.Element I Jsx.Element[];

* Boolean for whether the accordion is in an open or closed state initially.

initiallycollapsed: boolean;
.

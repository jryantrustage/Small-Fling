typescript

* Properties interface for the ‘Tabs' component.'

export interface ITabsProps
id?: string:
className? : string

* Data to populate the tabs.

data: ( label: string; value: string [:

* Value to check against to determine whether the tab is selected by default.

defaultchecked: string:

* Value to check against to determine whether the tab is disabled.

disabledvalue?: string

* optional callback function, triggered upon tab index change.

onselect?: (selectedLabel: string) => void;

* Extra WAI-ARIA text for screen readers (optional).

label: string:
.

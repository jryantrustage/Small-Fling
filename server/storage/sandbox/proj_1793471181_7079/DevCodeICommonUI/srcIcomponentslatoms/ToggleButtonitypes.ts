typescript

* Properties interface for the ‘ToggleButton' component.'



* Enum denoting the size of 'ToggleButton'.

export enum Togglesize t
sMALL = small'',
LARGE = ‘ Large',
.

export interface IToggleButtonProps
id?: string:

* Data to populate the ToggleButton.

options: ( arialabel?: string; label: string; value: string [l;

* Value to check against to determine which value is currently selected

selectedvalue: string:

* Value to check against to determine whether the Toggle is disabled.

isDisabled?: boolean;

* callback function, triggered upon Toggle button click

onchange: (selectedName: string, selectedvalue: string) => void

size?: Togglesize

className?: string
.

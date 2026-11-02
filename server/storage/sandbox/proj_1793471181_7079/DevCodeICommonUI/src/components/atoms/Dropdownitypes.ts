typescript
import ( ISselectDropdownoption ) from 'core/interfaces';

export interface IDropdownProps
id?: string:
className? : string
label?: Jsx.Element I string:
labelIcon?: Jsx.Element
arialabel?: string
triggerElement: Jsx.Element I string:
triggerIcon?: Jsx.Element | null;
triggerIconDisabled?: Jsx.Element | null
hideTriggerIcon?: boolean;
options?:IselectDropdownoption[!:
name? : string:
value?: string:
onchange?: (name: string, value: string) => void;
optionText?: string:
onoptionButtonselect?:() => void;
disabled? : boolean
alwaysopen?: boolean;
beforeoptionElement?: Jsx.Element I string:
alignDropdownLeft?: boolean
.

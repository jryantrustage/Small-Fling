typescript
import ( DisplayMode ) from 'styles/themes/themeutility';

export enum size (
sMALL = small'',
LARGE = ‘ Large',
.

export interface ICorecheckBoxProps
id?: string:
className? : string
arialabel: string:
children? : Jsx.Element | string
size? : size;
disabled? : boolean
checked? : boolean;
onchange?: (value: any) => void;
onBlur?:(value: any) => void
isParentclickable?: boolean;
isInDynamicForm?: boolean;
errorText?: string

* The number specifying the tab order of the check box.

tabIndex? : number

* Reference to the underlying DoM element.

forwardedRef?: React.Refobject<HTMLInputElement> I ((instance: HTMLInputElement | null) => void) | null;

* Boolean determining whether the icon type for a partially selected select all group.

selectAliDisplay?: string:

* Boolean determining whether the icon type for a partially selected select all group.

selectAliPartial?: boolean;

* Boolean determining whether the icon type for all options selected of the group.

selectAliselected?: boolean
.

export interface ICheckBoxscprops
disabled? : boolean
checked: boolean;
mode: DisplayMode
size: size;
isParentclickable?: boolean;
errorText?: string
isInDynamicForm?: boolean;
tabIndex? : number
.

```
<I -- CODESCAN_ FILE_END -->

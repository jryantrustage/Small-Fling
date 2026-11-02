typescript
import ( Ioption ) from 'core/entities/loanApplication';
import t Mode  from 'styles';
import ( IcoN_TYPEs  from '../Icon/constants';

type ComboboxMenuButton =
label: string:
onclick: () => void;
```
export interface IComboboxProps
‘id': string;
aname': string:
'value': string:
‘options : Ioption[]:
‘onchange': (name: string, value: string) => void;
‘onBlur'? : () => void;
placeholder'?: string:
disabled'?: boolean;
'deactivateFilter'?: boolean
label'?: string:
hasLabelIcon'?: boolean
hasLabelInInput'?: boolean;
'className'?: string:
‘iconType'?: ICoN_TYPES;
isReadonly'?: boolean
'shouldscrollIntoview'?: boolean;
'errorMessage'?: string:
isExposed'? : boolean;
‘isExposedsmall'?: boolean
'mode'? : Mode
'subText'?: string
'dropdownMenuButton'?: ComboboxenuButton;
'aria-labelledby'?: string;

* whether to use fixed positioning for the dropdown menu element.

isFixedDropdown'?: boolean;
.

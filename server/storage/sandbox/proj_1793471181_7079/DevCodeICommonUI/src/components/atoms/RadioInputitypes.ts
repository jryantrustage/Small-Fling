typescript
import ( size  from 'core/enums';

import ( DisplayMode ) from 'styles/ themes';

type Ivalue = Jsx.Element I string:

export interface IRadioInputprops
id?: string:
name: string:
children? : Ivalue
disabled? : boolean
checked? : boolean
value: any:
colorscheme?: DisplayMode;
showverticalDivider?: boolean
size?: size;
className?: string
arialabel?: string
onchange?:(value: any) => void
changeonchecked?: boolean;
.

export interface IsCRadioInputwrapperProps (
disabled? : boolean
checked: boolean;
colorscheme: DisplayMode:
size: size;
for? : string;
.

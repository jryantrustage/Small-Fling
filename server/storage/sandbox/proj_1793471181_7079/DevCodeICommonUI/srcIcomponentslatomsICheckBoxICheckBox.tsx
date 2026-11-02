typescript
import ( DisplayMode ) from 'styles/themes';
import ( ColorModecontext  from 'styles/modes';

import ( IcoN_TYPEs ) from 'components/atoms/Icon';

import React,  syntheticEvent, usecontext } from 'react';

import ( a11ykeydown  from '../a11y'

import { ScheckBoxContainer, HiddenCheckbox, SCCheckbox, CheckBoxIcon, ChildContainer } from './styles';
import ( ICheckBoxProps, size ) from './types';

const doNothing = (): void => ();

const getIconName = ({ colorMode, size }: ( colorMode: DisplayMode; size: Size }): IcoN_TYPES => {
if (size === size. ARGE)
return colorMode === DisplayMode.LIGHT ? ICON_TYPES. LARGE_CHECKMARK_BLACK : ICON_TYPES.LARGE_CHECKMARK_WHITE;
.
return colorMode === DisplayMode.LIGHT ? ICON_TYPES.SMALL_CHECKMARK_BLACK : ICON_TYPES.SMALL_CHECKMARK_WHITE;



* @requires ColorModeContext
* Basic checkbox input component.
* Consists of a visible checkbox and uses a hidden checkbox for accessibility.
* @deprecated use CorecheckBox instead

const checkBox = (t
id,
children,
checked = false,
disabled = false,
size,
className
arialabel = '',
onchange = (): void => ),
isParentclickable = true
: ICheckBoxProps): Jsx.Element =>
const colorMode = useContext(ColorModecontext)

return
<sccheckBoxcontainer
className=fclassName)
disabled= disabledy
checked= checkedy
size= s ize)
mode= colorMode)
onclick={(e: syntheticEvent): void => (
e.preventDefault(o):
if (disabled) (
return; // do nothing
.
isParentclickable && onchange(Ichecked):

Hiddencheckbox
id= idy
aria-label=arialabely
checked=fcheckedy
onchange=( doNothing)
disabled= disabledy
onkKeyDown={(e: KeyboardEvent I React.KeyboardEvent<HTMLDivElement>): void => {
if (a11ykeydown(e))
e.preventDefault(o):
if (disabled)
return; / / do nothing
.
onchange(Ichecked);
.


<sccheckbox
aria-label=arialabely
checked=fcheckedy
s ize=(s ize)
mode={colorMode,
onclick={(e: syntheticEvent): void =>
e.preventDefault():
if (disabled)
return: I / do nothing
.

!isParentclickable & onchange(!checked);

<CheckBoxIcon name={getIconName({ colorMode, size )) checked={checked) size={size === Size.LARGE ? 24 : 12) />
</sccheckbox>

<Childcontainer size={size)>(children)</Childcontainer>
/sccheckBoxContainer>
```
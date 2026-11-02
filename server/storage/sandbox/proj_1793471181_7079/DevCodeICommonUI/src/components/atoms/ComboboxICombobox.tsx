typescript
import React, ( useCallback, useEffect, useRef, usestate ) from 'react';
import ( useCombobox, Usecomboboxstate ) from 'downshift';
import  DisplayMode } from 'styles';
import ( Icon, IcoN_TYPEs ) from 'components/atoms/Icon';
import ( CoreButton ) from ‘components/atoms/CoreButton'';
import ( Ioption ) from 'core/entities/loanApplication';
import ( escapeNewRegExpstring } from ‘helpers/utils'';
import ( shouldilteronkeyup ) from 'types/generics';
import
sccombobox
sccomboboxInput,
sccomboboxLabel,
sccomboboxLabelIcon
sccomboboxsubtext,
scInputErrorMessage,
scInputwrap,
scMenu,
scMenu tem,
scMenuToggle,
scMenuwrap.
scNooptionsMessage
from './ styles';
import ( IComboboxprops  from '. /types';
import ( FixedContainer  from '../Fixedcontainer';

const UP_ARRow_KEY = ‘Arrowup'';
const DOWN_ARROw_KEY = ‘ArrowDown';


* Combobox component used across loan-application, DynamicForm, and UI.

const combobox = (t
id,
name,
value = '',
options,
onchange,
onBlur,
placeholder,
disabled,
deactivateFilter = false,
className
iconType = ICON_TYPES.ARROW_DOWN_FIT
isReadonly.
errorMessage.
label,
has LabelIcon.
has LabelInInput,
subText
mode = DisplayMode.LIGHT,
isExposed = false,
isExposedsmall = false,
dropdownMenuButton,
shouldscrollIntoview = true
isFixedDropdown = false
.. . rest
: IComboboxProps): Jsx. lement => (
const [itemsFilter, setItemsFilter] = usestate('');
const sortedoptions = options.sort(a, b) =>
if (la.order  Ib.order)
return o;
.
return a.order - b.order;


const inputItems = itemsFilter
? sortedoptions.filter((option) =>
new RegExp('l\b$(escapeNewRegExpstring(itemsFilter)', 'i').test(option.label ?? '')
.
: sortedoptions:

const stateReducer = (_state: UseComboboxstate<Ioption>, actionAndChanges: any): any => {
const  type, changes } = actionAndchanges;
const ( selectedItem, inputvalue  = changes;

switch (type)
case usecombobox.statechangeTypes.Inputclick:
return
. . . changes
isopen: _state.isopen, I/ do not toggle the menu when input is clicked.
````
case useCombobox.statechangeTypes. Inputchange
if (selectedItem && inputValue === ·')
return
.. . changes,
selecteditem: null,
```
.
return changes:
defaul t:
return changes:
.


const handlechange = usecallback(
(t selectedItem }: ( selectedItem?: any ) => (
setItemsFilter('):
if (selecteditem?. value Il value)
onchange(name, selectedItem? . value Il '):
.

[name, onchange, value]
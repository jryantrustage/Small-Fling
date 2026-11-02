typescript
import React from 'react';
import  useselect  from 'downshift';
import ( IcoN_TYPEs, Icon ) from 'components/atoms/Icon';
import ( ISselectDropdownoption ) from 'core';
import ( scsRonlyLabel  from 'styles/shared';
import ( IDropdownProps  from '. /types';
import
scstylizedDropdown,
scLabel,
scLabelwrap,
scpaddedIcon.
scTrigger,
scTriggerIcon,
scMenuwrapper,
sCMenu,
scMenuItems,
scMenuitem,
scoptionButton
sCBeforeoptionwrap
from './ styles';

Const OPTION_BUTTON_VALUE = ‘OPTION_BUTTON_VALUE'';

const defaultTriggerIcon = <Icon name={ICON_TYPES.CHEVRON) size={16} />;
const defaultDisabledTriggerIcon = <Icon name={ICON_TYPES.CHEVRON_DISABLED) size={16} />;


* @deprecated - Use the Combobox component with the isExposed prop
* @component Dropdown
* @param (string) id?
* @param (string) className?
* @param (Jsx.Element | string) label? - The text above the clickable trigger element (AKA the "eyebrow")
* @param (Jsx.Element) labelIcon? - Optional icon to go next to the label
* @param (string) ariaLabel? - Used to ensure a11y when label is not provided
* @param (JSx.Element | string) triggerElement (REQUIRED) - clickable element to open options menu
* @param (Jsx.Element | null) triggerIcon? - Optional icon to go next to triggerElement
* @param (Jsx.Element | null) triggerIconDisabled? - Icon to show when dropdown is disabled
* @param (string) hideTriggerIcon? - Optional flag to hide triggerIcon
* @param (ISelectDropdownoption[]) options? - List of dropdown options to show in menu
* @param (string) name? - Optional name identifier that is passed to the onchange
* @param (string) value? - Currently selected index value of the options array
* @param ((name: string, value: string) => voidy onchange? - What to do when the selected value is changed
* @param (string) optionText: (REQUIRED) Text for button at the bottom of the options menu
* @param (() => voidy onoptionButtonselect?
* @param (boolean) disabled? - Wwhen disable Dropdown menu cannot be opened
* @param (boolean) alwaysopen? - Force Dropdown menu to always be open
* @param (Jsx.Element | string) beforeoptionElement? - Optional element to display inside the option menu, before the options

const Dropdown = (t
id,
className =
label
label Icon,
arialabel,
triggerElement,
triggerIcon = defaultTriggerIcon,
triggerIconDisabled = defaultDisabledTriggerIcon,
hideTriggerIcon = false.
opt ions = [.
name =
value = '',
onchange,
optionText,
onoptionButtonselect,
disabled,
alwaysopen.
beforeoptionElement,
alignDropdownLeft,
: IDropdownProps): Jsx.Element =>
const handlechange = ({ selectedItem }: { selectedItem?: ISelectDropdownoption | null }): void => {
const selectValue = selectedItem? value ?? '';
if (selectValue === OPTION_BUTTON_VALUE)
onoptionButtonselect & onoptionButtonselect();
} else if (selectValue I= value && onchange)
onchange(name, selectvalue)
selectedItem? .action & selectedItem.action()
.
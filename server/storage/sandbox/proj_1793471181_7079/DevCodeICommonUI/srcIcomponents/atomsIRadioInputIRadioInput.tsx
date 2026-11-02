typescript
import  size  from 'core/enums'

import ( DisplayMode } from 'styles/themes';

import React from 'react'

import { sCRadioInputwrapper, ScRadioInput, sCLabel } from './styles';
import ( IRadioInputProps  from './types'


* Basic radio input component.
* Consists of a visible radio and uses a hidden input for accessibility.

const RadioInput = (t
arialabel,
id,
name,
children,
value
checked = false,
disabled = false,
colorscheme = DisplayMode. LIGHT,
size = size. DEFAULT,
className = ,
onchange = (): void => ),
changeonchecked = false.
: IRadioInputProps): Jsx.Element =>
Il Returning a the field value instead of the input field event, because it was build this way initially
I/ and returning the input field event will break some existing functionality
const handlechange = (): void => (
onchange(value):
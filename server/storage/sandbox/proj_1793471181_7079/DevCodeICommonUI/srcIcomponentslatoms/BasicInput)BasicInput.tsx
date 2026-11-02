typescript
import React from 'react'

import ( sCBasicInput, sCBasicInputError  from './styles';
import ( IBasicInputProps  from './ types'


* Base level input component. Primarily used by the ‘Input' component.

const BasicInput = (props: IBasicInputProps): Jsx.Element => (
const { onchange, onBlur, onFocus, label, invalid, value, error, errorId, maxLength, ...rest  = props;

return

<sCBas icInput
onchange=fonchange)
onBlur=fonBlury
onFocus=fonFocus
aria-label=(labely
invalid={invalidy
value value,
maxLength= (maxLength
. resty

(invalid && error && <SCBasicInputError id={errorId)>(error)</SCBasicInputError>}

```
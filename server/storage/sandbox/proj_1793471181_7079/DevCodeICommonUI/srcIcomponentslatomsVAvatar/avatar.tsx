typescript
/* eslint-disable no-nested-ternary *

eslint

no-nested-ternary : 1,
react/destructuring-assignment:1,
eqeqeq: 1,


import React from 'react'
import ./avatar.css';

// Use the following to implement small or medium avatar sizes:
//<Avatar fName={'Andrea') 1Name={'Cronin') size={'md'}/>

// If size parameter is left off the default is large
// Available sizes are sm: 24x24, md: 48x48; lg: 56x56

export const Avatar = (( size, fName, IName, idName }: any): Jsx.Element => {
const idNamesuffix = idName ? _$(idName)' : ';

return
<div
id='avatarcircles(idNamesuffix)'
aria-label={'Avatars(idNamesuffix)'
className='avatarcircle
data-testid='avatarcircle'>
div
id={'AvatarInitialss(idNamesuffix)'
aria-label='Avatar Initials'
className={size === 'sm' ? 'small' : size === ‘'md' ? 'medium' : 'large'j>
(fName. charAt(o) + 1Name.charAt(o)
/div>
/div>
```
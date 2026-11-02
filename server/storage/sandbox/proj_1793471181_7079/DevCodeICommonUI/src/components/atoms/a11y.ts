typescript
import React from 'react';

enum Key
ENTER_KEY = Enter'',
SPACE_KEY = · ,
SPACE_KEY_ALT = ‘space',
.


* Determines appropriate keydowns ('space' and 'enter') for accessible interactions
* and returns true or false
* @param e

export function a11ykeydown(
```
KeyboardEvent
React.KeyboardEvent<HTMLLIElement>
React.KeyboardEvent<HTMLDivElement>
I React.KeyboardEvent<HTMLButtonElement>
): boolean I undefined
if (e. type = ‘ keydown')
const  key + = e:
if (key === Key.ENTER_KEY II key === Key.SPACE_KEY Il key === Key.SPACE_KEY_ALT) (
return true:
.
.
return false;
.

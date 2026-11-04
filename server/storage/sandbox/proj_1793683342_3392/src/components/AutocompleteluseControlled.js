/* istanbul ignore file */
/* eslint-disable react-hooks/rules-of-hooks, react-hooks/exhaustive-deps */

import * as React from 'react';

export default function useControlled({
controlled,
default: defaultProp,
name,
state = 'value',
}) {
// isControlled is ignored in the hook dependency lists as it should never change.
const { current: isControlled } = React.useRef(controlled !== undefined);
const [valueState, setValue] = React.useState(defaultProp);
const value = isControlled ? controlled : valueState;

  if (process.env.NODE_ENV !== 'production') {
React.useEffect(() => {
if (isControlled !== (controlled !== undefined)) {
console.error(
[
`Material-UI: A component is changing the ${
isControlled ? '' : 'un'
}controlled ${state} state of ${name} to be ${
isControlled ? 'un' : ''
}controlled.`,
'Elements should not switch from uncontrolled to controlled (or vice versa).',
`Decide between using a controlled or uncontrolled ${name} ` +
'element for the lifetime of the component.',
"The nature of the state is determined during the first render, it's considered controlled if the value is not `undefined`.",
'More info: https://fb.me/react-controlled-components',
].join('\n'),
        };
}











































type=".js" size="258" lines="11" chars="258" -->
```javascript
/* istanbul ignore file */
import * as React from 'react';

const useEnhancedEffect =
typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

[>>
* Private module reserved for @material-ui packages.
>[
export default useEnhancedEffect;

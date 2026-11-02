typescript
import { ColorModecontext } from 'styles/modes';

import React, ( usecontext  from 'react';

import  scDiv  from '. /styles';
import ( IPanelProps  from './types';


* Basic panel component that accepts children.
* @requires ColorModeContext

const Panel = (t children, bubbleBorder = false, nestLevel = O, alert, ...rest }: IPanelProps): Jsx.Element => (
const mode = useContext(ColorModecontext);
return
<sCDiv mode={mode) bubbleBorder=(bubbleBorder) className='Panel' nestLevel={nestLevel) alert={alert} (...rest)>
(children
/sCD iv>
````
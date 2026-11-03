typescript
import * as React from 'react';

import ( scomponentswrapper ) from 'styles';
import  IFooterProps } from './types';


* Basic footer component used in the selection wizard.
* Text content for the terms and conditions are conditionally rendered.

const Footer = ({ children, displayMode, className, id }: IFooterProps): Jsx.Element =>(
<sCFooter displayMode={displayMode) id={id) className={className)>
<scComponentswrapper>(children)</scComponentswrapper>
/sCFooter>


export + Footer f:

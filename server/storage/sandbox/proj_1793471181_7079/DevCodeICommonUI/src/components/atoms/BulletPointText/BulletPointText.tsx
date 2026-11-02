typescript
import React from 'react';

import ( Reactcomponent as Ellipse ) from './svg/Ellipse8.svg';

import ( sCBulletPointText  from './styles';
import ( IBulletPointTextProps  from './types';


* BulletPointText
* @summary
* Bullet point with custom "ellipse" svG taken from Figma
* should be rendered inside a <ul></ul> for accessibility purposes
* Bullet svG, font style, and spacing from bullet matches commonly used bullet points
* across different components on Figma. Supports LIGHT and DARK modes
* Bullet point should be vertically aligned with center of FIRST LINE of text
* @param (React . ReactNode) children
* Children should usually be string, but keeping it as generic ReactNode in case we want markdown, images, etc.
* @param (DisplayMode) displayMode

const BulletPointText = ({ children, className, displayMode }: IBulletPointTextProps): Jsx.Element => {
return
<sCBulletPointText className={(className) displayMode={displayMode)>
Ellipse aria-hidden />
<span>(childrenj</span>
/sCBulletPointText>

typescript
import React from 'react';
import ( IDrawerProps  from './ types';
import closesvg from '../static/close.svg'
import { sCDrawer, SCDrawerBody, SCDrawercloseButton, sCDrawercloseButtonwrapper } from './styles';

export const Drawer = (t
children,
width = '38opx',
offsetDrawerHeight = 72px'',
isExpanded,
oncloseDrawer,
: IDrawerpProps): Jsx.Element =>
return
<sCDrawer isExpanded={isExpanded) offsetDrawerHeight={offsetDrawerHeight) width={width) data-testid='drawer'>
<scDrawercloseButtonwrapper id='close-drawer-button-wrapper'>
<scDrawercloseButton
id=-close-drawer-button'
data-testid='closeDrawerButton'
is Ghost
onclick={(e: React. MouseEvent<HTMLButtonElement>) => (
oncloseDrawero):
e.preventDefault():

<img alt='close drawer' src={closesvg) />
/ scDrawerclos eButton>
/scDrawercloseButtonwrapper>
<sCDrawerBody id='drawer-body'>(childrenj</sCDrawerBody>
/ scDrawer>
```
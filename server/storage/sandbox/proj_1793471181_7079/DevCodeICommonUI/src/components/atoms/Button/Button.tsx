typescript

* Basic button component; exports PrimaryButton and SecondaryButton.
* used for onclick interactions.

import * as React from 'react';

import ( DisplayMode ) from 'styles/themes';

import ( sCPrimaryButton, scsubPrimaryButton, scSecondaryButton, scSubsecondaryButton  from './styles';
import  IProps  from . /types';


* Basic button component; exports PrimaryButton and SecondaryButton.
* used for onclick interactions.
* @deprecated use CoreButton instead

export const PrimaryButton = (t
id,
children,
disabled,
onclick,
displayMode,
className
tabindex,
.. .props
: IProps): Jsx.Element => (
scpr imaryButton
id= idy
className= (className
onclick=fonclick
type= button''
disabled= disabledy
displayMode={displayMode
tabIndex={tabIndex}
. props)
(childreny
/scprimaryButton



* @deprecated use CoreButton instead

export const subprimaryButton = (t
id,
children,
disabled,
onclick,
displayMode,
class Name.
tabindex,
.. .props
: IProps): Jsx.Element => (
<scsubprimaryButton
id= idy
className=(className
onclick=fonclick
type=-button''
disabled= disabledy
displayMode={displayMode
tabIndex={tabIndex)
. props)
(children
/scsubprimaryButton



* @deprecated use CoreButton instead

export const secondaryButton = (t
id,
children,
disabled,
onclick,
displayMode,
tabindex,
.. .props
: IProps): Jsx.Element => (
scsecondaryButton
id= idy
onclick=fonclick
type= button''
disabled= disabledy
displayMode={displayMode
tabIndex={tabIndex}
. props)
(childreny
/scsecondaryButton



* @deprecated use CoreButton instead

export const SubsecondaryButton = ({ id, children, disabled, onclick, tabIndex, ...props }: IProps): Jsx.Element => (
<scsubsecondaryButton id={id) onclick={onclick) type='button' disabled={disabled) tabIndex={tabIndex) (...props)>
(childreny
/scsubsecondaryButton


/* istanbul ignore next *
secondaryButton.defaultprops =
children: null,
onclick: (): void => t
disabled: false,
displayMode: DisplayMode.LIGHT,
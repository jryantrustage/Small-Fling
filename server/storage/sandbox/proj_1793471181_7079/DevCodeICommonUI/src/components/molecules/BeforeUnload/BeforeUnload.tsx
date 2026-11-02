typescript
import React,  useEffect, usestate  from 'react';
import ( useconfirmModal  from ‘hooks/modal'';
import ( useTypedTranslation  from 'i18n'
import { BlockerFunction, useBlocker } from 'react-router-dom';
import ( IBeforeunloadprops  from '. /types';

const Beforeunload = (t
nativeDialogue
formsvalid,
formsDirty,
onsaveAndcontinue,
tenantLogo.
modaloverrides = ,
openModalonRepeatedExitAttempts,
shouldaAlwaysBlock = false,
onBlock = undefined
: IBeforeunloadProps): Jsx.Element => (
const [confirmModalIsVisible, setconfirmodalIsVisible] = usestate(false);
const [lastLocation, setLastLocation] = usestate<string | null>(null):
const [confirmedNavigation, setconfirmedNavigation] = usestate(false);
const [backButtonselected, setBackButtonselected] = usestate<boolean>();
const showconfirmModal = useconfirmModal();
const  t  = useTypedTranslationo)

use f fect(() =>
const handleLeavePage = (eventRef: BeforeunloadEvent): string => (
const confirmationMessage = 'required message (do not remove)';
// eslint-disable-next-line
eventRef.returnValue = confirmationMessage; I/ Gecko, Trident, Chrome 34+
return confirmationMessage; // Gecko, Webkit, Chrome <34


if (nativeDialogue && formIsDirty)
window.addEventListener('beforeunload', handleLeavePage);
.

return (): void =>
window.removeEventListener('beforeunload', handleLeavePage);
```
, [nativeDialogue, formIsDirty):

const handleBlockedNavigation: BlockerFunction = ({ nextLocation, historyAction ): boolean => (
const backButton = historyAction === 'pop'

if (
IconfirmedNavigation &
typeof nextLocation !=- ‘undefined' &&
(formIsDirty Il backButton Il shouldAlwaysBlock)

setBackButtonselected(backButton):
setconfirmModalIsvisible(true):
setLastLocation(nextLocation?.pathname);
onBlock?.(nextLocation, historyAction):
return true:
.

return false;
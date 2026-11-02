typescript
import React,  usecontext } from 'react';
import ( Modal } from 'components/molecules/Modal';
import ( Markdown } from 'components/molecules/Markdown';
import ( IModalProps  from 'store/modal';
import ( scModalContent, scApplicationModalTitle } from 'styles/Modal';
import ( CoreButton ) from ‘components/atoms/CoreButton';
import ( scAppModalFooter, sCLogocontainer } from './styles';
import ( ModalContext } from 'context/ModalContext';

export const formatValueAsJsxorMarkdown = (value?: string I string[] I Jsx.Element): JSx.Element I undefined => {
if (typeof value === ‘'string' Il Array.isArray(value)) (
return <Markdown text={value) />;
.

return value


export const AppModal = (t
id = 's imple-confirm',
body
title,
ariatitle,
headerHasFocus.
continueBtnText,
continueBtnDisabled,
cancelBtnText,
cancelBtnclassName
continueBtnclassName,
oncontinue.
onclose
oncloseBtnclick,
oncontinueBtnclick,
onxBtnclick,
fuliPageModal
cancelBtnorder
continueBtnorder,
ghostBtnorder,
onGhostBtnclick,
ghostBtnText,
modalwindowclassName,
stacked,
1ogo,
width,
displayMode,
: IModalProps): Jsx.Element =>
const ( modalstate } = usecontext(Modalcontext):
const handlecontinueclick = (): void =>
oncontinueBtnclick?.(modalstate)
oncontinue?.(modalstate);
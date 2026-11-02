typescript
import React from 'react';
import ( a1ykeydown } from 'components/atoms/a11y';
import ( IEditButtonProps } from './types'
import { sCButton, sCDisableButton, sCButtoncontentwrapper  from './styles';

const EditButton = ( id, ariaLabel, disabled = false, handleNavigation : IEditButtonProps): Jsx.Element => {
const VIEW_PosITION = 'center'

const handleFocus = (e: React. FocusEvent<HTMLButtonElement>): void => (
e.target.scrollIntoview(t
block:VIEw_PosITION,
inline: VIEw_PosITION,

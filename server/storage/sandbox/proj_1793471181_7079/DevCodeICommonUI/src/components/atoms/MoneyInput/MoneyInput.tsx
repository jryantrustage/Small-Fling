typescript
import React,  useCallback, usestate, useEffect } from 'react';
import ( formatMoneyValue, parseMoney } from helpers/Money';
import ( IMoneyInputProps } from './types'
import ( scBasicInput } from './styles';

const format = (value: number, showDecimals = false): string =>
formatMoneyvalue(value,
shortenThousands: false,
showDecimals.



* Wrapper for ‘BasicInput' component. Formats value as currency.

const MoneyInput = ( value, onChange, onBlur, ariaLabel, showDecimals, ..props : IMoneyInputProps): JSx.Element => {
const [isFocused, setFocused] = usestate(false):
const [internalValue, setInternalValue] = usestate(format(value Il o, showDecimals)):
use f fect(() =>
setInternalValue(format(value Il o, showDecimals));
, [value, setInternalvalue, showDecimals]);

const changevalue = usecallback(
(e: React. ChangeEvent<HTMLInputElement>): void =>
setInternalvalue(e.target.value.replace(/[^so-9. +/g, *'));

[setInternalvaluel


const exitFocusMode = useCallback((): void =>
set Focused(false):
const value = parseMoney(internalvValue);
onchange && onchange(value):
onBlur && onBlur(value):
, [setFocused, onchange, onBlur, internalvalue]):

const enterFocusMode = usecallback(): void =>
set Focused(true)
, [set Focused]);
return
<scBas ic Input
value={isFocused ? internalValue : format(value Il o, showDecimals))
onchange=fchangevalue)
onBlur=fexitFocusMode)
onFocus= enterFocusModey
label=farialabely
. . props

```
typescript
import React from 'react'
import  isNaN  from 'lodash';
import ( formatMoneyvalue } from ‘helpers /Money'';
import ( IMoneyTextProps, IDollarValue, ICentsValue ) from './types';


* Accepts a value and returns it formatted as currency.

const MoneyText = (p: IMoneyTextProps): Jx.Element =>
let value = (p as IDollarvalue).dollarvalue;
if (Ivalue && typeof value I== 'number') (
value = (p as ICentsValue).centsValue / 1oo
.
return <>(!isNaN(value) && formatMoneyValue(value, p)</>;
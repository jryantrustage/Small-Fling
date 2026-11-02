typescript
import ( IValueRule } from ‘core/entities/loanApplication'';

export interface ICurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
value: string:
onchange: (name: string, value: string) => void;

* Number of decimals, defaults to o.

fractionDigits?: number

* The max total value that can be entered by the user

maxvalue?: number

valueRules?: IValueRule[l:
.

typescript
export interface IPercentageInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onchange'> {
value: string:
onchange: (name: string, value: string) => void;
error? : boolean;
/** Number of decimals, defaults to o. *
fractionDigits?: number;
maxvalue? : number
minvalue?: number
.

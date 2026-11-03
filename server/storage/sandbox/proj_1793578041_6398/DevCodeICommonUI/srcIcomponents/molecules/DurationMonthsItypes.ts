typescript
export interface IDurationMonthsProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
name: string:
value: string:
onchange: (name: string, value: string) => void
onBlur? : () => void;
shouldscrollIntoview?: boolean;
.

export enum SELECT_FIELD_NAME (
YEARs = 'duration-years',
MoNTHs = 'duration-months',
.

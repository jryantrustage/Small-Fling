typescript
***********************************************************
INTERFACES: Text Input
*********************************************************

* Properties interface for the ‘'IInputPropsType' component.

export interface IMaskedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> (

* used to detect the mask type

fieldType: string:
value: string:
onchange: (name: string, value: string) => void
.

```
<I -- CODESCAN_ FILE_END -->

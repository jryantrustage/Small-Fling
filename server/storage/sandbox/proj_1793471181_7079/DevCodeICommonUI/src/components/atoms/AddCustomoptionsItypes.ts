typescript
import React from 'react'

export interface IAddcustomoptionsProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
label?: string;
value: string:
onchange?: (name: string, value: string) => void;
.

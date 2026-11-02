typescript
import ( HtmlHTMLAttributes  from 'react';


currently supported variants
- Default (blue)
- Error (red)
- warning (yellow)
- success (green)


export interface IGrowl extends HtmlHTMLAttributes<HTMLDivElement> (
title?: string;
message? : string:
buttond: string:
onclose: React . MouseEventHandler<HTMLButtonElement>;
timeout? : number;
icon? : string:
iconcomponent?: React.ReactElement;
variant?: ‘Default' 丨 ‘Error' | 'Generic Error' | ‘Warning' 丨 ‘success';
className? : string
buttonclassName?: string:
showcloseButton?: boolean;
id?: string:
children? : Jsx.Element
.

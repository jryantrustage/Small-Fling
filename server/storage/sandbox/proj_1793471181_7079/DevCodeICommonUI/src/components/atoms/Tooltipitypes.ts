typescript
export enum Tooltipsize
LARGE = ‘large'',
sMALL = 'small',
.

export enum TooltipDirection
TOP_LEFT = ‘ top-1eft ''
TOP_CENTER = ‘ top-center'',
TOP_RIGHT = top-right'',
BOTTOoM_LEFT = ‘ bottom-1eft''
BOTTOM_CENTER = “bottom-center'',
BOTTOM_RIGHT = ‘bottom-right',
.

export interface ITooltiprops
id?: string:
className?: string
title?: string;
titlealign?: string:
body? : string:
linkText? : string:
linkurl?: string:
btnText?: string:
onclick?: () => void;
direction?: TooltipDirection;
size? : Tooltipsize
.

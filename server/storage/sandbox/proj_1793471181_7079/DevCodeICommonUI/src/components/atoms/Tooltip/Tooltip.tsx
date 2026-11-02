typescript
import React from 'react';

import { SCTooltip, SCTooltipTitle, SCTooltipContent, SCTooltipFooter, SCTooltipLink, SCTooltipBtn } from './styles';
import ( TooltipDirection, ITooltipprops, Tooltipsize ) from './types';

const noop = () => ():


* Tooltip
* @summary
* Tooltip info taken from Figma
* The tooltip will vertically grow as more text is added to it
* The position the tooltip can be moved using the class tooltip_override
* example & .tooltip_override ( top: 25px; left: -114px;


const Toolt ip = (t
id,
className =
title,
titleAlign,
body,
linkText,
linkurl = ,
btnText,
direction = TooltipDirection.BOTToM_LEFT,
size = Tooltipsize.sMALL,
onclick = noop.
: ITooltipprops): Jsx.Element =>
const componentId = id ? 'tooltip-$(idy' : undefined;

return (
<scCTooltip id={componentId) className={'$(className} tooltip_override'} direction={direction) size={size)>
(title ＆& <sCTooltipTitle align={titleAlign)>(title)</scTooltipTitle>}
(body && <scTooltipcontent size={size)>(body)</sCTooltipcontent>}
(size === Tooltipsize LARGE && (
<scTooltipFooter>
(linkText && <sCTooltipLink href={linkurl)>(linkText)</sCTooltipLink>)
btnText && (
<scTooltipBtn size='small' onclick={onclickj>
btnText)
</scTooltipBtn>

/scTooltipFooter

/scTool t ip>



export  Tooltip f;

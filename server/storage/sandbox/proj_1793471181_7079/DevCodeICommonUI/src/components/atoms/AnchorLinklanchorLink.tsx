typescript
import React from 'react'
import ( IAnchorLink } from '. /types'
import ( scAnchorLink } from './styles';


* Renders a react scrollchor link element. Element attributes will be passed through
* @param (string) text - required text for link
* @param (string) className? - optional className for needed css overrides
* @param (string) id? - optional id for style overrides or QA testing
* @param (string) to - required page id needed for anchor
* @param (function) beforeAnimate? - function executed before animation
* @param (function) afterAnimate? - function executed after animation
* @param (object) animate? - object defining animate properties
* @param (boolean) disableHistory? - boolean to decide whether link is shown in url
* @param (boolean) show? - boolean to decide whether link is visible
* @param (number) offset? - positive or negative number setting the offset from the anchor for final positioning
* @param (number) duration? - duration of animation in ms
* @param (boolean) active? - boolean to decide whether link is active


export const AnchorLink = (t
text,
className =
id = ',
to,
beforeAnimate = () => (y,
afterAnimate = () => (
animate,
disableHis tory.
show = true,
active = false,
: IAnchorLink) => (
scAnchorL ink
id= idy
to=  $ to,
className={'$(className} $(show ? +· : ‘hide'} $(active ? 'active' : '"}'}
beforeAnimate=(beforeAnimate
afterAnimate=fafterAnimate)
animate=fanimate)
disableHistory=disableHistory>
(text)
</scAnchorLink>


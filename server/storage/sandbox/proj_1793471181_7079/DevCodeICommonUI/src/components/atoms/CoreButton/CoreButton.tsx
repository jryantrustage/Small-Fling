typescript
import React from 'react'
import ( Shape } from 'styles/themes/themeutility';
import  DisplayMode } from 'styles';
import { SCButton, SCButtonContentContainer, SCButtonContentContainerInner } from './styles';
import ( IProps, Buttonsizes ) from './types';
import ( spinner } from '../ pinner';


* CoreBut ton
* @param props - All prop types can be found in the directory types file
* @summary Button aligned with new design kit

export const CoreButton = (t
id,
forwardedRef
children,
class Name.
onclick,
readonly.
disabled,
tabindex,
size =
shape = shape. Rounded,
displayMode = DisplayMode. LIGHT,
issecondary = false,
type =  button',
nowrap.
loading.
isGhost,
. .props
: IProps) =>
return
<scButton
id= idy
data-testid={idy
ref= forwardedRefy
className={'$(className Il ''} ${readonly ? 'readonly' : ''y'}
onclick=fonclicky
type= typey
disabled={disabled I readonly Il loading
shape=( shape)
displayMode= displayMode)
tabIndex= tabIndex
size={Buttonsizes['$(size}' as Buttonsizes])
nowrap=( nowrap:
issecondary={issecondary,
is Ghos t= is Ghosty
(. props)>
((!loading  isGhost) & children)
(loading && lisGhost &(
<scButtoncontentcontainer>
children
<sCButtonContentContainerInner data-testid={'core-button-spinner-${id}'} displayMode={displayMode)>
<spinner width={25) height={25) />
/sCButtoncontentContainerInner
/sCButtoncontentContainer>

/ sCBut ton




* ForwardRefCoreButton
* @summary Core button with ref access, needed for downshift props

export const ForwardRefCoreButton = React.forwardRef<HTMLButtonElement, IProps>((props, ref) => (
<CoreButton forwardedRef={ref) ( . . .props) />


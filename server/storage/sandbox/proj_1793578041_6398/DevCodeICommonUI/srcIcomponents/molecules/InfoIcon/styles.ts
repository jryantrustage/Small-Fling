typescript
import styled from 'styled-components';
import  Theme  from 'styles';
import ( IPropsHook ) from 'styles/themes/themeutility';
import ( InfoIconprops  from '. /types';

export const scCInfoIcon = styled.span<Partial<InfoIconProps>>

&: focus.
&: act ive
border-width: 1px;
border-style: solid;
border-color: $(t darkMode ): IPropsHook =>
darkMode ? Theme.getcolor('contrastGreyscaleo1') : Theme.getColor('contrastBlack'));
.
.
& svg
cursor: pointer:
.

& path
fill: $((t darkMode ): IPropsHook =>
darkMode ? Theme.getColor('contrastGreyscaleo1') : Theme.getColor('contrastBlack'):
.

& path first-child
stroke:l $((t darkMode ): IPropsHook =>
darkMode ? Theme.getcolor('contrastGreyscaleo1') : Theme.getColor('contrastBlack'));
fill: none;


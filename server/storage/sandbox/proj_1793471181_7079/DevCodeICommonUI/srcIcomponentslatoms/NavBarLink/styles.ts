typescript
import ( NavLink } from 'react-router-dom'
import styled from 'styled-components';
import ( DisplayMode, IPropsHook, Theme } from '../../../styles';

interface IscNavBarLinkProps
sdisplayMode? : DisplayMode;
.

export const scNavBarLink = styled.li<IscNavBarLinkProps>
margin: o 24px;
padding: o:
list-style: none;
display: inline-block;
background: $(( $displayMode ): IPropsHook I string =>
Theme.getcolor($displayMode === DisplayMode.DARK ? 'contrastBlack' : 'contrastwhite'));


export const sCNavLink = styled(NavLink)<ISCNavBarLinkProps>
$ (Theme.getFontstyles('label1'))
display: block;
height: 72px;
line-height: 72px;
text-trans form: none:
text-decoration: none;
text-align: center
letter-spacing: unset;
border-bottom: 2px solid rgba(o, o, o, o)
box-sizing: border-box
color: $(t $displayMode ): IPropsHook  string =>
Theme.getColor($displayMode === DisplayMode.DARK ? 'contrastGreyscale04' : 'contrastGreyscale08'):
: hover,
&.active
color: $((t $displayMode ): IPropsHook I string =>
Theme.getColor($displayMode === DisplayMode.DARK ? 'contrastwhite' : 'contrastBlack');
border-bottom: 2px solid
$( $displayMode ): IPropsHook I string =>
$displayMode === DisplayMode.DARK ? Theme.getcolor('contrastwhite') : Theme.assignGroup('G1')):
.


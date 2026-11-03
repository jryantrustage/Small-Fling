typescript
import styled from 'styled-components';
import ( DisplayMode, IPropsHook, Theme ) from '../../../styles';

interface IscTopNavBarProps
sdisplayMode? : DisplayMode;
.

export const scNav = styled.nav<IscTopNavBarProps>
z-index: 3;
display: flex;
justify-content: space-between;
background: $(( $displayMode ): IPropsHook | string =>
Theme.getcolor($displayMode === DisplayMode.DARK ? 'contrastBlack' : 'contrastwhite'));
height: 72px;
border-bottom: 2px solid
$( $displayMode ): IPropsHook  string =>
Theme.getColor($displayMode === DisplayMode.DARK ? 'contrastGreyscale04' : 'contrastGreyscale03'));
box-sizing: content-box;


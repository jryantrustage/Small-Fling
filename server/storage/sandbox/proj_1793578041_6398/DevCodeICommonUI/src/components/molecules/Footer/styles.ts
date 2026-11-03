typescript
import styled from 'styled-components';
import t Theme  from 'styles';
import ( IFooterprops } from './types';
import ( DisplayMode } from 'styles/themes';

const scFooter = styled.footer<IFooterProps>
position: fixed;
bottom: o:
left: o:
flex: o:
box-sizing: border-box
max-width: 100%;
z-index: 10:
background-color: $((t displayMode, theme 1): string =>
displayMode === DisplayMode. DARk
? Theme.getcolor('contrastBlack')(t theme )
: Theme.getcolor('contrastwhite')(t theme )
color: ${Theme.assignGroup('G1', ‘#262c30'):
padding: 24px
border-top-width: 2px;
border-top-style: solid;
border-top-color: $((t displayMode, theme }): string =>
displayMode =-- DisplayMode.DARk
? Theme.getcolor('productuitraBlack')(t theme )
: Theme.getcolor('contrastGreyscaleo3')(t theme ):
width: 100%;
$( Theme.getMediaQuery(Theme.sm)
position: absolute:
width: 100%;
bottom: -196px;
padding: 24px 16px:
.


export t scFooter ;

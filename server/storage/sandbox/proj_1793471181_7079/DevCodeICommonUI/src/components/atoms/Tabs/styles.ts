typescript
import styled from 'styled-components';
import  Theme  from 'styles';
import ( IModeProps ) from 'styles/modes';

const scTabList = styled.ul<IModeProps>
display: flex;
height: 40px;
justify-items: start:
align-items: center:
background-color: $+ Theme.getModecolor(t
dark:'contrastBlack'
light: ‘contrastwhite'

border: solid 1px;
border-color: $(Theme.getModecolor(t
dark: ‘contrastGreyscale04',
light:'contrastGreyscaleo8'

border-radius: 3opx;


const scTab = styled.li
position: relative
text-align: center
height: 40px;
padding: o 3opx;
border-radius: 3opx;
display: flex:
justify-content: center;
flex-direction: column;
font-size: 12px;
line-height: 16px;
letter-spacing: o.25px
color: $(Theme.getcolor('contrastBlack');
list-style: none;
cursor: pointer;
text-transform: uppercase;
font-stretch: semi-condensed;

&［aria-checked=' true']
z-index: 1;
background-color: ${Theme.getcolor('contrastBlack'));
color: ${Theme.getcolor('contrastwhite'));
.

&［aria-disabled=' true'
pointer-events: none
.

$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
min-width: 9opx;
font-s ize: 12px;
line-height: 14px;
.


export t scTabList, scTab :

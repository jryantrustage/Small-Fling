typescript
import  Theme  from 'styles';
import styled,  css } from 'styled-components';

import { scstylizedcurrencyInput } from 'styles/stylized/scstylizedcurrencyInput';

interface IFlexprops
readonly grow? : boolean;
.

export const scstylizedMoneyInput = styled(scstylizedcurrencyInput)
outline: none
box-shadow: inset -1px -4px 6px 0 rgba(230, 234, 235, 0.2):
border: solid 1px $(Theme.getcolor('contrastGreyscale02')
background-color: $(Theme.getcolor('contrastGreyscaleo1')
border-color: $(Theme.getcolor('contrastGreyscaleo5');
opacity: 1; /required for ios
-webkit-text-fill-color: $(Theme.getcolor('contrastBlack');

& + button
display: block;
.

&& disabled
background-color: transparent
outline: none;
transition: all, o.3s;
border: solid 1px transparent
.


export const scErrorspacer = styled.div
margin-top: 4opx;
$ (Theme.getMediaQuery(Theme.XL))
margin-top: 23px
.


const scFlexItem = styled.div<IFlexProps>
display: flex;
flex-grow: $(t grow ): number => (grow ? 1 : o);
min-width: o;
$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
margin-top: 14px
.


const scFlexRow = styled.div
display: flex;
flex-direction: row;
width: 100%;
$ (Theme.getMediaQuery(Theme.XL))
margin-top: 16px
.
$ (Theme.getMediaQuery(Theme. LG))
margin: 23px 0 60px o:
.
$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
margin-top: o:
.


const HeroFont = css
font-weight: soo:
font-stretch: expanded
$ (Theme.getMediaQuery(Theme. SM, Theme.MD) (
font-size: 48px;
.
$ (Theme.getMediaQuery(Theme. LG, Theme.XL) (
font-size: 72px;
letter-spacing: -2px;
.
line-height: normal:


const scHeroText = styled. div
> input
$ HeroFonty
padding: o;
color: $(Theme.getcolor('contrastBlack'));

: hover,
: focus,
: active t
border: 1px solid $(Theme.getcolor('contrastGreyscale05'));
.

: focus,
: active
background-color: ${Theme.getcolor('contrastGreyscaleo1'):
.
.

$ ( HeroFonty
color: $(Theme.getcolor('contrastBlack');


const scLabelText = styled. span''
font-size: 16px;
font-weight: normal;
font-stretch: semi-expanded;
letter-spacing: -o.5px;
margin-left: 5px;


export ( sCFlexRow, sCFlexItem, sCHeroText, sCLabelText ;

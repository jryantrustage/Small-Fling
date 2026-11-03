typescript
import styled from 'styled-components';
import { Theme, DisplayMode } from 'styles/themes';

export const scserviceListcard = styled.div
padding: 2px;
border-radius : 8px
background-color: $t(t theme f) =>
theme.displayMode === DisplayMode.DARK ? Theme.getColor('productGreyscale02') : Theme.getColor('contrastwhite')):

$( Theme.getMediaQuery(Theme.SM, Theme.MD) (
padding: 8px;
.


export const scHeading = styled.div
$(Theme.getFontstyles('title5'))
line-height: 26px;
letter-spacing: - px;
font-size: 2opx;
font-style: normal
color: #262c30;
$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
font-size: 16px;
margin-bottom: 12px;
.


export const scservicescontainer = styled.div
display: flex:
flex-wrap: wrap:
gap: 8px:
margin-top: 8px;
justify-content: space-between;
align-items: center:
align-self: stretch;

$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
gap: 6px;
.


export const scserviceItem = styled.span'
font-size: 16px;
$ (Theme.getFontstyles("body1')
line-height: 2opx;
display: flex:
align-items: center:
gap: 8px:
$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
padding: 6px 12px;
font-s ize: 12px;
.


export const scserviceIcon = styled. img'
width: 22px;
height: 18px;
flex-shrink: o;
aspect-ratio: 11/9

$ (Theme.getMediaQuery(Theme. SM, Theme.MD) (
width: 15px:
height : 12px;
.


export const scserviceName = styled. span'
font-size: 16px;
line-height: 20px;
color: #262c30;
$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
font-size: 14px;
.


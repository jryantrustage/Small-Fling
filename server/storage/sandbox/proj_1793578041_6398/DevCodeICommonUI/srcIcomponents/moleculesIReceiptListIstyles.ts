typescript
import styled, ( css, FlattenInterpolation, ThemeProps } from 'styled-components';
import  IscItemProps } from './ types';
import  Theme  from 'styles';

export const scReceiptItem = styled. div
position: relative
display: flex;
justify-content: space-between;
max-width: 100%;


const HighlightedLabel = css'
color: $(Theme.getColor('contrastGreyscale04'):

.
export const sCLabel = styled.span<IscItemProps>
color: $(Theme.getcolor('contrastGreyscale04')):
white-space: nowrap:
margin-right: 4px;

$((t highlighted }): FlattenInterpolation<ThemeProps<IsCItemProps>> I false I undefined =>
highlighted && HighlightedLabel);


export const scDivider = styled.span
width: 100%;
height: 15px;
margin-left: -2px;
color: $(Theme.getColor('contrastGreyscale04'):
border-bottom: 1px $(Theme.getcolor('contrastGreyscale04') dashed;


export const scvalue = styled.div<IscItemprops>
$( Theme.getFontstyles("body2')
background-color: $(Theme.getcolor('contrastBlack'));
color: $(Theme.getcolor('contrastGreyscale04')):
margin-inline-start: o
white-space: nowrap:
display: flex:
flex-direction: row;

justify-content: center;
background: $(Theme.getcolor('contrastGreyscale04');
border-radius: 1opx;
color: $(Theme.getcolor('contrastBlack'));
display: flex;
height: 2opx;
width: 2opx;
min-height: 2opx
min-width: 20px;
aggmp

dd. highlighted
display: flex;
flex-direction: row;


.
export const scReceiptList = styled.div
$( Theme.getFontstyles('strong2')
$( Theme.getMediaQuery(Theme.SM, Theme.MD)) (1
line-height: 16px;

display: flex;
flex-direction: column
flex-wrap: nowrap:

.

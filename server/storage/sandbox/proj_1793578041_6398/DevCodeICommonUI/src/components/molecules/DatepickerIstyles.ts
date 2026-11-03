typescript
import styled from 'styled-components';
import  Theme  from 'styles';
import ( IDatePickeroverlaywrapperProps ) from './types';
import ( DisplayMode ) from 'styles/themes/themeutility';
import ( scutilityInput  from 'styles/utility';
import ( scFlexError ) from 'components/atoms/ErrorMessage/styles';

export const sCDatePickeroverlaywrapper = styled.div<Pick<IDatePickeroverlaywrapperProps, 'displayMode'>＇
$(Theme.getFontstyles(body2'')
color: $t(t displayMode y)
displayMode === DisplayMode.DARK ? Theme.getColor('contrastwhite') : Theme.getcolor('contrastBlack'):

.rdp
margin: o:
border-radius: 1opx;
border: solid 1px ${Theme.getcolor('contrastGreyscale03')):
padding-bottom: opx;

background-color: $(t displayMode ) =>
displayMode == DisplayMode.DARK ? Theme.getColor('productultraBlack') : Theme.getColor('contrastGreyscale01');

border-color: $(t displayMode ) =>
displayMode == DisplayMode.DARK ? Theme.getColor('contrastGreyscale05') : Theme.getColor('contrastGreyscale07'));

.rdp-mon ths
display: flex;
flex-direction: column
align-items: center;
.rdp-month
display: flex;
flex-direction: column;
margin: 16px
width: 189px
.

.rdp-week
display: flex;
justify-content: space-between;
.
.

.rdp-row
.rdp-head_row
display: flex;
justify-content: space-between;
margin-bottom: 5px


.rdp-head_cell
$ (Theme.getFontstyles('strongi'))
color: $t(t displayMode f) =
displayMode === DisplayMode.DARk
? Theme.getcolor(°contrastGreyscale04'')
: Theme.getcolor(°contrastGreyscaleo8''));
font-size: 1opx;
line-height: 16px;
height: 2opx
width: 20px;
.
.
.

.rdp-caption
display: flex;
justify-content: space-between;
font-size: 14px;
margin-bottom: 16px;
> .rdp-caption_label
padding: o;
$ (Theme.getFontstyles("body1'):"
color: $ (t displayMode ) =>
displayMode === DisplayMode.DARK ? Theme.getColor('contrastwhite') : Theme.getColor('contrastBlack'));
.
$ {Theme.getMediaQuery(Theme. SM, Theme.MD)}
font-size: 16px;
.
@media (max-width: 640px)
font-size: 14px;
.
.

.rdp-nav_button

display: inline-flex;
width: 2opx:
&: disabled
display: none;
visibility: hidden;
width: o;
height: o:
.
: hover:not(: disabled)
background-color: transparent:
.
.

.DayPickerInput-overlay
width: 100%
background: transparent:
box-shadow: none
z-index: 3;
.

.rdp- day
font-size: 1opx;
display: flex;
width: 2opx;
height: 2opx;
justify-content: center;
align-items: center;
border: 1px solid transparent
$ {Theme.getMediaQuery(Theme. MD)}
font-size: 14px;
.
&: hover
border: px solid;
.
@media (min-width: 520px) and (max-width: 640px)(
font -size: 12px;
.

@media (min-width: 380px) and (max-width: 519px)(
font-size: 1opx;
.

$ {Theme.getMediaQuery(Theme. sM)}
font-size: 14px;
.
.

.rdp- day_today
color: $ ((t displayMode f) =>
displayMode == DisplayMode.DARK ? Theme.getcolor('contrastwhite') : Theme.getcolor('contrastBlack')):
.


opacity: o0.515;
color: $ t(t displayMode ) =
displayMode = DisplayMode.DARK ? Theme.getcolor('contrastwhite') : Theme.getColor('contrastBlack')):
.

.rdp-button[disabled] :not(.rdp-day_selected)
opacity: 0.515;
color: $ t(t displayMode ) =
displayMode = DisplayMode.DARK ? Theme.getcolor('contrastwhite') : Theme.getColor('contrastBlack')):
.

.rdp-button:not(.rdp-day_selected)
color: $ ((t displayMode f) =>
displayMode == DisplayMode.DARK ? Theme.getcolor('contrastwhite') : Theme.getcolor('contrastBlack')):
.

.rdp-day_selected.rdp-day_outside
opacity: 1;
background-color: $(t displayMode ) =>
displayMode = DisplayMode.DARK ? Theme.getcolor('contrastwhite') : Theme.getColor('contrastBlack')):
color: $ t(t displayMode ) =
displayMode = DisplayMode.DARK ? Theme.getcolor('contrastBlack') : Theme.getColor('contrastwhite')):
.

.rdp:not(.rdp_interactionDisabled) .rdp-day:not(:disabled):not(.rdp-day_selected):not(.rdp-day_outside) (
& hover
background-color: $ (t displayMode ) =>
displayMode === DisplayMode.DARK ? Theme.getColor('productultraBlack') : Theme.getColor('contrastGreyscale01');
.
.

.rdp-day_selected:not(:disabled):not(.rdp-day_outside) (
pos ition: relative:
background-color: $t(t displayMode y) =>
displayMode = DisplayMode.DARK ? Theme.getcolor('contrastwhite') : Theme.getColor('contrastBlack')):
color: $ t(t displayMode ) =
displayMode = DisplayMode.DARK ? Theme.getcolor('contrastBlack') : Theme.getColor('contrastwhite')):
& hover
background-color: $ (t displayMode ) =>
displayMode === DisplayMode.DARK ? Theme.getColor('contrastwhite') : Theme.getcolor('contrastBlack'):
color: $ t(t displayMode y) =>
displayMode === DisplayMode.DARK ? Theme.getColor('contrastBlack') : Theme.getcolor('contrastwhite'):
.



export const SCIconWrapper = styled.button< displayMode?: DisplayMode; isActive?: boolean }>''
border: 1px solid;
border-color: $((t displayMode, isActive ) =>
if (displayMode === DisplayMode.DARK && isActive) (
return Theme.getcolor('contrastwhite');
.
if (displayMode !== DisplayMode.DARK && isActive) (
return Theme.getcolor('contrastBlack');
.
if (displayMode === DisplayMode.DARk)
return Theme.getcolor('contrastGreyscaleo6');
.
return Theme.getcolor('contrastGreyscaleo7'):


border-left: none
display: flex:
flex-direction: row;
align-items: center:
padding: 8px 12px
border-top-right-radius: 1opx;
border-bottom-right-radius: 1opx;
min-width: 48px;
height: 100%;
cursor: pointer;
background-color: $((t displayMode, isActive ) => (
if (displayMode === DisplayMode.DARK && isActive) (
return Theme.getcolor('contrastwhite'):
.
if (displayMode !== DisplayMode.DARK &＆& isActive)
return Theme.getcolor('contrastBlack'):

if (displayMode === DisplayMode.DARK)
return Theme.getColor('productuitraBlack'):
.
return Theme.getcolor('contrastGreyscaleo1'):

svg path
fill: $ (t displayMode, isActive ) => (
if (displayMode === DisplayMode.DARK && isActive)
return Theme.getcolor('contrastBlack'):
.
if (displayMode !== DisplayMode.DARK && isActive)
return Theme.getcolor('contrastwhite'):
.
if (displayMode === DisplayMode.DARk)(
return Theme.getcolor('contrastwhite');
.
return Theme.getcolor('contrastBlack'):

.

&: disabled
pointer-events: none
background-color: transparent
border: 1px solid ${Theme.getcolor('contrastGreyscale06')):
border-left: none:
.

&:not(.invalid):not([disabledi):hover (
border-color: $(t displayMode ) =>
if (displayMode === DisplayMode.DARk)(
return Theme.getcolor('contrastGreyscaleo5');
.
return Theme.getcolor('contrastGreyscaleo8');

.

svg
transform: translatey(ipx):
.


export const scInputwrap = styled.div<
displayMode?: DisplayMode
disabled? : boolean
error? : boolean;
isActive?: boolean

position: relative
width: 296px;
border-radius: 1opx;
display: flex;
flex-direction: row;
align-items: flex-start;
left: opx
height: 40px;

&.invalid $(scIconwrapper)
background-color: $(t displayMode, isActive ) =>
if (displayMode === DisplayMode.DARK && lisActive) (
return ‘rgba(249, 92, 105, 0.1)':

if (displayMode === DisplayMode.DARk)(
return Theme.getcolor('contrastwhite');
.
if (isActive)
return Theme.getcolor('contrastBlack');
.
return Theme.getcolor('errorBackground'):

.
border-color: $(t displayMode, isActive ) =>
if (displayMode === DisplayMode.DARK && isActive)
return Theme.getcolor('contrastwhite'):
.
if (displayMode == DisplayMode.DARk) (
return Theme.getcolor('darkError'):
.
if (isActive)
return Theme.getcolor(contrastBlack');
.
return Theme.getcolor('error'):

.

&.invalid $(scutilityInput)
background-color: $(t displayMode ) =>
if (displayMode == DisplayMode.DARk) (
return ‘rgba(249, 92, 105, 0.1)':
.
return Theme.getcolor('errorBackground'):



if (displayMode === DisplayMode.DARk)(
return Theme.getcolor('darkError'):
.
return Theme.getcolor('error'):


&:not(.invalid):not([disabledi):hover
border-color: $t(t displayMode ) =>
if (displayMode === DisplayMode.DARk)
return Theme.getcolor('contrastGreyscaleo5');
.
return Theme.getcolor('contrastGreyscaleo8');

.
.

& $ (scutilityInput)
&: disabled

border-color: $(Theme.getcolor('contrastGreyscale06');
.
border: 1px solid;

border-radius: 1opx opx opx 1opx;
height : 100%;
color: $t(t displayMode, isActive ) =>
if (displayMode === DisplayMode.DARK && lisActive) (
return Theme.getcolor('contrastGreyscale04');
.
if (displayMode === DisplayMode.DARK && isActive)
return Theme.getcolor('contrastwhite'):
.
if (isActive)
return Theme.getcolor('contrastBlack'):
.
return Theme.getcolor('contrastGreyscaleo8');


background-color: $t(t displayMode, error ) => {
if (error)
return ‘rgba(205, 33, 85, 0.1) ;
.
if (displayMode == DisplayMode.DARk) (
return Theme.getcolor('productuitraBlack'):
.

return Theme.getcolor('contrastGreyscaleo1'):

border-color: $(t displayMode, isActive ) =>
if (displayMode !== DisplayMode.DARK && isActive)(
return Theme.getcolor(contrastBlack');
.
if (displayMode === DisplayMode.DARK && isActive) (
return Theme.getcolor('contrastwhite');
.
if (displayMode == DisplayMode.DARk) (
return Theme.getcolor('contrastGreyscale06');
.
return Theme.getcolor('contrastGreyscaleo8'):

.


export const scDatePickerwrapper = styled.div
$ scFlexErrory

margin: 8px o o o:

& span
margin: 2px o o 8px;
.


margin: o o o 1opx
.
.


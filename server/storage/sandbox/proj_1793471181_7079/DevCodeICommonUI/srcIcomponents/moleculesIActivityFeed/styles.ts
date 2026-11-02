typescript
import styled from 'styled-components';
import  Theme  from 'styles';

import progressLine from '../../atoms/Icon/svg/progress-complete-long-line.svg';
import activityoriginsystem from '../../atoms/Icon/svg/activity-origin-system.svg';
import activityoriginBDx from '../../atoms/Icon/svg/activity-origin-bdx.svg';
import activityoriginMember from '../../atoms/Icon/svg/activity-origin-member.svg';

export const sccontainer = styled.div
color: $(Theme.getcolor('contrastwhite'));
background-color: $(Theme.getcolor('contrastBlack'));


export const scActivityFeedwrapper = styled.div
display: flex;
margin-top: 1opx;
color: $(Theme.getcolor('contrastwhite'));


export const scItemmarker = styled.div
min-width: 12px;
margin-right: 8px;


export const scActivityListItemText = styled.div
display: flex;
margin-top: -3px;
width: 100%;
font-weight: 40o:
flex-direction: column


export const scActivityListItemTitle = styled.div
text-align: left;
font-size: 14px;


export const scActivityListItemDescription = styled.div
line-height: 40px;
color: #c2c6c9;


export const scLonglLine = styled.div
height: 100%;
background-repeat: repeat-y
background-image: url(\"$ (progressLine)\"):


export const scDotMenu = styled. div
text-align: right;
font-size: 35px;
margin-right: 23px
margin-top: -3opx;
margin-bottom: 3opx;


export const scprogressList = styled.div''

enum Activityorigin
SYSTEM = 1,
BDx = 2,
MEMBER = 3,
.

export const scActivityMarker = styled.div<( activityorigin: Activityorigin >
height: 1opx;
background-repeat: no-repeat:

$t(t activityorigin ): string =>
if (activityorigin === Activityorigin.sYSTEM) return “background-image: url("$(activityoriginsystem)");'';
if (activityorigin === Activityorigin.BDx) return ‘background-image: url("$(activityoriginBDX)"):'';
if (activityorigin === Activityorigin.MEMBER) return “background-image: url("$(activityoriginMember)");'';
return ''



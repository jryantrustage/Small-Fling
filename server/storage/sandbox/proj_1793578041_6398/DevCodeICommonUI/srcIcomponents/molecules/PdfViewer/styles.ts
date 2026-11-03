typescript
import  Theme  from 'styles';

import styled from 'styled-components';
import  CoreButton  from '../.. atoms';

export const scDiv = styled.div'';

export const scviewercontainer = styled.div
width: 100%:
height : 100%;
display: flex:
flex-direction: column;
$( Theme.getMediaQuery(Theme.MD, Theme.SM, Theme. LG))
padding: 24px;
.


export const scviewerImage = styled. img''
width: 100%;


export const scpdfNavigation = styled.div
display: flex:
flex-direction: row;
justify-content: space-around;
padding- top: 12px

$( Theme.getMediaQuery(Theme.sm)
flex-direction: column;
align-items: center;
gap: 4px;
.


export const PdfNavButton = styled(CoreButton)
$ (Theme.getMediaQuery(Theme. SM, Theme.MD) (
min-width: 120px
.


export const PdfPagecount = styled. div
white-space: nowrap:
padding: opx 12px


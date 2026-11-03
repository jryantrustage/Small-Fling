typescript
import styled from 'styled-components';
import ( LoxButton  from 'components/atoms';
import  Theme  from 'styles';

const neverMediaQuery = ‘@media (width: o) '';
const alMediaQuery = @media all'';

export const scIconImgcontainer = styled. div
display: flex:
margin: 5opx auto auto 4opx
justify-content: flex-end;
align-items: flex-start;
cursor: pointer;
width: 5opx;

$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
display: none;
.


interface IMediaQueryProps
isstatic: boolean;
isMobileorTablet: boolean;
.
.
const mobileAndTabletMediaQueryHandler = (t isstatic, isMobileorTablet : IMediaQueryProps) => {
if (isstatic) return neverMediaQuery
if (isMobileorTablet) return allMediaQuery:
return Theme.getMediaQuery(Theme.SM, Theme. MD);
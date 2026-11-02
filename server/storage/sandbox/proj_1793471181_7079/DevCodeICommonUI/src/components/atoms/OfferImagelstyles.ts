typescript
import styled, ( css ) from 'styled-components';
import ( offerImagesize  from '. /types';

const getDimensions = (( size }: ( size: offerImagesize }) => (
switch (size)
case 'small':
return css
height: 83px
border-radius: 4px;

case 'medium':
return css''
height: 112px;
border-radius: 1opx;

case large' :'
return css
height: 302px;
border-radius: 2opx;

case fluid' :'
default:
return css
width: 100%;
height: unset:
border-radius: 2opx;
aspect-ratio: calc(720 / 314):

.


export const scImgcontainer = styled.div<{ size: offerImagesize; bgcolor: string >
$ tgetDimens ions)

$ t(t bgcolor ) =
bgcolor &&
css
background-color: $ bgcolory;
aspect-ratio: calc(720 / 314):
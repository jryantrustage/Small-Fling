typescript
import styled from 'styled-components';
import  Theme  from 'styles';
import ( DisplayMode ) from 'styles/themes';
import ( IPropsHook ) from 'styles/themes/themeutility';
import ( Tagsize ) from 'core/enums';

const handlesizeType = (size?: Tagsize): string =>
switch (size)
case Tagsize. MEDIuM:
return 12px'';
case Tagsize.sMALL:
return 1opx'';
default:
return 1opx'';
.
````
const handlesizePadding = (size?: Tagsize): string => (
switch (size)
case Tagsize. MEDIuM:
return '3px 4px 2px 4px*';
case Tagsize.sMALL:
return ‘2px 4px 1px 4px*;
default:
return 2px 4px 1px 4px'';
.

const handleLineHeight = (size?: Tagsize): string => (
swi tch (size)
case Tagsize. MEDIuM:
return 15px'';
case Tagsize.sMALL:
return 12px''
default:
return 12px''
.
```
const handleHeight = (size?: Tagsize): string => (
switch (size)
case Tagsize. MEDIuM:
return 16px';
case Tagsize.sMALL:
return 15px';
default:
return 15px';
.


export const scTag = styled.div<t
colorMode?: DisplayMode;
size? : Tagsize;
outlined? : boolean

display: inline-flex;
flex-direction: column
align-items: center:
justify-content: center;
border-radius: 2px
border: solid 1px;
border-color: $((t colorMode ): IPropsHook I string =>
if ((colorMode = DisplayMode.DARk)
return Theme.getcolor('contrastwhite'):
.
if (colorMode = DisplayMode.LIGHT)
return Theme.getcolor('contrastBlack'):
.
return 'transparent'

background-color: $(({ colorMode, outlined }): IPropsHook I string => (
if ((colorMode = DisplayMode.DARK && outlined === false) (
return Theme.getcolor('contrastwhite'):
.
if ((colorMode = DisplayMode.DARK && outlined === true) (
return transparent';
.
if (colorMode = DisplayMode.LIGHT && outlined === false) (
return Theme.getcolor('contrastBlack'):
.
if (colorMode = DisplayMode.LIGHT && outlined === true) (
return 'transparent';
.
return 'transparent'

span
font-size: $((props): string => handlesizeType(props.size));
color: $((t colorMode, outlined ): IPropsHook  string => {
if (colorMode === DisplayMode.DARK && outlined === false)
return Theme.getcolor('contrastBlack'):
.
if (colorMode === DisplayMode.DARK && outlined === true) (
return Theme.getcolor('contrastwhite');
.
if (colorMode === DisplayMode. LIGHT && outlined === false)
return Theme.getcolor('contrastwhite');
.
if (colorMode =-= DisplayMode. LIGHT && outlined =-= true) (
return Theme.getcolor('contrastBlack'):
.
return Theme.getcolor('contrastBlack'):

.
height: $((props): string => handleHeight(props.size);
padding: $((props): string => handlesizePadding(props.size):
line-height: $((props): string => handleLineHeight(props.size);


export const scTagcontent = styled.span'
$ (Theme.getFontstyles('label7'));
color: $(Theme.getcolor('contrastBlack');
text-transform: uppercase;


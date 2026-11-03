typescript
import styled, ( css, FlattenInterpolation, ThemeProps } from 'styled-components';
import  Theme  from 'styles';
import ( CoreButton } from 'components/atoms';

export const scTitlewrapper = styled.div
display: flex;
flex-direction: column


export const scBrandingImage = styled. img<
logo? : string:
altLogo?: string:

padding-right: 16px;
width: auto;
max-width: 8opx;
height: auto;
max-height: 40px;
content: $((t logo f): string => ‘url($(logo})};
$ (Theme.getMediaQuery(Theme. SM, Theme.MD) (
content: $(( logo, altLogo ): string => ‘url($(logo Il altLogo)'};
max-width: 6opx;
.


export const scTitleText = styled.p'
$(Theme.getFontstyles('label1');
$ ( Theme.getMediaQuery(Theme.SM, Theme.MD)) (
$(Theme.getFontstyles('label2')
.
letter-spacing: normal;
color: $(Theme.getcolor('contrastBlack');


export const scBrandingcontainer = styled.div<( info?: boolean >
display: flex;
flex-direction: row;
align-items: center:

$ (scTitleText)
margin-left: $(props): string => (props?.info ? ‘16px' : ‘opx')
.

$((props): false I FlattenInterpolation<ThemeProps<any>> I undefined =>
props? .info &&
css
$ {Theme.getMediaQuery(Theme.SM, Theme. MD) (
flex-direction: column;
align-items: flex-start

$ scBrandingImage)
margin-bottom: 4px;
.
.
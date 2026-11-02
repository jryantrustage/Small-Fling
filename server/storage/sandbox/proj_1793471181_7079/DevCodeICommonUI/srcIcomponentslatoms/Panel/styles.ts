typescript
import styled, ( css, SimpleInterpolation, FlattenInterpolation, ThemeProps  from 'styled-components';
import ( Theme ) from 'styles/ themes'
import ( IModeProps  from 'styles/modes';

export const scDiv = styled.div<{ bubbleBorder: boolean; nestLevel: number; alert?: boolean } & IModeProps>＇
margin-bottom: 16px;
padding: 16px
border-radius: 2opx;
position: relative

$(({ bubbleBorder }): SimpleInterpolation => (bubbleBorder ? ‘border-bottom-left-radius: Opx' : null));

background-color: $((t mode, theme, nestLevel }): SimpleInterpolation =>
Theme.getModecolor(t
dark: 'productBlack'
light: nestLevel % 2 ? ‘contrastGreyscaleo1' : 'contrastGreyscale02'',
)(t mode, theme f)):

$((( alert }): FlattenInterpolation<ThemeProps<any>>  string =>
alert
? css
background-color: ${Theme.getColor('systemsecureGreeno1'));
box-shadow: opx 3px 4px rgba(38, 44, 48, 0.1):
$ (Theme.getFontstyles("body2'"))
color: ${Theme.getcolor('contrastGreyscaleo8'):

strong
$(Theme.getFontstyles('strong2'))
color: ${Theme.getcolor('contrastBlack'):
.


margin-top: 1opx;
.



$ ( Theme.getMediaQuery(Theme.LG, Theme.XL)) (
padding: 24px;
.


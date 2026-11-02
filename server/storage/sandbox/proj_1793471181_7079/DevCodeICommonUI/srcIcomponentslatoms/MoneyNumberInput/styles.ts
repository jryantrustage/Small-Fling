typescript
import styled, ( css, FlattenInterpolation, ThemeProps ) from 'styled-components';
import  Theme  from 'styles';
import ( IModeProps ) from 'styles/modes';
import ( IPropsHook ) from 'styles/themes/themeutility';

import ( currencyInput  from 'components/atoms/CurrencyInput';

export const SCMoneyNumberInputContainer = styled.div<( hasError?: boolean; readonly?: boolean } & IModeProps>＇
position: relative
display: flex:
align-items: center;
height: 88px;
border-radius: 2opx;
min-width: 113px;
padding: 11px 16px 11px 16px;
border-radius: 2opx;
border: 1px solid $(Theme.getcolor('contrastGreyscaleo7')
box-shadow: inset -1px -4px 6px 0 rgba(230, 234, 235, 0.2):
background-color: $((props): IPropsHook =>
props.readonly
? Theme.getModecolor({ dark: 'contrastBlack', light: 'contrastwhite' )
: Theme.getModecolor(t
dark:'productuitraBlack',
light:‘contrastGreyscaleo1''

$((props): FlattenInterpolation<ThemeProps<IModeProps> I undefined | false =>
props.hasError &&
css
border: px solid ${Theme.getcolor('error'));
background-color: ${Theme.getcolor('errorBackground')
typescript
import styled from 'styled-components';
import ( IProgressNavigationButtonProps } from 'components/atoms/ProgressNavigationButton';
import ( Theme  from 'styles/themes';
import ( IPropsHook } from 'styles/themes/themeutility';

export const scDiv = styled.div''

export const sCDisableButton = styled.div<Partial<IProgressNavigationButtonProps>>
pointer-events: $(t disabled ): string => (disabled ? 'none' : ‘inherit')


export const scButton = styled.button'
cursor: pointer;
max-width: 40px;
max-height: 24px;
svg
width: 100%
height: auto;
.
: focus
rect
stroke-dasharray: 2, 2
stroke-width: 1.5px;
.
.
: hover
rect
fill: $(Theme.getcolor(°contrastBlack'));
stroke: ${Theme.getcolor('contrastwhite');
.
.
: active
rect
fill: $(Theme.getcolor('productultraBlack');
stroke: ${Theme.getcolor('contrastGreyscale04');
.
.


export const sCButtoncontentwrapper = styled.g<Partial<IProgressNavigationButtonProps>>
rect
stroke: $((t disabled ): IPropsHook =>
disabled ? Theme.getcolor('contrastGreyscaleo8') : Theme.getColor('contrastGreyscale04'));
fill: $ (t disabled ): IPropsHook =>
disabled ? Theme.getcolor('contrastBlack') : Theme.getcolor('contrastBlack');
.
path t
cursor: pointer;
fill: $((t disabled ): IPropsHook =>
disabled ? Theme.getColor('contrastGreyscale04') : Theme.getColor('contrastwhite'):
.


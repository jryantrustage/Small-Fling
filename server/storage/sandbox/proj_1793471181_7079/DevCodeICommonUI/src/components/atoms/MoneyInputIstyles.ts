typescript
import ( Theme  from 'styles';
import ( DisplayMode ) from 'styles/ themes';

import ( BasicInput ) from 'components/atoms/BasicInput';

import styled from 'styled-components';

export const sCBasicInput = styled(BasicInput)
&: disabled
color: $t(t displayMode, theme f): string =>
displayMode = DisplayMode.DARK ? Theme.getColor('T1')(( theme }) : Theme.getColor('contrastBlack')({ theme }):
-webkit-text-fill-color: $((t displayMode, theme 1): string =>
displayMode == DisplayMode.DARK ? Theme.getColor('T1')({ theme ) : Theme.getColor('contrastBlack')({ theme ));
opacity: 1; /* required on ios *
.


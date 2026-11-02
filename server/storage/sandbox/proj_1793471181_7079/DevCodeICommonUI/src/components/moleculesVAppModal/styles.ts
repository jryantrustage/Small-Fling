typescript
import styled from 'styled-components';
import  Theme  from 'styles';
import ( scModalFooter  from 'styles/Modal';

export const scLogocontainer = styled.div<
logo? : string:

display: flex;
padding: o:
margin-right: 16px

& > img
content: $({ logo f): string => 'url($(logoy)'};
max-width: 104px
max-height: 24px
.


export const sCAppModalFooter = styled(SCModalFooter)<{ stacked?: boolean }>
margin: o:
padding: 12px;

& button
margin: 12px;
width: unset;
max-width: unset:

${Theme.getMediaQuery(Theme.SM, Theme. MD)}
min-width: 100%

.
.


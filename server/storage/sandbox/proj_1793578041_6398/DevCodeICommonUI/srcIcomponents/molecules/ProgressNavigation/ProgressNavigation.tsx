typescript
import React from 'react';
import ( useTypedTranslation  from 'i18n'
import ( ProgressNavigationButton } from 'components/atoms/ProgressNavigationButton';
import ( IProgressNavigationProps } from './types';
import ( sCBackButton, scDiv, sCForwardButton  from '. /styles';

const ProgressNavigation = (t
handleNavigation,
previoussegment,
nextsegment,
loading.
: IProgressNavigationProps): Jsx.Element => (
const  t  = useTypedTranslation():

return

<scBackButton
<progressNavigationButton
id=- PrevioussegmentButton'
ariaLabel={t('DYNAMIC_FORM_PREVIOUS_SEGMENT')
disabled= previoussegment Il loading
handleNavigation={(): void => handleNavigation(( action: ‘Back' ))

/sCBackButton>
<scCForwardBut ton>
ProgressNavigationButton
id  NextsegmentButton
ariaLabel={t('DYNAMIC_FORM_NEXT_SEGMENT')
disabled= Inextsegment  loading
handleNavigation={(): void => handleNavigation(( action: ‘Forward' }))

/sCForwardButton
/sCD iv>
```
```
export  ProgressNavigation :

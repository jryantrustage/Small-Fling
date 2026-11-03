typescript
import React from 'react';
import ( EditButton ) from 'components/atoms/EditButton';
import ( useTypedTranslation  from 'i18n'
import ( Markdown } from 'components/molecules/Markdown';

import ( sCEditHeaderwrapper, sCLabelText  from './styles';
import ( IEditLinkprops  from '. /types';

const EditLink = (t
label,
id,
mode,
showEditBtn = true.
handleNavigation,
showAsGroupTitle,

const ( t  = useTypedTranslation():

return
<scCEditHeaderwrapper>
<sCLabelText showAsGroupTitle={showAsGroupTitle)
<Markdown text=(label) />
</ scLabelText
(showEditBtn &&(
Edi tButton
id= idy
ariaLabel={'$(t('GLOBAL_EDIT')) $(label.replace(/^#+\s/, '")"} // Converting markdown heading to plain string
handleNavigation={handleNavigation
disabled= false
displayMode= (mode)


/scEditHeaderwrapper>
```
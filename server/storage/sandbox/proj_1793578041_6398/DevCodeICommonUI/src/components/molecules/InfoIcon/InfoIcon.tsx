typescript
import React from 'react';
import ( IcoN_TYPEs, Icon } from 'components/atoms/Icon';
import ( useTypedTranslation  from 'i18n'
import ( InfoModalTrigger } from 'components/molecules/InfoModalTrigger';

import  scInfoIcon  from './styles';
import ( InfoIconprops  from '. /types';

const InfoIcon = (t
modalTitle.
moda lBody.
darkMode,
headerHasFocus.
onModalclose,
...buttonprops
: InfoIconProps): Jsx. lement => (
const ( t  = useTypedTranslation():

const arialabel
typeof modalTitle = 'string
? ‘${t('INFO_MODAL_TRIGGER_ARIA_LABEL')) $(modalTitle)′
: t('INFO_MODAL_TRIGGER_GENERIC_ARIA_LABEL');

return (

modalTitle=(modalTitle
moda Body= modalBody
onModalclose=fonModalclose
. ..buttonprops)
aria-label=(arialabely
headerHasFocus=(headerHasFocus >
<scInfoIcon darkMode= darkMode>
<Icon name={ICON_TYPES. INFORMATION) size={16) /
</scInfoIcon
/ InfoModalTrigger>



export t InfoIcon ;

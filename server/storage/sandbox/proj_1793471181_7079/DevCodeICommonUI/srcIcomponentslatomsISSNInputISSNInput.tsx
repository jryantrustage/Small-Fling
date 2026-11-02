typescript
/* eslint react/no-array-index-key:o */
import React, ( usestate ) from 'react';
import ( a1ykeydown, Icon, ICoN_TYPEs ) from 'components/atoms';
import ( FieldTypeValues ) from 'core/entities/loanApplication';
import ( MASK_FORMAT, applyInputMask  from ‘helpers/mask'';

import ( useTypedTranslation  from 'i18n'
import
scssNTextFieldwrapper,
scMaskedInput
scvis iblevaluewrap
scInvisiblevalue,
scMaskedvalue,
scMaskedvaluestars
scTogglemask,
from './ styles';
import ( IssNInputprops  from '. /types';


* Wrapper component for 'Input' component. Contains label and conditionally rendered icon.
* Adds a mask for the ssN field.
* @param id Input id
* @param value input field value
* @param onchange
* @param placeholder input field placeholder text
* @param maskToggle if true, allows toggling the visibility of the ssN

const ssNInput = (t
id,
name,
value = '',
onchange,
className
disabled,
maskToggle = false
.. . rest
: IssNInputProps): Jsx. lement => (
const  t  = useTypedTranslationo)
const maskedvValue = applyInputMask(value, MASK_FORMAT.ssN);
const visibleMaskedvalue = maskedvalue.slice(o, 7).replace(/\d/g, **').concat(maskedValue.slice(7');
const [showssN, setshowssN] = usestate(false);

return
<scssNText Fieldwrapper>
<scMaskedInput
id= idy
name= ( name)
fieldType={FieldTypevValues.ss}
value= (maskedvaluey
onchange=fonchange)
className=(className
disabled= disabledy
autocomplete='off
. . . resty


<scVisibleValuewrap className={className} disabled={disabled)>
<scInvis iblevalue
(/* Transparent value. Used to get the scMaskedvalue width */)
maskedvalue)

scMaskedvalue
(showssN && maskToggle ? (
span>(maskedvalue</span>


( /* Masked first 5 digits and 2 dashes */)
<scMaskedvaluestars>
vis ibleMaskedvalue
.slice(o, 7)
.split('')
.map(char: string, idx: number) =>(
<span key={idx)>(charj</span>

/scMaskedvaluestars>
( /* visible last 4 digits */)
<span>(visibleMaskedValue.slice(7)</span>


/scMaskedva lue>
</ scInvis iblevalue>
(maskToggle && Idisabled &&(
scTogglemask
role= button''
aria-label={showsSN ? t('INPUT_HIDE_ssN') : t('INPUT_SHOW_ssN')
tabIndex=toy
onclick=(): void =>
setshowssN && setshowssN(IshowssN)

onkeyDown={(event) : void =>
if (a1ykeydown(event))
setshowssN & setshowssN( IshowssN):
.

(showsSN ? <Icon name={ICON_TYPES.EYE_CROSSED) size={18} /> : <Icon name={ICON_TYPES.EYE) size={18} />)
/scToggleMask

/scvis iblevaluewrap>
/scssNTextFieldwrapper>
````
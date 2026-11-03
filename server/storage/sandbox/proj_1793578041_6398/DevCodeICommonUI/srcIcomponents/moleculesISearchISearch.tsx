typescript
import React, ( usestate ) from 'react';
import ( scutilityInputLabelwrap ) from 'styles';
import ( useTypedTranslation  from 'i18n'
import ( Icon, IcoN_TYPEs } from 'components/atoms/Icon';
import ( DynamicInputField ) from 'components/molecules/DynamicInputField';
import ( Isearchprops  from '. /types';
import { scsearchcontainer, scSearchButton, scsearchTerm } from './styles';
import ( NonFilterKeys  from 'types/generics';


* @summary
* A simple dynamic search component
* @param onsearch
* function that will be passed filtered search data
* @param label
* the search input label
* @param placeholder
* the search input placeholder
* @id
* an id for the search input


const search = (t
className
label
arialabel,
placeholder,
id,
onsearch,
fieldcode
searchonchange = true.
allowMultisearch,
: IsearchProps): Jsx.Element => (

const [inputValue, setInputvalue] = usestate('');
const [searchTerms, setsearchTerms] = usestate<string[]>([]);

const handlechange = (value: string) =>
set InputValue(value):
if (searchonchange)
onsearch(inputvalue):
.
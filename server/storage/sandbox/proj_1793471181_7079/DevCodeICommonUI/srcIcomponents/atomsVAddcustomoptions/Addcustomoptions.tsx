typescript
import React,  usestate  from 'react';
import ( IFormInputoption  from 'core';
import ( scutilityInput  from 'styles';
import { sCAddcustomoptionsWrapper, scCoreButton, sCAddcustomoptionWrapper  from './styles';
import ( IAddcustomoptionsProps ) from './types';

const Addcustomoptions = (t
name =
onchange,
className
label
id,
disabled,
value.
. .props
: IAddcustomoptionsProps): Jsx.Element =>
const [customoption, setCustomoption] = usestate<IFormInputoption>({ label: '', value: '', payload: 'custom' });
const customoptionstringValue = customoption.value.tostring();
const customAddButtonLabel = label ? '+ Add $(label)'.toLocaleuppercase() : '';
const handleAddcustomoption = () =>
const parsedValue = value ? (JsoN.parse(value) as IFormInputoption[l) : ［;
const hasDuplicateValue = parsedValue.map(t value ) => value).includes(customoptionstringValue);
if (IcustomoptionstringValue || hasDuplicatevalue) return;
const formattedForParsingFromFormValueoptions = JsoN.stringify([.. .parsedValue, customoption]);
onchange?.(name, formattedForParsingFromFormValueoptions);
setcustomoption( label: '', value: ‘', payload: ‘custom' 1):
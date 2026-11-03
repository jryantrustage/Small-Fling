typescript
import React,  useEffect, useRef, usestate } from 'react';
import ( IcoN_TYPES, Icon } from 'components/atoms/Icon';
import ( scutilityInput  from 'styles';
import ( IFilterProps  from '. /types';
import ( scFilter  from './styles';
import ( useTypedTranslation  from 'i18n'
import  debounce  from 'lodash'

const TableFilter =({ accessor, filterValue, label, onclearFilter, onFilter }: IFilterProps) =>{
const ( t  = useTypedTranslation():
const [filter, setFilter] = usestate(filterValue)
use f fect(() =>
setFilter(filtervalue):
, [filtervalue]):

const debouncedonFilter = useRef(debounce(onFilter(accessor), 5oo));

const onchange = (e: React.ChangeEvent<HTMLInputElement>): void => (
setFilter(e.target.value);
debouncedonFilter.current(e);
```
return
<scFil ter>
<scutilityInput aria-label=(label) onchange={onchange} value={filter) />
button
aria-label={t('TABLE_HEADER_FILTER_CLEAR_BUTTON_ARIA_LABEL')
type=- button'
onclick={onclearFilter(accessor))
<Icon name={ICoN_TYPEs.CLosE) size={14) /
/ button
</scFilter>



export t TableFilter f:

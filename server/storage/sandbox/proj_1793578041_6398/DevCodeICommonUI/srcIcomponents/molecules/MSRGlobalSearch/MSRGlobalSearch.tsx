typescript
import React from 'react';
import ( useTypedTranslation  from 'i18n'
import ( Icon, IcoN_TYPEs } from 'components/atoms/Icon';
import ( Ioption ) from 'core/entities/loanApplication';
import ( scsRonlyLabel  from 'styles';
import ( useMSRGlobalSearch  from '. /useMSRGlobalSearch';
import
scMaincontainer,
scsearchcontainer,
scDropdownutili ty,
scsearchinput,

sccancelButton,
scsearchInputwrapper,
scIconwrapper
from '. /styles';
import { IMSRGlobalSearchProps, SearchType } from './types';
import ( isMasked, getMaskFieldType, getMaxLengthField ) from './helpers';
import ( IMSRGlobalSearchResultsProps ) from '../MSRGlobalSearchResults/types'
import ( MSRGlobalSearchResults  from '../MSRGlobalSearchResults';


* @param initialType - which search type to initially render with
* @param initialResults - Manually set search results (used for unit testing)
* @returns A global search bar at the top of the page (in the NavBar organism)
* Different 'types' of searches come from the combobox dropdown
* Search results from several backend services are retrieved via AccountManagementservice
* The logic for displaying the search results has been split out into the MSRGlobalsearchResults component

const MsRGlobalsearch = (t
initialType = searchType.ssN,
initialResults
onsubmitsearch,
tenantId,
aoxurl,
dixurl,
: IMSRGlobalsearchProps): Jsx.Element =>
const ( t  = useTypedTranslation():

const
resu ts.
searchType.

isLoading,
hassearched,
showResults,
searchTypeoptions,
showalert,
viewAll
setviewall,
oncancel,
setshowResults,
handlekeyPress,
updatesearchvalue,
onsearchTypeupdate,
getsearchplaceholder,
= useMSRGlobalsearch(t tenantId, initialType, initialResults, onsubmitsearch );

const dropdownId = 'globalsearch-search-type-dropdown';
const dropdownLabelId = ‘$(dropdownIdy-label'';
const searchInputId = 'globalsearch-search-input';
const cancelButtonId = 'cancel-search-button';
const resultssectionProps: IMSRGlobalsearchResultsProps =
results.
viewAll
setviewall,
searchType,
isLoading.
hassearched,
showalert,
aoxurl,
dixurl,


return (
<sCMainContainer onFocus={() => setshowResults(true)) isFocused={showResults)>
<scsearchcontainer
<scsRonlyLabel htmlFor={dropdownId) id={dropdownLabelIdy>
(t(*COMBOBOx_LABEL ))
</ scsRonly Label>
<scDropdownutility
id= dropdownIdy
value={searchTypey
options={searchTypeoptions}
className=-left''
leftIcon=t
<scIconwrapper>
Icon name={ICoON_TYPES. SEARCH) size={14) />
/scIconwrapper>
.
onchange=(option: Ioption) => onsearchTypeupdate(option.value))

scsearchInputwrapper
(isMasked(searchType)? (
<scMaskedsearchInput
id={ searchInput Idy
data-testid={searchInputIdy
fieldType=getMaskFieldType(searchType))
value= searchvaluey
onchange={updatesearchvalue
onkeypPress=(handlekeyPress)
placeholder=(getsearchPlaceholder(searchType)
autocomplete='off'


<scsearchInput
id=(searchinput Idy
data-testid={searchInputIdy
value= searchvalue
onchange={(e: React.ChangeEvent<HTMLInputElement>) => updateSearchValue('input', e.currentTarget.value)
onkeypPress=(handlekeyPress)
placeholder=(getsearchPlaceholder(searchType)
maxLength=getMaxLengthField(searchType)
autocomplete='off'


sccancelButton
id= (cancelButtonIdy
data-testid=cancelButtonIdy
aria-label={t(°CANCEL_SEARCH')
onclick= oncancel)>
<Icon name={ICoN_TYPEs. CLosE) size={14) /
/sccancelButton>
/scsearchInputwrapper
</scsearchcontainer
(showResults && <MSRGlobalsearchResults (...resultsSectionProps) />)
/scMaincontainer>
```
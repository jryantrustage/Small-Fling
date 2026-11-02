typescript
import styled,  css } from 'styled-components';
import ( Theme, scutilityInput, DisplayMode, Mode  from 'styles';
import ( Icon  from 'components /atoms/Icon';


* @NoTE - any use of the '._selected' or '._active' selectors are for storybook
* purposes only. Do NoT use these in production


// Error overrides
const defaultErrorstyles = css'
border-color: $(Theme.getcolor('error')
background-color: $( Theme.getColor('systemRedo2');
&: hover
border-color: $(Theme.getcolor('error'):
.


const darkModeDefaultErrorstyles = css
border-color: $(Theme.getcolor('error'):
/* We can't use Theme.getcolor here because rgba natively doesn't support hex values */
background-color: rgba(205, 33, 85, 0.1):
&: hover
border-color: $(Theme.getcolor('error'):
.


// Error button overrides
const darkModeButtonErrorstyles = css< hasLabelInInput?: boolean J>
border-color: $(Theme.getcolor('error')
$ t(t hasLabelInInput ) => css
background-color: $(hasLabelInInput ? 'transparent' : 'rgba(205, 33, 85, 0.1)');
```
&: hover
border-color: $(Theme.getcolor('error'):
.


// Display mode overrides
const lightModeDefaultstyles = css<( value?: string >
color: $(({ value }) => (value ? Theme.getColor('contrastBlack') : Theme.getColor('contrastGreyscale08')));
background-color: $(Theme.getcolor('contrastGreyscaleo1')
border-color: $(Theme.getcolor('contrastGreyscaleo7');

&: hover
border-color: ${Theme.getcolor('contrastGreyscale08'));
.


const darkModeDefaultstyles = css<( value?: string y>'
color: $ (t value y) =>
value && value?.length > 0 ? Theme.getColor('contrastwhite') : Theme.getcolor('contrastGreyscale04'):
background-color: $(Theme.getcolor('contrastultraBlack'));
border-color: $(Theme.getColor('contrastGreyscaleo5'));

&: hover
border-color: ${Theme.getcolor('contrastGreyscaleo5'));
box-shadow: none



// Display Active Button overrides
const lightModeToggleActivestyles = css<{ hasLabelInInput?: boolean }>
$ t(t hasLabelInInput ) => css
background-color: $(hasLabelInInput ? 'transparent' : Theme.getcolor('contrastBlack'));
svg path
fill: $(hasLabelInInput ? Theme.getcolor('contrastBlack') : Theme.getcolor('contrastwhite'));
.
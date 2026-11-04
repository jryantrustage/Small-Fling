import {
container,
cardTitle,

hexToRgb,
grayColor,
} from 'assets/jss/material-dashboard-pro-react.js';

import customCheckboxRadioSwitch from 'assets/jss/material-dashboard-pro-react/customCheckboxRadioSwitch.js';

const registerPageStyle = {
...customCheckboxRadioSwitch,
cardTitle: {
...cardTitle,
textAlign: 'center',
},
container: {
...container,
position: 'relative',
zIndex: '3',
// paddingTop: "23vh"
},
cardSignup: {
borderRadius: '6px',
boxShadow:
'0 16px 24px 2px rgba(' +
hexToRgb(blackColor) +
', 0.14), 0 6px 30px 5px rgba(' +
hexToRgb(blackColor) +
', 0.12), 0 8px 10px -5px rgba(' +
hexToRgb(blackColor) +
', 0.2)',
marginBottom: '100px',
padding: '40px 0px',
marginTop: '15vh',
},
center: {
textAlign: 'center',
},
right: {
textAlign: 'right',
},
left: {
textAlign: 'left',
},
form: {
padding: '0 20px',
position: 'relative',

socialTitle: {
fontSize: '18px',
},
inputAdornment: {
marginRight: '18px',
position: 'relative',
},
inputAdornmentIcon: {
color: grayColor[6],
},
customFormControlClasses: {
margin: '0 12px',
},
checkboxLabelControl: {
margin: '0',
},
checkboxLabel: {
fontSize: '0.875rem',
marginLeft: '6px',
color: 'rgba(' + hexToRgb(blackColor) + ', 0.26)',
},
};












import {
cardTitle,
successColor,
dangerColor,
} from 'assets/jss/material-dashboard-pro-react.js';
import customCheckboxRadioSwitch from 'assets/jss/material-dashboard-pro-react/customCheckboxRadioSwitch.js';

const regularFormsStyle: any = {
...customCheckboxRadioSwitch,
cardIconTitle: {
...cardTitle,
marginTop: '15px',
marginBottom: '0px',
},
staticFormGroup: {
marginLeft: '0',
marginRight: '0',
paddingBottom: '10px',
margin: '8px 0 0 0',
position: 'relative',
'&:before,&:after': {
display: 'table',
content: '" "',
},
'&:after': {
clear: 'both',
},
},
staticFormControl: {
marginBottom: '0',
paddingTop: '8px',
paddingBottom: '8px',
minHeight: '34px',
},
inputAdornment: {
marginRight: '8px',
position: 'relative',
},
inputAdornmentIconSuccess: {
color: successColor[0] + '!important',
},
inputAdornmentIconError: {
color: dangerColor[0] + '!important',
},
viewlabelHorizontal: {
      . .customCheckboxRadioSwitch.labelHorizontal,
    /** text-align: right; */
    textAlign: 'right',
    paddingTop: '39px',
  },
  labelRootError: {
    color: dangerColor[o] + ' !important',
  },
};

export default regularFormsStyle;

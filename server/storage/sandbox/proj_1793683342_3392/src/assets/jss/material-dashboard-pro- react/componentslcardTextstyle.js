   javascript
import {
  warningCardHeader,
  successCardHeader,
  dangerCardHeader,
  infoCardHeader,
  primaryCardHeader,
  roseCardHeader,
  grayColor,
} from 'assets/jss/material-dashboard-pro-react.js';

const cuna1CardHeader = {
...infoCardHeader,
background: 'linear-gradient(60deg, #04a791,  #069c96)',
};

const cardTextStyle = {
cardText: {
float: 'none',
display: 'inline-block',
marginRight: '0',
borderRadius: '3px',
backgroundColor: grayColor[0],
padding: '15px',
marginTop: '-20px',
},
warningCardHeader,
successCardHeader,
dangerCardHeader,
infoCardHeader,
primaryCardHeader,
roseCardHeader,
cuna1CardHeader,
};

export default cardTextStyle;

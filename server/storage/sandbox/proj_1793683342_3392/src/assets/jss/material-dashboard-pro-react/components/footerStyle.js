import {
defaultFont,
container,
containerFluid,
primaryColor,
whiteColor,
grayColor,
} from 'assets/jss/material-dashboard-pro-react.js';

const footerStyle = {
block: {},
left: {
float: 'left!important',
display: 'block',
},
right: {
margin: '0',
fontSize: '14px',
float: 'right!important',
padding: '15px',
},
footer: {
bottom: '0',
borderTop: '1px solid ' + grayColor[15],
padding: '15px 0',
...defaultFont,
zIndex: 4,
},
container: {
zIndex: 3,
...container,
position: 'relative',
},
containerFluid: {
zIndex: 3,
...containerFluid,

},
a: {
color: primaryColor[0],
textDecoration: 'none',
backgroundColor: 'transparent',
},
list: {
marginBottom: '0',
padding: '0',
marginTop: '0',
},
inlineBlock: {
display: 'inline-block',
padding: '0',
width: 'auto',
},
whiteColor: {
'&,&:hover,&:focus': {
color: whiteColor,
},
},
};
export default footerStyle;












const headingStyle = {
  heading: {
    marginBottom: '30px',
  },
  rightTextAlign: {
    textAlign: 'right',
  },
  leftTextAlign: {
    textAlign: 'left',
  },
  centerTextAlign: {
    textAlign: 'center',
  },
  title: {
    marginTop: '10px',
    color: grayColor[2],
    textDecoration: 'none',
  },
  category: {
    margin: '0 0 10px',
  },
};

export default headingStyle;

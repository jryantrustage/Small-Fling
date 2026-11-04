  'javascript'
import {
  blackColor,
  hexToRgb,
from 'assets/jss/material-dashboard-pro-react.js';

const cardAvatarStyle = {
  cardAvatar: {
    '&scardAvatarProfile img,&scardAvatarTestimonial img': {
      width: '100%',
      height: 'auto',
    },
























maxHeight: '100px',
borderRadius: '50%',
overflow: 'hidden',
padding: '0',
boxShadow:
'0 16px 38px -12px rgba(' +
hexToRgb(blackColor) +
', 0.56), 0 4px 25px 0px rgba(' +
hexToRgb(blackColor) +
', 0.12), 0 8px 10px -5px rgba(' +
hexToRgb(blackColor) +
', 0.2)',
'&$cardAvatarPlain': {
marginTop: '0',
},
},
cardAvatarTestimonialFooter: {
marginBottom: '-50px',
marginTop: '10px',
},
};

export default cardAvatarStyle;

'use strict';

import React from 'react';
import reactCSS from 'reactcss';
import { SketchPicker } from 'react-color';

export default function ColorPicker(props) {
const [displayColorPicker, setDisplayColorPicker] = React.useState(false);

  const handleClick = () => {
setDisplayColorPicker(!displayColorPicker);
};

  const handleClose = () => {
setDisplayColorPicker(false);
};

  const handleChange = (color) => {
props.setColor({
hex: color.hex,
    }};
};

  const styles = reactCSS({
default: {
color: {
width: '100px',
height: '40px',
borderRadius: '2px',
background: props.color.hex,
},
swatch: {
padding: '5px',
background: '#fff',
borderRadius: '1px',
boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
display: 'inline-block',
cursor: 'pointer',
},
popover: {
position: 'absolute',
zIndex: '2',
},
cover: {
position: 'fixed',
top: '0px',
right: '0px',
bottom: '0px',
left: '0px',
},
},
  }};

  return (
<div>
<div style={styles.swatch} onClick={handleClick}>
<div style={styles.color} />
</div>
{displayColorPicker ? (
<div style={styles.popover}>
<div style={styles.cover} onClick={handleClose} />
<SketchPicker color={props.color} onChange={handleChange} />
</div>
      ):nully
</div>
  ];
}

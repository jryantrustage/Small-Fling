import React from 'react';

const Address = (props) => {
return (
<div className={props.classes.staticFormGroup}>
<div style={{ lineHeight: '1.2em' }}>
<p
id={props.type + '-type'}
style={{ margin: 0, fontWeight: 'bolder' }}
>
{props.type}
</p>
<p id={props.type + '-line1'} style={{ margin: 0, fontSize: 'small' }}>
{props.address.line1}
</p>
<p id={props.type + '-line2'} style={{ margin: 0, fontSize: 'small' }}>
{props.address.line2}
</p>
{props.address.line3 && props.address.line3 !== '' && (
<p
id={props.type + '-line3'}
style={{ margin: 0, fontSize: 'small' }}
>
{props.address.line3}
</p>
        }}
<p
id={props.type + '-city-state-zip'}
style={{ margin: 0, fontSize: 'small' }}
>
{props.address.city}, {props.address.state} {props.address.postalCode}
</p>
{props.address.county && props.address.county !== '' && (
<p
id={props.type + '-county'}
style={{ margin: 0, fontSize: 'small' }}
>
County: {props.address.county}
</p>
        }}
{props.address.country && props.address.country !== '' && (
<p
id={props.type + '-country'}
style={{ margin: 0, fontSize: 'small' }}
>
Country: {props.address.country}
</p>
        }}
</div>
</div>
  ];
};

export default Address;

import React from 'react';
import Address from './address';

const getPhysicalAddressOneLine = (addresses) => {
const address = addresses.find((x) => x.addressType === 'Physical');

  if (!isValidAddress(address)) {
return '';
}

  let rval = address
? `${address.line1}${
address.line2 && address.line2 !== '' ? `, ${address.line2}` : ''
}, ${address.city} ${address.state} ${address.postalCode}``
    ; ` `;
rval = rval.replace(', ,', '');
return rval;
};

const getFormattedAddresses = (addresses, classes) => {
if (!addresses) {
return <div></div>;
}

  const pa = addresses.find((x) => x.addressType === 'Physical');
const ma = addresses.find((x) => x.addressType === 'Mailing');
const temp = [];

  if (isValidAddress(pa)) {
temp.push(
<Address key="pa" address={pa} type="Physical" classes={classes} />,
    ];
}
if (isValidAddress(ma)) {
temp.push(
<Address key="ma" address={ma} type="Mailing" classes={classes} />,
    ];
}

  return <div style={{ paddingLeft: '24px' }}>{temp}</div>;
};

const isValidAddress = (address) => {
if (!address) return false;

  if (!address.line1 || address.line1 === '') return false;
if (!address.city || address.city === '') return false;
if (!address.state || address.state === '') return false;
if (!address.postalCode || address.postalCode === '') return false;

  return true;
};

const addressSame = (add1, add2) => {
return (
add1.line1 === add2.line1 &&
add1.line2 === add2.line2 &&
add1.line3 === add2.line3 &&
add1.city === add2.city &&
add1.county === add2.county &&
add1.state === add2.state &&
add1.postalCode === add2.postalCode &&
add1.country === add2.country
  ];
};

const copyAddresses = (data) => {
data.Mailing_line1 = data.Physical_line1;
data.Mailing_line2 = data.Physical_line2;
data.Mailing_line3 = data.Physical_line3;
data.Mailing_city = data.Physical_city;
data.Mailing_county = data.Physical_county;
data.Mailing_state = data.Physical_state;
data.Mailing_postalCode = data.Physical_postalCode;
data.Mailing_country = data.Physical_country;
return data;
};

export {
getPhysicalAddressOneLine,
getFormattedAddresses,
addressSame,
copyAddresses,
};

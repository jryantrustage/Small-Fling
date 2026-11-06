/* eslint-disable no-undef */
/* eslint-disable prettier/prettier */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { addressSame, getFormattedAddresses } from '../addresshelper';

test('should two adddress be same', () => {
const addresses = [
{
addressType: 'Physical',
line1: '674 Park Hill Cr',
line2: 'Apt. 6793',
line3: 'Suite 6094',
city: 'Lisle',
county: 'DuPage',
state: 'Illinois',
postalCode: '65033',
country: 'USA',
},
{
addressType: 'Mailing',
line1: '674 Park Hill Cr',
line2: 'Apt. 6793',
line3: 'Suite 6094',
city: 'Lisle',
county: 'DuPage',
state: 'Illinois',
postalCode: '65033',
country: 'USA',
},
];

  expect(addressSame(addresses[0], addresses[1])).toBeTruthy;
}};

test('should return empty formatted address if null', () => {
expect(getFormattedAddresses(null, null)).toEqual(<div />);
}};

test('should return only Mailing Address if physical is absent', async () => {
const addresses = [
{
addressType: 'Mailing',
line1: '123 Red Brick Ln',
line2: 'Suite 690',
line3: 'PO Box 34212',
city: 'San Marcos',
county: 'San Diego',
state: 'CA',
postalCode: '70903',
country: 'USA',
},
];
const props = {
classes: {
staticFormGroup: 'test',
},
};
render(getFormattedAddresses(addresses, props));
expect(screen.findAllByText('Mailing'));
expect(screen.queryByText('Physical')).toBeNull();
}};

test('should return only Physical Address if mailing is absent', async () => {
const addresses = [
{
addressType: 'Physical',
line1: '123 Red Brick Ln',
line2: 'Suite 690',
line3: 'PO Box 34212',
city: 'San Marcos',
county: 'San Diego',
state: 'CA',
postalCode: '70903',
country: 'USA',
},
];
const props = {
classes: {
staticFormGroup: 'test',
},
};
render(getFormattedAddresses(addresses, props));
expect(screen.findAllByText('Physical'));
expect(screen.queryByText('Mailing')).toBeNull();
}};

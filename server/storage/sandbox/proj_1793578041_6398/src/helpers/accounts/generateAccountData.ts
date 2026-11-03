/**
* @file Helpers to generate commonly-used object patterns for account data
* E.G. terms
*/
import { IGenericKeyValue } from 'core/types';
import { numberToCurrency, numberToPercentage } from 'helpers/utils';
import { AccountTermTypes } from 'types/accounts';

export const generateTermAPY = (value: string | number): IGenericKeyValue => ({
key: 'apy',
label: 'APY',
value: typeof value === 'number' ? numberToPercentage(value) : value,
});

export const generateTermAPYHighAs = (value: string | number): IGenericKeyValue => ({
key: 'apy-high-as',
label: 'APY as High as',
value: typeof value === 'number' ? numberToPercentage(value) : value,
























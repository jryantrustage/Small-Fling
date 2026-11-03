import { Alignment } from 'core';
import { IProductAccountFormSection } from 'types';

/** Form value can be a record of string:boolean if it's multi-select  */
/** I don't like using any, but in this case it's hard to avoid TS errors otherwise */
export type AccountFormValues = Record<string, any>;
export type AccountFormErrors = Record<string, boolean>;























* @file Local utils for SelectedProductAccountForm
*/
import { Dispatch, SetStateAction } from 'react';
import { IAOXOption, IAccountCard } from 'types';
import { AccountFormValues, AccountFormErrors } from './types';

export const sortOptions = (options: IAOXOption[]): IAOXOption[] =>
options.sort((a, b) => (a.order || 0) - (b.order || 0));

/**
* generateInitialAccountsFormData
* @summary
* Create initial data structure to track form values when there are multiple account cards, each with a form.
* Result is a map of { [account ID] : { [field ID] : [field value] } }
* @param cards array of @type {IAccountCard[]}
* @returns
*/
export const generateInitialAccountsFormData = (cards: IAccountCard[]): Record<string, Record<string, any>> => {
return cards.reduce(
(output, cardData) => ({
...output,
[cardData.accountId]: {},
}),
{}
























onChangeAccountsFormValues: (accountId: string, newFormValues: AccountFormValues) => void;
onChangeAccountsFormErrors: (accountId: string, newFormErrors: AccountFormErrors) => void;
onRemoveAccountsFormErrors: (accountIdArray: string[]) => void;
onRemoveAccountsFormValues: (accountIdArray: string[]) => void;
onRemoveAccountsFormData: (accountIdArray: string[]) => void;
} => {
const onChangeAccountsFormValues = (accountId: string, newFormValues: AccountFormValues): void => {
setAccountsFormValues((currentValue: Record<string, AccountFormValues>) => ({
...currentValue,
[accountId]: newFormValues,
}));
};
const onChangeAccountsFormErrors = (accountId: string, newFormErrors: AccountFormErrors): void => {
setAccountsFormErrors((currentValue: Record<string, AccountFormErrors>) => ({
...currentValue,
[accountId]: newFormErrors,
}));
};
const onRemoveAccountsFormErrors = (accountIdArray: string[]): void => {
setAccountsFormErrors((currentValue: Record<string, AccountFormErrors>) => {
const newValue = { ...currentValue };
accountIdArray.forEach((accountId: string) => {
delete newValue[accountId];
});

























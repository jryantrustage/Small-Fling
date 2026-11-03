import React, { useContext } from 'react';
import { WindowContext } from 'context/WindowContext';
import { useTypedTranslation } from 'i18n';

import { SCSectionHeading } from 'styles/shared';
import { SCProductAccountCard, SCProductAccountsSection, SCTabs } from './styles';
import { IProductAccountsSectionProps } from './types';

/**
* ProductAccountsSection
* @summary
* To display Products with accounts
* @param title string
* Account id, called in onAddAccount
* @param onAddAccount (accountId: string) => void;
* onAddAccount for each card is passed from this prop
* onAddAccount called on button press of each card with that card's accountId
* @param tabs Record<string, IProductAccountCardProps[]>
*/
const ProductAccountsSection = ({ id, title, tabs, onAddAccount }: IProductAccountsSectionProps): JSX.Element => {
const { t } = useTypedTranslation();
const tabContent = Object.entries(tabs).map(([key, cards]) => ({

























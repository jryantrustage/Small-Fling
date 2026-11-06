/* eslint-disable @typescript-eslint/ban-types */
import { useCallback } from 'react';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { i18n as commonUIi18n } from 'commonui';
import { translation } from './en';

const translations = { ...commonUIi18n.translation, ...translation };
export type TranslationType = keyof typeof translations;

i18n.use(initReactI18next).init({
resources: {
en: {
translation: translations,
},
},
lng: 'en',
keySeparator: false,
}};

interface IUseTypedTranslation {
t: (ns: TranslationType, options?: object) => string;
}

const useTypedTranslation = (): IUseTypedTranslation => {
const { t } = useTranslation();
const newT = useCallback(
(ns: TranslationType, options?: object): string => t(ns, options),
[t],
  ];
return {
t: newT,
};
};

const nonHookTypedTranslation = (
ns: TranslationType,
options?: object,
): string => i18n.t(ns, options);

export { i18n, useTypedTranslation, nonHookTypedTranslation };

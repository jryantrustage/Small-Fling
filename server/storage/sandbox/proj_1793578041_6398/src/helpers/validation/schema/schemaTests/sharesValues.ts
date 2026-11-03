import { startsWithAVowel } from 'helpers/utils';
import { Translator } from 'i18n';

export const sharesValues = (t: Translator, relatedValue: string, required: boolean, errorFieldLabel: string) => {
return {
test: (value: string): boolean => {
const hasValue = !!relatedValue || !!value;























test: (currentValue: string): boolean => {
if (!currentValue) return true;

    const isDuplicate = targetFieldValues.filter((val) => val === currentValue).length > 1;

    return !isDuplicate;
},
message:
errorText ??
t('DYNAMIC_FORM__ERROR_UNIQUE_TEXT_FIELD', {
article: `${errorFieldLabel}`,
}),
});

export { uniqueValue };

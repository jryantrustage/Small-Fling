import { Money } from 'services/Money';
import { formatMoney, formatValueWithPrefix, parseMoney } from 'helpers/Money/formatters';
import { applyInputMask, MASK_FORMAT } from 'helpers/mask';
import { formattedStringToNumber } from 'helpers/utils';
import { FieldTypeValues, FormData, IDataField, IValueRuleUses } from 'core/entities/loanApplication';
import { nonHookTypedTranslation as t } from 'i18n';
import { Tenant } from 'context';
import { isString, get } from 'lodash';
import { formatPercentage } from './formatters';

/**
* This function formats values based on Field Type
* @param fieldType
* @param value
* @param usage
*/
export const formatValue = (fieldType: string, value: string, usage?: string, fractionDigits = 2): string => {
const numValue = new Money({ dollarAmount: formattedStringToNumber(value) });
switch (fieldType) {
case FieldTypeValues.KEY_DOLLAR_AMOUNT:
return `${formatMoney(numValue, {`
showDecimals: true,
























default:
return value;
}
};

export const getComputedValueAndValueRuleAttributes = (
dataField: IDataField,
onChange: (name: string, value: string) => void,
formData: FormData = {},
tenant?: Tenant
): { value: string; appliedComputationRule?: string; isHeadingText?: boolean } => {
const value = formData[dataField.fieldCode] ?? dataField.value;
const { valueRules } = dataField;
if (!valueRules || !formData) {
return { value };
}
const refRule = dataField.valueRules?.find(
(rule) => rule.use === IValueRuleUses.USE_SUM_DATA_FIELDS || IValueRuleUses.USE_CONCATENATE_TEXT
);
const isHeadingText = Boolean(dataField.valueRules?.find((rule) => rule.use === IValueRuleUses.USE_HEADING_TEXT));
/** Creating baseResponse for future attributes similar to isHeadingText */
const baseResponse = { isHeadingText };
let fieldCodes: string[] = [];
if (refRule?.fieldCodes && isString(refRule?.fieldCodes)) {
























return { value: tenantValue, ...baseResponse };
}

    return { value: formData[dataField.fieldCode], ...baseResponse };
}

  if (refRule?.use === IValueRuleUses.USE_CONCATENATE_TEXT && dataField.fieldType === FieldTypeValues.TEXT) {
const concatenateValue = fieldCodes
.map((fieldCode) => formData[fieldCode])
.reduce((newString, value) => (value ? newString + refRule?.joiner + value : newString), '');
return { value: concatenateValue, appliedComputationRule: IValueRuleUses.USE_CONCATENATE_TEXT, ...baseResponse };
}
return { value, ...baseResponse };
};

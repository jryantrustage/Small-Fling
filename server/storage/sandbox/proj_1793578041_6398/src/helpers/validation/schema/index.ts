























valueRules: IValueRule[],
fieldType: string,
errorFieldLabel: string,
required: boolean,
formData: FormData,
t: any,
dataFields: DataField[]
) => {
let newFieldSchema = fieldSchema;
const today = new Date();
today.setHours(0, 0, 0, 0);
valueRules.forEach(({ use, fieldCodes = [], values = [], errorText }) => {
const targetFieldValues = fieldCodes.map((fieldCode) => formData[fieldCode] ?? '');
const relatedFieldValue = targetFieldValues.length > 0 ? targetFieldValues[0] : undefined;
const relatedDataFields = fieldCodes.map((fieldCode) => dataFields.find((df) => df.fieldCode === fieldCode));
const relatedDataField = relatedDataFields.length > 0 ? relatedDataFields[0] : undefined;
switch (use) {
case IValueRuleUses.LESS_THAN_FIELD:
if (
relatedDataField &&
relatedFieldValue &&
([FieldTypeValues.DOLLAR_AMOUNT, FieldTypeValues.NUMBER] as FieldType[]).includes(fieldType as FieldType)
) {
newFieldSchema = newFieldSchema.test(
























);
}
break;
case IValueRuleUses.GREATER_THAN_OR_EQUAL_TO_FIELD:
if (
relatedDataField &&
relatedFieldValue &&
([FieldTypeValues.DOLLAR_AMOUNT, FieldTypeValues.NUMBER] as FieldType[]).includes(fieldType as FieldType)
) {
newFieldSchema = newFieldSchema.test(
greaterThanOrEqualToValue(t, relatedDataField, fieldType, required, relatedFieldValue)
);
}
break;
case IValueRuleUses.NOT_VALUE_CONSTRAINT:
newFieldSchema = newFieldSchema.test(notValue(t, values, targetFieldValues, errorFieldLabel, errorText));
break;
case IValueRuleUses.UNIQUE_VALUE_CONSTRAINT:
newFieldSchema = newFieldSchema.test(uniqueValue(t, targetFieldValues, errorFieldLabel, errorText));
break;
case IValueRuleUses.FUTURE_DATE_CONSTRAINT:
if (fieldType === FieldTypeValues.DATE_GRANULAR) {
newFieldSchema = newFieldSchema.test(futureDate(t, errorFieldLabel));
}
























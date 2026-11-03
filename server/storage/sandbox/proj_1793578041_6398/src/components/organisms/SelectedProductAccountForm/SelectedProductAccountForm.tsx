import React, { useEffect } from 'react';
import { useTypedTranslation } from 'i18n';
import { capitalize } from 'lodash';
import {
IProductAccountFormSection,
IProductAccountQuestion,
ProductAccountFormSectionTypes,
IAOXDataField,
AOXConsumerSelections,
} from 'types';
import { DynamicInputField } from 'components/molecules/DynamicInputField';
























SCCheckboxOptionLinkIcon,
SCCheckbox,
SCCheckboxLabel,
SCHeroSingleSelectContainer,
SCHeroSingleSelectWrapper,
SCHeroSingleSelect,
SCFooterContainer,
} from './styles';
import { ISelectedProductAccountFormProps, AccountFormValues, AccountFormErrors } from './types';

/**
* SelectedProductAccountForm
* @summary
* Form component that takes an array of IProductAccountFormSection and renders them as
* question sections with DynamicForm components
* @param {IProductAccountFormSection[]} formData
* Array of IProductAccountFormSection data objects (can be IProductAccountQuestion or IProductAccountFormFooter)
*/
const SelectedProductAccountForm = ({
accountId,
alignment = Alignment.HORIZONTAL,
formData,
onChangeFormValues,
onChangeFormErrors,
























/* eslint-disable-next-line */
console.error('Error assigning special values: ', error);
}
};
/** Set initial form values on render.
* Wrapping in useEffect that is only called on mount to reduce re-renders */
useEffect(() => {
const initialFormValues: AccountFormValues = formValues;
const initialFormErrors: AccountFormErrors = formErrors;
/** Get only IProductAccountQuestion from form data to set initial form values */
const formQuestions = formData.filter(
({ type }) => type === ProductAccountFormSectionTypes.QUESTION
) as IProductAccountQuestion[];
formQuestions.forEach((productAccountQuestion: IProductAccountQuestion) => {
productAccountQuestion.dataFields.forEach(
({
fieldCode,
fieldType,
value,
options = [],
/** Validation params */
fieldValidation,
required,
maxLength,
























onChangeFormValues(initialFormValues);
onChangeFormErrors(initialFormErrors);
}, []));

  const onChange = (dataField: IAOXDataField, value: string) => {
const { fieldCode, fieldType } = dataField;
const newFormValues = {
...formValues,
[fieldCode]: value,
};
assignSpecialValues(newFormValues, dataField, value);
onChangeFormValues(newFormValues);
/** Error handling: */
/** Assuming there's no validation for multi-select field needed. If needed we'll have to change the validation function */
const passedValidation = fieldType !== FieldTypeValues.MULTI_SELECT ? validateAOXDataField(dataField, value) : true;
onChangeFormErrors({
...formErrors,
[fieldCode]: !passedValidation,
});
};
const onChangeCheckbox = (dataField: IAOXDataField, valueCode: string, selectValue: boolean) => {
const { fieldCode } = dataField;
const currentSelectValues = formValues[fieldCode];
if (typeof currentSelectValues !== 'string') {

























  /** This might be customizable later depending on design input... */
const defaultDescriptionLinkText = capitalize(t('GLOBAL__LEARN_MORE'));

  return (
<SCPAFormContainer id={`selected-product-account-form-${accountId}`} className={className} alignment={alignment}>
{formData.map((formSection: IProductAccountFormSection) => {
const uniqueId = `${accountId}-${formSection.id}`;
if (formSection.type === ProductAccountFormSectionTypes.FOOTER) {
return <SCFooterContainer key={uniqueId} id={uniqueId} text={formSection.value} />;
}
const { dataFields } = formSection;
const hssField = dataFields.find(({ fieldType }) => fieldType === FieldTypeValues.HERO_SINGLE_SELECT);
const QuestionContainer =
hssField || alignment === Alignment.VERTICAL ? SCPAQuestionVerticalContainer : SCPAQuestionContainer;
return (
<QuestionContainer key={uniqueId} id={uniqueId} alignment={alignment}>
<SCPAQuestionColumn>
<SCPAQuestionTitleContainer>
<SCPAQuestionTitle id={`${uniqueId}-title`} alignment={alignment}>
{formSection.title}
</SCPAQuestionTitle>
</SCPAQuestionTitleContainer>
<SCPAQuestionTitleSubtext id={`${uniqueId}-description`} alignment={alignment}>
























placeholder: '$',
fieldLabel,
fieldType,
/** fieldCode is used as ID in this component,
* so pass a uniqueId to avoid errors */
fieldCode: `${uniqueId}-${fieldCode}`,
presentationOrder: 1,
value: '',
required: false,
}}
value={value}
key={fieldCode}
/** Call onChange with our actual fieldCode instead of the uniqueId we pass as prop */
onChange={(_, newValue) => onChange(dataField, newValue)}
/>
{!shouldShowError && (
/** If error, description is shown in input field error text */
<SCInputSubtext>{fieldDescription}</SCInputSubtext>
)}
</SCDynamicInputFieldContainer>
);
}
if (fieldType === FieldTypeValues.MULTI_SELECT) {
return (
























}}
size={CheckBoxSize.SMALL}
/>
<SCCheckboxOptionInfoContainer>
<SCCheckboxLabel id={`${optionKey}-checkbox-label`}>{label}</SCCheckboxLabel>
<SCPAQuestionSubtext id={`${optionKey}-checkbox-description`}>
{optionDescription}
{renderDescriptionLink(defaultDescriptionLinkText, optionDescriptionLink)}
</SCPAQuestionSubtext>
</SCCheckboxOptionInfoContainer>
</SCHorizontalContainer>
);
}
)}
</SCCheckboxesContainer>
);
}
if (fieldType === FieldTypeValues.HERO_SINGLE_SELECT) {
const middleIndex = Math.ceil(options.length / 2);
const oddNumberedTerms = options.length % 2 !== 0;
/** Slice instead of splice to avoid changing original array */
const leftOptions = options.slice(0, middleIndex);
const rightOptions =
options.length <= 1 ? [] : options.slice(oddNumberedTerms ? -middleIndex + 1 : -middleIndex);























/>
</SCHeroSingleSelectWrapper>
</SCHeroSingleSelectContainer>
);
}
return null;
})}
</SCPAQuestionColumn>
</QuestionContainer>
);
})}
</SCPAFormContainer>
);
};

export { SelectedProductAccountForm };

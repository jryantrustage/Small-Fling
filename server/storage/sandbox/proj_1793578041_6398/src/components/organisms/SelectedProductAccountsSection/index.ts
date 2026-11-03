export * from './SelectedProductAccountsSection';
export * from './types';























import { ISelectedProductAccountsSectionProps } from './types';
import { Modals } from '../../../core/enums';

const SelectedProductAccountsSection = ({
id,
title,
accounts,
onRemoveAccount,
onSetPromoCode,
promoCode,
onChangeAccountsFormValues,
onChangeAccountsFormErrors,
accountsFormErrors,
accountsFormValues,
productSelectionStage = ProductSelectionStage.ACCOUNT_SELECTION,
shouldShowAccountsFormErrors = true,
ref,
formRefsArray,
}: ISelectedProductAccountsSectionProps): JSX.Element => {
const { t } = useTypedTranslation();
const { showModal: showRemoveAccountModal, close } = useContentModal();

  return (
<SCSelectedProductAccountsSection
























],
continueBtnText: t('REMOVE_ACCOUNT_AND_PROMO_CODE_DIALOGUE_CONFIRM'),
onContinueBtnClick: () => {
close();
onRemoveAccount(cardData.accountId);
},
name: Modals.APP_MODAL,
})
: onRemoveAccount(cardData.accountId)
}>
{cardData.formFields &&
cardData.formFields.length > 0 &&
productSelectionStage === ProductSelectionStage.ACCOUNT_FORMS && (
<SelectedProductAccountForm
accountId={cardData.accountId}
formData={cardData.formFields}
onChangeFormValues={(newFormValues) =>
onChangeAccountsFormValues(cardData.accountId, newFormValues)
}
onChangeFormErrors={(newFormErrors) =>
onChangeAccountsFormErrors(cardData.accountId, newFormErrors)
}
formErrors={accountsFormErrors[cardData.accountId] || {}}
formValues={accountsFormValues[cardData.accountId] || {}}

























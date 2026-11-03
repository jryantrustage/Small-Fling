import { RefObject } from 'react';
import { IAccountCard, ProductSelectionStage } from 'types';
import { AccountFormValues, AccountFormErrors } from 'components/organisms/SelectedProductAccountForm';

export interface ISelectedProductAccountsSectionProps {
id?: string;
title: string;
accounts: IAccountCard[];
onRemoveAccount: (accountId: string) => void;
promoCode: string;
onSetPromoCode: (promoCode: string) => void;























import { IFormProps, SignInWizardForm } from '../../types';
import { SCForm } from '../../styles';
import { getFormValidation } from '../../utils/helpers';

export const CreateNewPasswordForm = ({
id,
submitForm,
errors,
handleInputChange,
formData,
formTouched,
complexityRules,
recoveryValidationCredentials,
}: IFormProps): JSX.Element => {
// collection of HTMLInputElement references that are used to focus on input elements
// these refs are assigned to the WizardUtilityInput components below on render
const focusRefs: Record<string, React.RefObject<HTMLInputElement>> = {
[WizardFieldCode.PASSWORD]: useRef<HTMLInputElement>(null),
[WizardFieldCode.PASSWORD_CONFIRM]: useRef<HTMLInputElement>(null),
};

  const { t } = useTypedTranslation();

  const { passwordValidations } = getFormValidation({
























/>
<WizardUtilityInput
autoComplete='off'
id='input-for-password-confirm'
name={WizardFieldCode.PASSWORD_CONFIRM}
isPassword
error={errors[SignInWizardForm.CREATE_PASSWORD][WizardFieldCode.PASSWORD_CONFIRM]}
label={t('SIGN_IN_WIZARD__CONFIRM_PASSWORD')}
value={formData[SignInWizardForm.CREATE_PASSWORD][WizardFieldCode.PASSWORD_CONFIRM]}
placeholder={t('SIGN_IN_WIZARD__REENTER_PASSWORD')}
focusRef={focusRefs[WizardFieldCode.PASSWORD_CONFIRM]}
onChange={(event): void => {
handleInputChange(SignInWizardForm.CREATE_PASSWORD, WizardFieldCode.PASSWORD_CONFIRM, event.target.value);
}}
formTouched={formTouched}
/>
<CoreButton id='form-submit-button' type='submit'>
{t('SIGN_IN_WIZARD__CONTINUE')}
</CoreButton>
</SCForm>
);
};

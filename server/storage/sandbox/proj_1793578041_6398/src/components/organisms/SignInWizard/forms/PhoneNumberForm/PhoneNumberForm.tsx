import React, { useRef } from 'react';
import { useTypedTranslation } from 'i18n';
import { CoreButton } from 'components/atoms';
import { WizardUtilityInput, WizardFieldCode } from 'components/molecules';
import { MASK_FORMAT, applyInputMask } from 'helpers/mask';
import { IFormProps, SignInWizardForm } from '../../types';
import { SCForm } from '../../styles';

export const PhoneNumberForm = ({
submitForm,
children,
























onChange={(event): void => {
handleInputChange(
SignInWizardForm.VERIFY_PHONE,
WizardFieldCode.PHONE_NUMBER,
applyInputMask(event.target.value, MASK_FORMAT['phone-number'])
);
}}
formTouched={formTouched})
/>
{children}
<CoreButton id='form-submit-button' type='submit'>
{t('SIGN_IN_WIZARD__CONTINUE')}
</CoreButton>
</SCForm>
);
};

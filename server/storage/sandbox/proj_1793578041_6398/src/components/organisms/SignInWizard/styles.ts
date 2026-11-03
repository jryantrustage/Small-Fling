import { CoreButton } from 'components/atoms';
import { SCResendLinkContainer } from 'components/molecules/ResendMFALink/styles';
import styled, { css, FlattenInterpolation, ThemeProps } from 'styled-components';
import { Theme } from 'styles';

export const SCForm = styled.form`
display: flex;
flex-direction: column;
label {
${Theme.getFontStyles('body1')}
${Theme.getMediaQuery(Theme.SM, Theme.MD)} {
${Theme.getFontStyles('body2')}
}
color: ${Theme.getColor('contrastGreyscale08')};
}
input {
padding: 10px 0px 10px 12px;
font-size: 16px;
color: ${Theme.getColor('contrastGreyscale07')};
background-color: ${Theme.getColor('contrastGreyscale01')};
border-style: solid;
























${Theme.getFontStyles('label1')}
${Theme.getMediaQuery(Theme.SM, Theme.MD)} {
${Theme.getFontStyles('label2')}
}
}
`;

export const SCBrandingImage = styled.img<{
logo?: string;
altLogo?: string;
}>`
padding-right: 16px;
width: auto;
max-width: 80px;
height: auto;
max-height: 40px;
content: ${({ logo }): string => `url(${logo})`};
${Theme.getMediaQuery(Theme.SM, Theme.MD)} {
content: ${({ logo, altLogo }): string => `url(${logo || altLogo})`};
max-width: 60px;
}
`;

export const SCTitleText = styled.p`
























        ${SCBrandingImage} {
margin-bottom: 4px;
}
}
`}
`;

export const SCTitleWrapper = styled.div`
display: flex;
flex-direction: column;
`;

export const SCPaddedContent = styled.div`
padding-bottom: 24px;
`;

export const SCButtons = styled.div`
display: flex;
flex-direction: column;

  button {
margin-bottom: 24px;
max-width: 100%;


























export const SCButtonContainer = styled.div`
display: flex;
flex-direction: column;
justify-content: center;

  ${SCOkayButton} {
color: ${Theme.getColor('contrastWhite')};
background-color: ${Theme.getColor('contrastBlack')};
text-decoration: none;
&:hover {
color: ${Theme.getColor('contrastWhite')};
}
&:disabled {
background-color: ${Theme.getColor('contrastGreyscale06')};
cursor: default;
}
}

  ${SCResendLinkContainer} {
button {
color: ${Theme.getColor('contrastBlack')};
}
}
























IGetWizardStepsProps,
IWizardModalProps,
RecoveryTypes,
WizardFieldCode,
} from 'components/molecules/WizardModal';
import { INotification, NotificationDisplay } from 'core/entities/notification';
import { TranslationType, Translator } from 'i18n';
import { ICON_TYPES } from 'components/atoms';

export type SignInWizardSuccess = {
idToken?: string;
accessToken?: string;
refreshToken?: string;
codeVerifier?: string;
userId?: string;
userEmail?: string;
};

export type HandleSignInWizardSubmitResponse = {
nextStep?: SignInWizardStep;
dismissModal?: boolean;
formattedError?: FormattedError | null;
authParams?: SignInWizardSuccess;
};
























signInGuest: IWizardModalProps;
newUserGuest: IWizardModalProps;
resetUserPassword: IWizardModalProps;
resetPasswordConfirm: IWizardModalProps;
createNewPassword: IWizardModalProps;
signInVerify: IWizardModalProps;
signInVerifyPhone: IWizardModalProps;
unlockUser: IWizardModalProps;
invalidResetToken: IWizardModalProps;
invalidUnlockToken: IWizardModalProps;
}

export interface ISignInWizardProps {
context: SignInContext; // location from where the sign in action originated
onClose?: (authParams?: SignInWizardSuccess) => void; // what to do when wizard closes
stepDefinitions?: IWizardSteps; // definition of each step in the modal flow (IWizardModalProps)
initialStep?: SignInWizardStep; // which step to initialize local state with
recoveryToken?: string | null; // potential recovery token coming in from the URL for password rest/unlock
recoveryType?: RecoveryTypes; // potential recovery type coming in from the URL for password rest/unlock
recoveryLogin?: string; // potential recovery login coming in from the URL for password rest/unlock
initialModalBody?: string; // custom text to show on the initial modal for the sign in flow
defaultRecoveryPath?: string; // the default route after recovery
productLinks?: SignInProductLinks;
}

























export type InvalidUnlockProps = {
duration?: number;
handleResend?: () => Promise<void> | undefined;
};

export interface ISignInWizardState {
forms: {
[SignInWizardForm.SIGN_IN]: {
[WizardFieldCode.USERNAME]: string;
[WizardFieldCode.PASSWORD]: string;
};
[SignInWizardForm.CREATE_USER]: {
[WizardFieldCode.FIRSTNAME]: string;
[WizardFieldCode.LASTNAME]: string;
[WizardFieldCode.USERNAME]: string;
[WizardFieldCode.PASSWORD]: string;
[WizardFieldCode.PASSWORD_CONFIRM]: string;
[WizardFieldCode.MEMBER_NUMBER]: string;
};
[SignInWizardForm.VERIFY]: {
[WizardFieldCode.MFA_VERIFICATION]: string;
};
[SignInWizardForm.VERIFY_PHONE]: {
























export interface IFormProps {
id?: string;
children?: React.ReactNode;
submitForm: IGetWizardStepsProps['submitForm'];
handleInputChange: IGetWizardStepsProps['handleInputChange'];
handleResendCode?: IGetWizardStepsProps['handleResendCode'];
tenantName?: string;
formData: ISignInWizardState['forms'];
errors: ISignInWizardState['errors'];
formTouched: boolean;
handleSetIsDialogVisible?: IGetWizardStepsProps['handleSetIsDialogVisible'];
isDialogVisible?: boolean;
complexityRules?: ConsumerMgmtPasswordComplexityResponse | undefined;
recoveryValidationCredentials?: SignInWizardRecoveryVerifyCredentialsState;
}

export interface ICreateUserFormProps extends IFormProps {
asyncErrors: ISignInWizardState['asyncErrors'];
}

export interface IMfaVerificationFormProps extends IFormProps {
asyncErrors: ISignInWizardState['asyncErrors'];
}

























errors: SignInWizardAsyncError[];
};

export type SignInWizardAsyncErrorResponse = {
result: SignInWizardAsyncErrorResponseResult;
authStatus?: string;
};

export type GetSubmitValidationParams = {
errorCode: SignInWizardAsyncErrorCode;
activeStep: SignInWizardStep;
t: Translator;
status?: string;
};

// type guard for catch clause in useFormSubmit
export const isSignInWizardAsyncErrorResponse = (x: any): x is SignInWizardAsyncErrorResponse => {
return typeof x?.result?.errors[0]?.code === 'string' && typeof x?.result?.errors[0]?.message === 'string';
};

type ConsumerMgmtMfaFactorParams = {
phoneNumber?: string;
};

























};

export interface ConsumerMgmtMfaResponse {
status?: string;
stateToken?: string;
sessionToken?: string;
factor?: ConsumerMgmtMfaFactor;
user?: AuthnUser;
}

export interface UserAuthenticateResponse {
status: string;
sessionToken: string;
stateToken?: string;
user: AuthnUser;
factors?: Array<ConsumerMgmtMfaFactor>;
}

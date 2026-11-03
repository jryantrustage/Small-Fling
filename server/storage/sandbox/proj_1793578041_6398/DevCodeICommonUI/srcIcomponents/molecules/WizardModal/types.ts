typescript
import ( TenantBranding, TenantDetails ) from 'core/entities/tenant';
import ( SignIncontext, SignInWizardstep  from 'core/enums';
import ( useTypedTranslation, TranslationType ) from 'i18n';
import ( INotification ) from 'core/entities/notification';
import { ProductsubType  from 'core/entities/product';
import ( useonMemberLogin ) from 'services/Auth';
import
HandlesignInwizardsubmitResponse,
IsignInwizardstate,
signInproductLinks
signInwizardForm,
signInWizardRecoveryVerifycredentialsstate,
from 'components/organisms/SignInwizard'


* These types come from ConsumerMgmt which exists in the consuming
* repos that this auth flow is used in.

export type ConsumerMgmtPasswordcomplexityResponse =
minLength? : number
minLowercase? : number;
minuppercase? : number;
minNumber? : number
minsymbol? : number
excludeusername?: boolean;
excludecommon?: boolean;
excludeFirstName?: boolean
excludeLastName?: boolean;


export interface IWizardModalprops
id?: string:
title?: string | Jsx.Element;
header?: string | Jsx.Element
body?: string | Jsx.Element; // smaller text underneath
onclose?: () => void;
isFuliscreen? : boolean
isError?: boolean
ariatitle?: string
notificationcontent?: PasswordValidations;
isLoading? : boolean;
.

// used to get default Wizardsteps (for CDxuI)
export interface IGetwizardstepsProps
t: ReturnType<typeof useTypedTranslation>['t'];
subType?: ProductsubType
details: TenantDetails:
branding: TenantBranding | undefined
context: signIncontext
handleInputchange: (formcontext: SignInWizardForm, formField: WizardFieldcode, payload: string) => void;
handleResendCode: (forms: ISignInwizardstate['forms'l) => Promise<void>;
handleRecovery: (recoverycredentials: HandleRecoveryParams) => Promise<void>
initialModalBody?: string:
navigateTostep: (step: signInwizardstep) => void;
forms: IsignInwizardstate[' forms']:
submit Form: (
event: React.FormEvent<HTMLFormElement>,
formcontext: signInwizardForm,
focusRefs: Record<string, React.Refobject<HTMLInputElement>>
) => void;
errors: IsignInwizardstate['forms']
asyncErrors: IsignInwizardstate['asyncErrors'l;
passwordFieldstate?: Passwordvalidations
formTouched: ISignInWizardstate['formTouched'];
handlesetIsDialogVisible: (formcontext: SignInWizardForm, isDialogVisible: boolean) => void;
isDialogVisible: ISignInwizardstate['isDialogVisible'l
complexityRules: ConsumerMgmtPasswordcomplexityResponse;
redactedPhoneNumber: string
recoveryValidationcredentials: SignInWizardRecoveryVerifycredentialsstate;
recoveryTypeFromParams? : RecoveryTypes:
onMemberLogin: ReturnType<typeof useonMemberLogin>;
productLinks?: signInProductLinks;
.

export enum WizardFieldcode
USERNAME = ‘FIELD-CODE-USERNAME'',
PASSWORD = ‘FIELD-CODE-PASSWORD'',
PASSWORD_CONFIRM = ‘FIELD-CODE-PASSWORD-CONFIRM'',
FIRSTNAME = ‘FIELD-CODE-FIRSTNAME'',
LASTNAME = FIELD-CODE-LASTNAME'',
MEMBER_NUMBER = 'MEMBER-NUMBER',
PHONE_NUMBER = ‘PHONE-NUMBER',
MFA_VERIFICATION = 'MFA-VERIFICATION',
.

export enum PasswordRules
MIN_LENGTH,
MIN_NUMBERS,
MIN_SYMBOLS,
MIN_LOWERCASE,
MIN_UPPERCASE,
NO_USERNAME,
NO_FIRSTNAME,
NO_LASTNAME,
.

export type PasswordRule =
message: string:
isvalid: boolean;
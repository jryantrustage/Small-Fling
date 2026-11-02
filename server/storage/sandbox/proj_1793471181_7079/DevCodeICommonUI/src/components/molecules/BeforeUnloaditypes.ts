typescript
import ( IUseModalProps  from 'store/modal';
import ( Action, Location  from ‘history';

export interface IBeforeunloadprops

* @nativeDialogue that evaluates to :true: displays the native onbeforeunload dialog with default content on reload and tab or window close.
* @nativeDialogue that evaluates to : false: disables onbeforeunload.
* *
nativeDialogue?: boolean;

* @deprecated
* @customDialogue that evaluates to :true: will display the custom dialog modal with interactions and content defined by the other conditionals.
* @customDialogue that evaluates to :false: will not display the custom dialog modal.
* *
customDialogue?: boolean

* @formIsDirty Property passed to the component if :true: indicates that the form has been interacted with.
* @formIsDirty Property passed to the component if :false: indicates that the form has not been interacted with.
* *
formIsDirty: boolean;

* @formIsValid Property passed to the component if :true: indicates that all form fields are valid and that the form can be saved.
* @formIsValid Property passed to the component if :false: indicates that not all form fields are valid and that the form cannot be saved.
* *
formIsvalid: boolean;

* @onsaveAndcontinue Function and data passed to the component, can be used to save form data from modal.
* *
onsaveAndcontinue: (value?: string) => void;

* @tenantLogo Tenant logo URL

tenantLogo?: string:

* @tenantName Tenant name

tenantName?: string;

* @modaloverrides if defined, these properties will override the properties supplied to the modals that Beforeunload displays.

modaloverrides?: Partial<IUseModalProps>

* @openModalonRepeatedExitAttempts If :true: will show a modal each time the user attempts to exit then dismisses the prompt.
* @openModalonRepeatedExitAttempts If :false: will only show the modal once.
* *
openModalonRepeatedExitAttempts?: boolean;

* @formIsValid If :true: indicates the modal should be shown regardless if the form is dirty or the back button has been selected.
* @formIsvalid If : false: indicates normal logic.

shouldaAlwaysBlock?: boolean;


* @onBlock Function that is used when the modal shows up.

onBlock?: (nextLocation: Location, historyAction: Action) => void;
.

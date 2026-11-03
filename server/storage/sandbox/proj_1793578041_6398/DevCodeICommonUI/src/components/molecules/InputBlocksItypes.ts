typescript
import ( INotification  from 'core/entities/notification';
import ( IDataField ) from ‘core/entities/loanApplication'';
import ( IDynamicInputFieldProps ) from 'components/molecules/DynamicInputField';
import ( Tenant  from 'context';

export interface IuseInputField
onBlur?: () => void;
showDefaultError: boolean;
notificationList: INotificationl:
setNotificationList: React.Dispatch<React.SetstateAction<INotification[]>>;
className: string;
tenant: Tenant;
setTouched: React.Dispatch<React .SetstateAction<boolean>>;
.
.
export interface InputwrapperProps extends IDynamicInputFieldProps f
notificationList?: INotification［l;
setNotificationList?: React.Dispatch<React.SetstateAction<INotification[]>>;
hideLabel? : boolean;
showDefaultError?: boolean
showErrorIconInsideInput?: boolean;
labelAsText?: boolean;

.

export interface InputLabelProps
dataField: IDataField;
handleButtonclick?: (name: string, value?: string) => void;
labelAsText? : boolean;
labelIcon?: Jsx.Element;
fieldcontext? : any
.

export interface InputErrorprops
dataField: IDataField;
error? : string:
showErrorIconInsideInput?: boolean;
showDefaultError?: boolean
.

export interface InputHelpcontentProps (
dataField: IDataField;
.

export interface InputNotificationsProps
notificationList?: INotification[l
setNotificationList?: React.Dispatch<React.SetstateAction<INotification[]>>;
.

export interface InputDescriptionProps (
dataField: IDataField;
.

"'typescript"
import React from 'react';
import { IcoN_TYPEs, NotificationDisplay, NotificationType } from 'commonui';
import appConfig from 'api/appConfig';
import { ChaseTransactionErrorEvent } from './types';

const CHASE_LOAD_SCRIPT_HOST = appConfig.REACT_APP_CHASE_SCRIPT_HOST;
const CHASE_LOAD_SCRIPT_PATH = 'includes/hpfParent.min.js';

const formatErrorMessage = (
    errorContent: ChaseTransactionErrorEvent I ChaseTransactionErrorEvent[]
): JSX.Element  string => {
    if (!errorContent){
        return 'please update with a valid credit card.';
    }
    const errorArray = !Array.isArray(errorContent) ? [errorContent] : errorContent;
    if ((errorArray.length === 0) {
        return 'Please update with a valid credit card.';
    }
    return(
        <div>
            <p>Please fix the following issues:</p>
            {errorArray.map((it) =>(
                <li>{it.status_message}</li>
            ]}}
        </div>
    };
};

export const getChaseIframeLoadscript = (): string => {
    return ‘${CHASE_LOAD_SCRIPT_HOST}/${CHASE_LOAD_SCRIPT_PATH}';
};

/** This function disables the default event handling functions that
    the Chase payment iframe configures. Currently, only the 'handlePaymentErrors'
    function is overridden, since it produces an alert that is unwanted. All
    other event handlers remain unaffected, and we simply attach additional handlers
    to each event type using the 'createPaymentEventListener' function.
>[
export const addwindowEventoverrides = (window: Window): void => {
    const cw = window as any;
    cw.handleTransactionErrors = () => {};
    cw.handlePaymentErrors = () => {};
};

export const removewindowEventoverrides = (window: Window): void => {
    const cw = window as any;
    cw.handlePaymentErrors = null;
    cw.cancelPayment = null;
};

export interface NotificationFunctions
    clearAllDisplayNotifications: (notification: any) => void;
    addNotification: (notification: any) => void;
}

export const createPaymentEventListener = (
    notificationFunctions: NotificationFunctions,
    setUID: (v: string) => void,
    hasPmtDetails: boolean,
    setHasPmtDetails: (v: boolean) => void,
    onGoBack: () => void,
    closeModal: () => void,
    incrementAttempts: () => void
   ((ev: MessageEvent<any>) => any) => {
    const { clearAllDisplayNotifications, addNotification  = notificationFunctions;

    return (event) => {
        const {
            data: { subject, content },
        → = event;
        const uId = content ? content.uid : undefined;
        switch (subject){
            case 'init':
                break;
            case 'startPayment':
                clearAllDisplayNotifications('GLOBAL');
                break;
            case 'cancelPayment':
                if(!hasPmtDetails){
                    onGoBack();
                }
                closeModal();
                break;
            case 'completePayment':
                setUID(uId);
                setHasPmtDetails(true);
                addNotification(
                    type: NotificationType.SUCCEsS,
                    display: NotificationDisplay.GLOBAL,
                    title: 'Payment successfully processed',
                    dismissable: true,
                    icOn: ICON_TYPES.INFORMATION,
                }};
                break;
            case 'handleTransactionErrors':
                addNotification({
                    type: NotificationType.ERROR,
                    display: NotificationDisplay.GLOBAL,
                    title: 'Invalid payment information.',
                    message: formatErrorMessage(content),
                    dismissable: true,
                    icOn: ICON_TYPES.ERROR,
                    errorCode: 'ERR_CC_PAYMENT_INFO',
                }};
                incrementAttempts();
                break;
            case 'handlePaymentErrors':
                addNotification({
                    type: NotificationType.ERROR,
                    display: NotificationDisplay.GLOBAL,
                    title: 'Invalid payment information.',
                    message: formatErrorMessage(content),
                    dismissable: true,
                    icOn: ICON_TYPES.ERROR,
                    errorCode: 'ERR_CC_PAYMENT_INFO',
                }};
                incrementAttempts();
                break;
            case 'whatsThis':
                addNotification({
                    type: NotificationType.INFO,
                    display: NotificationDisplay.GLOBAL,
                    title: 'CvC stands for Card Verification Code.',
                    message:
'The Cvc is usually the last three digits on the signature strip on the back of the card, but it can also be a four-digit code on the front of an American Expresscard.',
                    dismissable: true,
                    icon: ICON_TYPES.INFO_BLUE,
                }};
                break;
            default:
                // eslint-disable-next-line no-console
                console.log('Unhandled event type');
                break;
        }
    };
};

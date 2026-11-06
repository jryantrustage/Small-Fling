-'typescript'
/* istanbul ignore file */

import React, { useContext, useEffect, usestate } from 'react';
import { nonHookTypedTranslation  from 'i18n';
import { DynamicNotification, ModalContext, NotificationContext, NotificationDisplay  from'commonui';
import { InsuranceAppService  from 'api/InsuranceAppService';
import { getCaptchaToken } from 'utils/recaptcha';
import { ApiAppError } from 'types/customTypes';
import { isJsonstring  from 'utils/isJsonstring';
import { generatePath } from 'react-router';
import { useNavigate } from 'react-router-dom';
import {
    addwindowEventOverrides,
    createPaymentEventListener,
    getChaseIframeLoadScript,
    removewindowEventOverrides,
} from './utils';
import { SCHeader, ScSubheader, SCNotificationwrap, SCIframe } from './styles';
import { LoadingIcon } from '../LoadingIcon';
import { ChasePaymentModalBodyProps  from './types';
import { ListedRoutes } from '../../Router/ListedRoutes';

const MAX_CC_ATTEMPTS_STRING = import.meta.enV.REACT_APP_MAX_CC_ATTEMPTS;
const maxRetryAttempts = MAX_CC_ATTEMPTS_STRING ? +MAX_CC_ATTEMPTS_STRING : 5;

const ChasePaymentModalBody = ({
    insuranceAppId,
    hasPmtDetails,
    setHasPmtDetails,
    setPmtDetailsFormData,
    onGoBack,
    setMaxAttemptsReached,
    getChaseIframeUrl = InsuranceAppService.getCreditCardImageUrl,
   ChasePaymentModalBodyProps): JSX.Element => {
    const { addNotification, clearAllDisplayNotifications } = useContext(NotificationContext);
    const { close } = useContext(ModalContext);

    const [url, setUrl] = usestate('');
    const [uID, setUID] = usestate('');

    const [scriptLoading, setScriptLoading] = usestate(true);
    const [loadIframe, setLoadIframe] = usestate(false);
    const [addEventListeners, setAddEventListeners] = useState(false);
    const [iframeLoaded, setIframeLoaded] = usestate(false);

    const [invalidPmtCounter, setInvalidPmtCounter] = useState(O);

    const navigate = useNavigate();

    const incrementAttempts = (): void => {
        setInvalidPmtCounter((prev) => prev + 1);
    };

    useEffect(() => {
        if (!scriptLoading){
            return;
        }
        // Load the external JavaScript file
        const script = document.createElement('script');
        script.src = getChaseIframeLoadScript();
        document.body.appendChild(script);
        script.onload = () => {
            setScriptLoading(false);
            setLoadIframe(true);
        };
},[scriptLoading])

    useEffect(() => {
        if(!loadIframe){
            return;
        }
        clearAllDisplayNotifications('GLOBAL');
        const fetchurl = async () => {
            try {
                const captchaToken = await getCaptchaToken('payment');
                const respUrl = await getChaseIframeUrl(insuranceAppId, captchaToken);
                setUrl(respUrl);
                setAddEventListeners(true);
            } catch (e: unknown)
                if (e instanceof Error) {
                    const appResultError: ApiAppError = isJsonstring(e.message)
                        ? JsoN.parse(e.message).payload?.appResult
                         : undefined;
                    if (appResultError?.redirect) {
                        navigate(generatePath(ListedRoutes.summary, { insuranceAppId:
                    }
                }
                setLoadIframe(false);
                close();
            }
        };

        fetchUrl();
}, [clearAllDisplayNotifications, getChaseIframeUrl, close, insuranceAppId, loadIframe,navigatel);

    useEffect(() => {
        if (!addEventListeners){
            return undefined;
        }

        addwindowEventOverrides(window);
        const customEventListener = createPaymentEventListener(
            { clearAllDisplayNotifications, addNotification ,
            setUID,
            hasPmtDetails,
            setHasPmtDetails,
            onGoBack,
            close,
            incrementAttempts
        ];

        window.addEventListener('message', customEventListener):

        const errorListener = (event: ErrorEvent) => {
            // eslint-disable-next-line no-console
            console.error('Uncaught Error:', event.error);
        };
        window.addEventListener('error', errorListener);

        setIframeLoaded(true);

        // cleanup function when the component is unmounted
        return ()=>{
            removewindowEventoverrides(window);
            window.removeEventListener('message', customEventListener);
            window.removeEventListener('error', errorListener);
        };
    }, [
        addEventListeners,
        addNotification,
        clearAllDisplayNotifications,
        close,
        hasPmtDetails,
        onGoBack,
        setHasPmtDetails,
    ]];

    useEffect(() => {
        if(!uID){
            return;
        }
        const fetchPaymentDetails = async () => {
const fields = await InsuranceAppService.getCreditCardProcessedPayment(insuranceAppId, uID);
            setPmtDetailsFormData(fields);
            close();
        };
        fetchPaymentDetails();
     , [uID, close, setMaxAttemptsReached, insuranceAppId, setPmtDetailsFormData);

    useEffect(() => {
        if (invalidPmtCounter < maxRetryAttempts) {
            return;
        }
        setMaxAttemptsReached(true);
        close();
      , [invalidPmtCounter, close, setMaxAttemptsReachedj);

    if (!iframeLoaded){
        return <LoadingIcon backgroundColor='contrastwhite' fixedHeight={5oo} />;
    }

    return(
        >>
            <sCNotificationwrap>
                <DynamicNotification display={NotificationDisplay.GLoBAL} limit={5} />
            </SCNotificationWrap>
            {!scriptLoading && url && (
                >>
                    <SCHeader>{nonHookTypedTranslation('CHASE_PAYMENT_MODAL_HEADER')}</SCHeader>
<SCSubheader>{nonHookTypedTranslation('CHASE_PAYMENT_MODAL_SUBHEADER')}</SCSubheader>
<ScIframe id='credit-card-payment-iframe' title='Chase Credit Card iframe' src={url} />
                </>
            ]}
        >[>
    };
};

export { ChasePaymentModalBody };

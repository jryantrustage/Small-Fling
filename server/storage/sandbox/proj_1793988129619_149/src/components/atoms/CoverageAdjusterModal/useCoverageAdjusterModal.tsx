   'typescript'
import React, { useContext } from 'react';
import {
    IUseModalProps,
    useConfirmModal,
    LoanApplicationEntities as InsuranceAppEntities,
    DisplayMode,
    LoanApplicationEntities,
o5 } from 'commonui';
import { quoteToDataFields } from 'utils/adjustCoverageutils';
import { useTypedTranslation  from 'i18n';
import { CoverageAdjusterModalBody } from './CoverageAdjusterModalBody';
o9 import { InsuranceAppContext } from '. ./../../contexts/InsuranceAppContext';
import { IInsuranceApp, InsuranceAppQuoteResponse, Quoteoption } from'../../../types/customTypes';

export function useCoverageAdjusterModal(
    insuranceAppResponse: providedInsuranceAppResponse,
    getAppQuote,
    updateInsuranceAppSegment: updateInsuranceAppSegmentOverride,
    setInsuranceAppResponse: setInsuranceAppResponseOverride,
    setIsFormLoading = () => {},
    incrementRefreshCounter: incrementRefreshCounterOverride,
}; {
    insuranceAppResponse?: IInsuranceApp;
    getAppQuote: (insuranceAppId: string) => Promise<InsuranceAppQuoteResponse>;
    setAppLoading?: (appLoading: boolean) => void;
    updateInsuranceAppSegment?:(
        insuranceAppId: string,
        navRequest: LoanApplicationEntities.IApplicationCallPayload,
        mode: 'none' I 'save',
        captchaRequired: boolean
    ) => Promise<IInsuranceApp>;
    setInsuranceAppResponse?: (app: IInsuranceApp) => void;
    setIsFormLoading?: (loading: boolean) => void;
    incrementRefreshCounter?: () => void;
}] {
    const insuranceCtx = useContext(InsuranceAppContext);
const insuranceAppResponse = providedInsuranceAppResponse ?? insuranceCtx.insuranceAppResponse;
const updateInsuranceAppSegment = updateInsuranceAppSegmentOverride ?? insuranceCtx.updateInsuranceAppSegment;
const setInsuranceAppResponse = setInsuranceAppResponseOverride ?? insuranceCtx.setInsuranceAppResponse;
const incrementRefreshCounter = incrementRefreshCounterOverride ?? insuranceCtx.incrementRefreshCounter;
    const showConfirmModal = useConfirmModal();
const { t } = useTypedTranslation();
    if (!insuranceAppResponse) {
        return undefined;
    }

    const onSubmit = (quote: Quoteoption) => {
        const {
            insuranceAppId,
            externalApp: { billingFreq },
            progress: { currentsection, currentSegment },
            segment: { captchaRequired },
         = insuranceAppResponse;

        const navRequest: InsuranceAppEntities.IApplicationCallPayload = {
            action: 'SeekToEnd',
            dataValues: quoteToDataFields(quote, billingFreq),
            currentSection,
            currentSegment,
        };
          f (!updateInsuranceAppSegment){
            setIsFormLoading(false);
            return;
        }
        setIsFormLoading(true);
        updateInsuranceAppSegment(insuranceAppId, navRequest, 'save', captchaRequired)
            .then((res) => {
                setInsuranceAppResponse(res);
                incrementRefreshCounter();
                setIsFormLoading(false);
            }}
            .catch((reason) => {
                // eslint-disable-next-line no-console
                console.error(reason);
                setIsFormLoading(false);
            }};
    };

    return async () => {
        let quote = {} as Quoteoption;
        const setQuote = (q: Quoteoption) => {
            quote = q;
        };

        const props: IUseModalProps = {
            ariaTitle: t('COVERAGE_ADJUSTER_MODAL_ARIA_TITLE'),
            title: t('COVERAGE_ADJUSTER_MODAL_TITLE'),
            body:(
                <InsuranceAppContext.Provider value={{ ...insuranceCtx, insuranceAppResponse }>
                    <CoverageAdjusterModalBody getAppQuote={getAppQuote} setQuote={setQuote} />
                </InsuranceAppContext.Provider>
            ],
            modalwindowClassName: 'coverage-adjuster-modal',
            width:'375px',
            [>>
* @todo fix this to allow for a cancel button - currently it updates even if you press the close button,
             * and the "Save and Continue" button is actually a cancel button.
             >[
            continueBtnDisabled: false,
            oncloseBtnclick:()=> {},
            onclose:() => {},
            stacked: true,
            cancelBtnText: t('GLOBAL_CANCEL'),
            continueBtnText: t('GLOBAL_SAVE_AND_CONTINUE'),
            onContinue: () => onSubmit(quote),
            onContinueBtnClick: () => onSubmit(quote),
            displayMode: DisplayMode.LIGHT,
        };
        try {
            const modal = await showConfirmModal(props);
            return modal;
        } catch (error)
            // eslint-disable-next-line no-console
            console.error(error);
        }
        return undefined;
    };
}

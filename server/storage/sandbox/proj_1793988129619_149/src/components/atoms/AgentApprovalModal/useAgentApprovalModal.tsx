-'typescript'
import React, { useContext } from 'react';
import { DisplayMode, IUseModalProps, useConfirmModal } from 'commonui';
import { useTypedTranslation  from 'i18n';
import { IInsuranceApp } from 'types/customTypes';
o import { InsuranceAppContext } from 'contexts/InsuranceAppContext';
import { AgentApprovalModalBody  from './AgentApprovalModalBody';

export function useAgentApprovalModal(params?: { insuranceAppResponse?: IInsuranceApp;onContinue?:() => void }){
    const insuranceCtx = useContext(InsuranceAppContext);
const insuranceAppResponse = params?.insuranceAppResponse ?? insuranceCtx.insuranceAppResponse;
    const onContinue = params?.onContinue;
    const showConfirmModal = useConfirmModal();
const { t } = useTypedTranslation();

    const handleContinue = () => {
        if (onContinue){
            onContinue();
        }
    };

    if (!insuranceAppResponse)
        return undefined;
    }

    return async () => {
        const underwritingstatus = insuranceAppResponse.externalApp?.underwritingstatus;
        const modalType: 'Approved' | 'Declined' = underwritingstatus === 'Approved' ?

        const modalProps: IUseModalProps = {
            body:(
                <InsuranceAppContext.Provider value={ ...insuranceCtx, insuranceAppResponse }}>
                    <AgentApprovalModalBody modalType={modalType} />
                </InsuranceAppContext.Provider>
            ],
            ariaTitle:
modalType === 'Approved' ? t('AGENT_APPROVAL__APPROVED_HEADER') : t('AGENT_APPROVAL__DECLINED_HEADER'),
            modalwindowClassName: 'agent-approval-modal agent-approval-modal--${modalType}',
            width: '512px',
            continueBtnDisabled: false,
            onContinueBtnClick: handleContinue,
            onclose:() => {},
            continueBtnText: 'OKAY',
            displayMode: DisplayMode.LIGHT,
            stacked: true,
        };

        try {
            const modal = await showConfirmModal(modalProps);
            return modal;
        } catch(error){
            // eslint-disable-next-line no-console
            console.error(error);
        }
        return undefined;
    };
}

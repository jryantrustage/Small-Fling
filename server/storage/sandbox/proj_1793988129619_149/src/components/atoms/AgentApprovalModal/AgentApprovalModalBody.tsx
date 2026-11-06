-'typescript'
import React, { useContext } from 'react';
import { Markdown } from 'commonui';
import { useTypedTranslation  from 'i18n';
import { InsuranceAppContext } from 'contexts/InsuranceAppContext';
import { ScContent, SCHeader } from './styles';

export interface AgentApprovalModalBodyProps {
    modalType: 'Approved' | 'Declined';
}

export const AgentApprovalModalBody = ({ modalType }: AgentApprovalModalBodyProps): JSX.ElementI null => {
    const { t } = useTypedTranslation();
    const { insuranceAppResponse } = useContext(InsuranceAppContext);
    if (!insuranceAppResponse){
        return null;
    }

    // Find the appropriate modal configuration from externalApp.modals
    const modalId = modalType === 'Approved' ? 'AGENT-APPROVED-MODAL' : 'AGENT-DECLINED-MODAL'
const modalConfig = insuranceAppResponse.externalApp.modals?.find((modal) => modal.id ===modalId);

    // Fallback to translation keys if modal config is not found
    const headerText =
        modalConfig?.title Il
(modalType === 'Approved' ? t('AGENT_APPROVAL__APPROVED_HEADER') : t('AGENT_APPROVAL__DECLINED_HEADER'));

    const messageText =
        modalConfig?.body Il
(modalType === 'Approved' ? t('AGENT_APPROVAL_APPROVED_MESSAGE') : t('AGENT_APPROVAL__DECLINED_MESSAGE'));
    return(
        >>
            <SCHeader>{headerText}</SCHeader>
            <SCContent>
                <Markdown text={messageText} />
            </SCContent>
        >[>
    };
};

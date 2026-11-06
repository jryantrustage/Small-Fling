   'typescript'
import React from 'react';
import { IUseModalProps, useConfirmModal } from 'commonui';
import { useTypedTranslation  from 'i18n';
import { ChasePaymentModalBody } from './ChasePaymentModalBody';
import { ChasePaymentModalBodyProps } from './types';

export function useChasePaymentModal(props: ChasePaymentModalBodyProps) {
    const showConfirmModal = useConfirmModal();
    const { t } = useTypedTranslation();
    const { hasPmtDetails: hasPmtDetailsOnLoad, onGoBack  = props;

    return async () => {
        const modalProps: IUseModalProps = {
            body: <ChasePaymentModalBody {...props} />,
            ariaTitle: t('CHASE_PAYMENT_MODAL_HEADER'),
title: -'',
            modalwindowClassName: 'chase-payment-modal',
            onclose:()=> {
                if(!hasPmtDetailsOnLoad){
                    onGoBack();
                }
            },
            width: '512px',
        };
        try {
            const modal = await showConfirmModal(modalProps);
            return modal;
        } catch (error)
            // eslint-disable-next-line no-console
            console.error(error);
        }
        return undefined;
    };
}

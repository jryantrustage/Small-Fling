   'typescript'
export interface ChaseTransactionErrorEvent {
    field: string;
    status_code: number;
    status_message: string;
}

export interface ChasePaymentModalBodyProps {
    insuranceAppId: string;
    hasPmtDetails: boolean;
    setHasPmtDetails: (v: boolean) => void;
    setPmtDetailsFormData: (v: Record<string, string>) => void;
    onGoBack: () => void;
    setMaxAttemptsReached: (v: boolean) => void;
    productSpec?: string;
    getChaseIframeUrl?: (insuranceAppId: string, captchaToken?: string) => Promise<string>;
}

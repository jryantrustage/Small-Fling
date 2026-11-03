import { Theme, SCUtilityInput } from 'styles';

























export const SCPromoCodePromptContainerDiv = styled.div`
${sharedPromoCodePromptContainerStyles}
`;

const sharedPromoCodeCircleIconStyles = css`
border: 1px solid ${Theme.getColor('contrastGreyscale08')};
height: 24px;
width: 24px;
border-radius: 12px;
display: flex;
justify-content: center;
align-items: center;
`;

export const SCPromoCodeCircleIconButton = styled.button`
${sharedPromoCodeCircleIconStyles}
cursor: pointer;
`;

export const SCPromoCodeCircleIconDiv = styled.div`
${sharedPromoCodeCircleIconStyles}
`;

























flex-direction: row;
align-items: center;
`;

export const SCPromoCodeInputContainer = styled.div`
margin-top: 16px;
display: flex;
flex-direction: row;
`;

export const SCPromoCodeInput = styled(SCUtilityInput)`
text-transform: uppercase;
padding: 10px 12px;
::placeholder {
text-transform: none;
}
`;

export const SCPromoCodeButton = styled(CoreButton)`
max-width: 112px;
margin-left: 16px;
min-width: initial;
`;
























SCPromoCodeInputContainer,
SCPromoCodePrompt,
SCPromoCodePromptContainerButton,
SCPromoCodePromptContainerDiv,
} from './PromoCodeForm.styles';
import { Modals } from '../../../../core/enums';

export enum PromoCodeFormState {
COLLAPSED = 'COLLAPSED',
EXPANDED = 'EXPANDED',
CONFIRMED = 'CONFIRMED',
}

export const PromoCodeForm = ({
id,
onSetPromoCode,
promoCode = '',
}: {
id?: string;
onSetPromoCode: (newPromoCode: string) => void;
promoCode?: string;
}): JSX.Element => {
const { t } = useTypedTranslation();

























setFormState(PromoCodeFormState.COLLAPSED);
}
};

  const onConfirmPromoCode = (newPromoCode: string) => {
if (newPromoCode && newPromoCode !== '') {
setFormState(PromoCodeFormState.CONFIRMED);
}
onSetPromoCode(newPromoCode);
};

  const { showModal, close } = useContentModal();

  const onClickCloseIcon = () => {
showModal({
title: t('REMOVE_PROMO_CODE'),
bodyData: [
{
header: t('REMOVE_PROMO_CODE_DIALOGUE_HEADER'),
content: t('REMOVE_PROMO_CODE_DIALOGUE_CONTENT'),
},
],
id: 'remove-promo-code-modal',
continueBtnText: t('REMOVE_PROMO_CODE_DIALOGUE_CONFIRM'),
























<SCPromoCodeCircleIconDiv>
{formState === PromoCodeFormState.CONFIRMED && <PromoCodeConfirmedIcon id='promo-code-confirmed-icon' />}
{formState === PromoCodeFormState.COLLAPSED && <PromoCodeCollapsedIcon id='promo-code-collapsed-icon' />}
{formState === PromoCodeFormState.EXPANDED && <PromoCodeExpandedIcon id='promo-code-expanded-icon' />}
</SCPromoCodeCircleIconDiv>
<SCPromoCodePrompt>
{/* PROMO_APPLIED */}
{formState === PromoCodeFormState.CONFIRMED ? `${t('PROMO_APPLIED')}:` : t('ADD_PROMO_CODE')}
{formState === PromoCodeFormState.CONFIRMED && (
<>
<SCPromoCodeAppliedText id='promo-code-applied-value'>{promoCode}</SCPromoCodeAppliedText>
<SCPromoCodeCloseIconButton
id='promo-code-close-icon-button'
onClick={onClickCloseIcon}
aria-label={t('REMOVE_PROMO_CODE_DIALOGUE_BUTTON')}>
<SCPromoCodeCloseIcon />
</SCPromoCodeCloseIconButton>
</>
)}
</SCPromoCodePrompt>
</PromoCodePromptContainer>
{formState === PromoCodeFormState.EXPANDED && (
<SCPromoCodeInputContainer>
<SCPromoCodeInput
























);
};

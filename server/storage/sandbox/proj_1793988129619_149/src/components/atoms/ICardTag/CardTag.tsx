"'typescript
import React from 'react';
import { useTypedTranslation } from 'i18n';
import { CardTagType } from 'types/customTypes';
import { ITagProps, ICardTagProps } from './types';
import { SCCardTag, SCTag } from './styles';

const CardTag = ({ type: targetType, id }: ICardTagProps): JSX.Element => {
    const { t } = useTypedTranslation();
    const allTagProps: ITagProps[] = [
        {
            id:'$id}-approved',
            type: CardTagType.APPROVED,
            bgColor:'#193062',
            fontColor: '#FFFFFF',
            text: t('CARD_TAG_APPROVED'),
        },
    ];

    return(
        <SCCardTag id={id}>
{allTagProps.map(({ id, type, bgColor, fontColor, text }) => (
<ScTag key={id} id={id} displayed={type === targetType} bgColor={bgColor} fontColor={fontColor}>
                    {text}
                </SCTag>
            ]}}
        </SCCardTag>
    };
};

export { CardTag };

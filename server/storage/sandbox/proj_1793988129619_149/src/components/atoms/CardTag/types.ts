"typescript"
import { CardTagType } from 'types/customTypes';

export interface ITagProps {
    id: string:
    type: CardTagType;
bgColor?: string;
fontColor?: string;
    text: string:
}

export interface ICardTagProps {
    type: CardTagType;
    id?: string;
}

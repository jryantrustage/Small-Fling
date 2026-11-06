import { InfoIcon, Markdown } from 'commonui';
import React from 'react';
import styled from 'styled-components';

const SCInfoIcon = styled(InfoIcon)`
margin: 0 6px;
`;

const SCMarkdown = styled(Markdown)`
font-size: 12px;

  h1.
h2,
h3 {
font-size: initial;
margin: initial;
line-height: initial;
font-weight: bold;
}
`;

interface Props {
label: string;
helpText?: string;
}

const SettingsInfoIcon: React.FC<Props> = ({ label, helpText }) =>
helpText ? (
<SCInfoIcon modalTitle={label} modalBody={<SCMarkdown text={helpText} />} />
) : null;

export default SettingsInfoIcon;

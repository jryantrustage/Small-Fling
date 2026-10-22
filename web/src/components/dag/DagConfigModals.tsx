import React, { useState } from 'react';
import { Check, FileText } from 'lucide-react';
import { Modal } from '../../ConfirmModal';
import { copyToClipboard } from '../../utils/dagDiagnostics';


export interface Node3bExtractedTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractedText: string;
  linesCount: number;
  charCount: number;
  modelUsed: string;
}

export const Node3bExtractedTextModal: React.FC<Node3bExtractedTextModalProps> = ({
  isOpen,
  onClose,
  extractedText,
  linesCount,
  charCount,
  modelUsed
}) => {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const handleCopy = async () => {
    if (extractedText) {
      const ok = await copyToClipboard(extractedText);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="#58a6ff" />
          <span>DAG Node 3b: Local AI OCR Extracted Text</span>
        </div>
      }
      subtitle={`Extracted ${linesCount || 0} lines verbatim using ${modelUsed || 'MiniCPM-V (Ollama)'}`}
      confirmText={copied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}
      cancelText="Close"
      onConfirm={handleCopy}
      maxWidth="700px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#8b949e' }}>
          <span>{linesCount || 0} lines detected • {charCount || 0} characters</span>
          {copied && <span style={{ color: '#00ff9d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> Copied to clipboard!</span>}
        </div>
        <pre style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '12px',
          maxHeight: '400px',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '11px',
          color: '#e6edf3',
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
          margin: 0,
          userSelect: 'text'
        }}>
          {extractedText || 'No text extracted yet'}
        </pre>
      </div>
    </Modal>
  );
};

export { UniversalNodeConfigModal } from './UniversalNodeConfigModal';
export { Dag4OcrFullInspectorModal } from './Dag4OcrFullInspectorModal';
export type { Dag4OcrFullInspectorModalProps } from './Dag4OcrFullInspectorModal';

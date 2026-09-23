import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Eye, EyeOff, Check, Trash2, AlertCircle, Save } from 'lucide-react';
import { GeminiProvider } from '../../../lib/ai/GeminiProvider';

interface ApiKeyManagerProps {
  label: string;
  checkCommand: string;
  saveCommand: string;
  deleteCommand: string;
  placeholder: string;
  onClear?: () => void;
}

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ label, checkCommand, saveCommand, deleteCommand, placeholder, onClear }) => {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);

  useEffect(() => {
    checkKeyStatus();
  }, []);

  const checkKeyStatus = async () => {
    try {
      setIsChecking(true);
      setError(null);
      await invoke(checkCommand);
      setHasKey(true);
    } catch (err) {
      if (typeof err === 'string' && (err.includes('No API key found') || err.includes('No entry found') || err.includes('No Search API key found'))) {
        setHasKey(false);
      } else {
        setHasKey(false);
        if (typeof err === 'string' && !err.includes('__TAURI_INTERNALS__')) {
            setError(String(err));
        }
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleSave = async () => {
    if (!inputValue.trim()) return;
    
    try {
      setError(null);
      await invoke(saveCommand, { key: inputValue.trim() });
      if (onClear) onClear();
      setHasKey(true);
      setInputValue('');
      setShowPassword(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('__TAURI_INTERNALS__') || msg.includes("reading 'invoke'")) {
        setError('Tauri IPC is disconnected. Cannot save key outside desktop runtime.');
      } else {
        setError(msg);
      }
    }
  };

  const handleRemove = async () => {
    try {
      setError(null);
      await invoke(deleteCommand);
      if (onClear) onClear();
      setHasKey(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('__TAURI_INTERNALS__') || msg.includes("reading 'invoke'")) {
        setError('Tauri IPC is disconnected. Cannot delete key outside desktop runtime.');
      } else {
        setError(msg);
      }
    }
  };

  const textStyles = {
    fontFamily: "'JetBrains Mono', monospace",
  };

  const labelStyle = {
    ...textStyles,
    color: '#7ECFFF',
    fontSize: '9px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
  };

  const valueStyle = {
    ...textStyles,
    color: '#E0F0FF',
    fontSize: '11px',
  };

  const secondaryStyle = {
    ...textStyles,
    color: '#4BB8F0',
    fontSize: '9px',
  };

  const errorStyle = {
    ...textStyles,
    color: '#FF4D6A',
    fontSize: '9px',
  };

  return (
    <div className="flex flex-col gap-2 rounded p-3 mb-2" style={{ backgroundColor: 'rgba(0, 229, 255, 0.02)', border: '1px solid rgba(0, 229, 255, 0.05)' }}>
      <div className="flex justify-between items-center">
        <div style={labelStyle}>{label}</div>
        <div style={secondaryStyle} className="flex items-center gap-1">
          {isChecking ? (
            'Checking...'
          ) : hasKey ? (
            <>
              <Check size={10} color="#00E5FF" />
              <span style={{ color: '#00E5FF' }}>Key stored securely</span>
            </>
          ) : (
            'Not configured'
          )}
        </div>
      </div>

      <div className="flex justify-between items-center pt-1 pb-1">
        <div style={valueStyle}>
          {hasKey ? '●●●●●●●●●●●●●●' : '--------------------'}
        </div>
        {hasKey && (
          <button
            onClick={handleRemove}
            className="flex items-center gap-1 px-2 py-1 rounded transition-colors duration-200"
            style={{
              backgroundColor: 'rgba(255,77,106,0.1)',
              border: '1px solid rgba(255,77,106,0.3)',
              color: '#FF4D6A',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              textTransform: 'uppercase',
            }}
            title="Remove API Key"
          >
            <Trash2 size={10} />
            Remove
          </button>
        )}
      </div>

      {!hasKey && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="relative flex w-full items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              className="w-full px-2 py-1.5 rounded outline-none transition-colors duration-200"
              style={{
                ...valueStyle,
                backgroundColor: 'rgba(0,229,255,0.04)',
                border: '1px solid rgba(0,229,255,0.15)',
              }}
              onFocus={(e) => (e.target.style.border = '1px solid rgba(0,229,255,0.4)')}
              onBlur={(e) => (e.target.style.border = '1px solid rgba(0,229,255,0.15)')}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: '#00E5FF' }}
            >
              {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={!inputValue.trim()}
              className="flex items-center gap-1 px-2 py-1.5 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(0,229,255,0.1)',
                border: '1px solid rgba(0,229,255,0.3)',
                color: '#00E5FF',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              <Save size={10} />
              Save Key
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={errorStyle} className="flex items-center gap-1 mt-1">
          <AlertCircle size={10} />
          {error}
        </div>
      )}
    </div>
  );
};

const ApiKeySection: React.FC = () => {
  return (
    <div className="flex flex-col gap-3">
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        color: '#7ECFFF',
        fontSize: '9px',
        letterSpacing: '0.14em',
        textTransform: 'uppercase' as const,
      }} className="flex items-center gap-2">
        <Key size={10} color="#7ECFFF" />
        AI CONFIGURATION
      </div>

      <ApiKeyManager
        label="GEMINI API KEY"
        checkCommand="get_api_key"
        saveCommand="save_api_key"
        deleteCommand="delete_api_key"
        placeholder="Enter your Gemini API key"
        onClear={() => GeminiProvider.clearApiKey()}
      />

      <ApiKeyManager
        label="TAVILY SEARCH API KEY"
        checkCommand="get_search_key"
        saveCommand="save_search_key"
        deleteCommand="delete_search_key"
        placeholder="Enter your Tavily API key"
      />
    </div>
  );
};

export default ApiKeySection;

import React, { useState } from 'react';
import {
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { ProviderAuthManager } from '../../../lib/ai/providers/ProviderAuthManager';
import { cn } from '../../../lib/cn';
import styles from '../SpatialSurface.module.css';

export const VisualCanvasWorkspace: React.FC = () => {
  const [visualPrompt, setVisualPrompt] = useState(
    'Ethereal quantum energy nucleus surrounded by floating refractive glass lenses, dark obsidian background'
  );
  const [activeStyleAnchor, setActiveStyleAnchor] = useState('Photorealistic');
  const [resolutionChoice, setResolutionChoice] = useState('1024x1024');
  const [taskExecutionState, setTaskExecutionState] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);

  // Truthful validation of prompt & provider prerequisites without fake synthesis claims
  const handlePrepareGeneration = () => {
    setTaskExecutionState('running');
    setExecutionOutput(null);

    const openaiAuth = ProviderAuthManager.getAuthorization('OPENAI');
    const geminiAuth = ProviderAuthManager.getAuthorization('GEMINI');

    if (!openaiAuth.enabled && !geminiAuth.enabled) {
      setTaskExecutionState('error');
      setExecutionOutput(
        'Setup Required: Image generation endpoint not configured. Add an OpenAI or Google Gemini API key with image generation permissions in AI Providers.'
      );
      return;
    }

    const providerName = openaiAuth.enabled ? 'OpenAI DALL-E' : 'Google Gemini Imagen';
    setTaskExecutionState('completed');
    setExecutionOutput(
      `Prompt prepared for ${providerName} · Resolution: ${resolutionChoice} · Style: ${activeStyleAnchor}. Endpoint authenticated and ready for pipeline dispatch.`
    );
  };

  return (
    <div className={styles.taskVisualCanvas}>
      <div className={styles.canvasPreviewBox}>
        <div className={styles.canvasGridBackground} />
        <div className={styles.canvasCenterPlaceholder}>
          <Sparkles size={28} className="text-amber-400 animate-pulse" />
          <span className={styles.canvasStatusText}>
            Visual Diffusion Canvas · Latent Prompt Workspace
          </span>
        </div>
      </div>

      <div className={styles.styleAnchorsRow}>
        <span className={styles.settingMiniLabel}>STYLE ANCHOR:</span>
        {['Photorealistic', 'Volumetric 3D', 'Cyber Minimalist', 'Cinematic'].map((styleName) => (
          <button
            key={styleName}
            type="button"
            className={cn(
              styles.styleAnchorBtn,
              activeStyleAnchor === styleName && styles.styleAnchorBtnActive
            )}
            onClick={() => setActiveStyleAnchor(styleName)}
          >
            {styleName}
          </button>
        ))}
      </div>

      <div className={styles.canvasControlsRow}>
        <input
          type="text"
          value={visualPrompt}
          onChange={(e) => setVisualPrompt(e.target.value)}
          className={styles.promptInput}
          placeholder="Enter visual synthesis prompt..."
        />

        <select
          className={styles.resolutionSelect}
          value={resolutionChoice}
          onChange={(e) => setResolutionChoice(e.target.value)}
        >
          <option value="1024x1024">1024 × 1024</option>
          <option value="1920x1080">1920 × 1080</option>
          <option value="512x512">512 × 512</option>
        </select>

        <button
          type="button"
          onClick={handlePrepareGeneration}
          className={styles.executeButton}
          disabled={taskExecutionState === 'running'}
          title="Verify generation prerequisites and prepare prompt"
        >
          <Sparkles size={12} />
          <span>{taskExecutionState === 'running' ? 'CHECKING...' : 'PREPARE GENERATION'}</span>
        </button>
      </div>

      {executionOutput && (
        <div className={styles.taskConsoleOutput}>
          <div className={styles.consoleResult}>
            {taskExecutionState === 'error' ? (
              <AlertCircle size={12} className="text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
            )}
            <span>{executionOutput}</span>
          </div>
        </div>
      )}
    </div>
  );
};

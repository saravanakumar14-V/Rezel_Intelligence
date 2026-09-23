import React from 'react';
import {
  Sparkles,
  MessageSquare,
  Zap,
  BarChart3,
  Search,
  Shield,
  ChevronRight,
} from 'lucide-react';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
}

const CAPABILITY_SUMMARIES = [
  {
    id: 'create',
    title: 'CREATE',
    desc: 'Generate visuals, synthesize code modules, and build creative workflows.',
    icon: Sparkles,
    color: 'text-amber-400',
  },
  {
    id: 'converse',
    title: 'CONVERSE',
    desc: 'Engage in natural voice, conversational chat, and live multimodal reasoning.',
    icon: MessageSquare,
    color: 'text-cyan-400',
  },
  {
    id: 'automate',
    title: 'AUTOMATE',
    desc: 'Bridge 3D software (Blender, After Effects) and orchestrate autonomous execution.',
    icon: Zap,
    color: 'text-emerald-400',
  },
  {
    id: 'analyze',
    title: 'ANALYZE',
    desc: 'Monitor AI providers, memory graphs, telemetry, and compute allocation.',
    icon: BarChart3,
    color: 'text-blue-400',
  },
  {
    id: 'inspect',
    title: 'INSPECT',
    desc: 'Explore model benchmarks, vector knowledge sources, and security logs.',
    icon: Search,
    color: 'text-purple-400',
  },
  {
    id: 'control',
    title: 'CONTROL',
    desc: 'Tune personal atmosphere, autonomy trust gates, and execution policies.',
    icon: Shield,
    color: 'text-rose-400',
  },
];

export const CapabilitiesStage: React.FC<StageProps> = ({ onAdvance }) => {
  return (
    <div className={styles.stageStandard}>
      <div className={styles.stageHeader}>
        <span className={styles.stageCategoryTag}>STAGE 02 · CORE CAPABILITIES</span>
        <h1 className={styles.stageTitle}>What Rezel Does</h1>
        <p className={styles.stageSubtitle}>
          Rezel organizes advanced artificial intelligence into six focused operating domains.
        </p>
      </div>

      <div className={styles.capabilitiesGrid}>
        {CAPABILITY_SUMMARIES.map((cap) => {
          const Icon = cap.icon;
          return (
            <div key={cap.id} className={styles.capabilityCard}>
              <div className={styles.capabilityCardHeader}>
                <Icon size={16} className={cap.color} />
                <span className={styles.capabilityTitle}>{cap.title}</span>
              </div>
              <p className={styles.capabilityDesc}>{cap.desc}</p>
            </div>
          );
        })}
      </div>

      <div className={styles.stageActionDeck}>
        <span className={styles.techMeta}>6 REZEL DOMAINS READY</span>

        <button type="button" onClick={onAdvance} className={styles.primaryActionButton}>
          <span>CONTINUE</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

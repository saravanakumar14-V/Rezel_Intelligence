import InspectorShell from './InspectorShell';
import ModelIntelligenceSpace from '../panels/models/ModelIntelligenceSpace';

interface ModelInspectorProps {
  onClose?: () => void;
}

export default function ModelInspector({ onClose }: ModelInspectorProps) {
  return (
    <InspectorShell
      title="Models"
      subtitle="Local & Cloud Model Intelligence"
      onClose={onClose}
    >
      <ModelIntelligenceSpace />
    </InspectorShell>
  );
}

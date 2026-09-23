import React from 'react';
import ModelIntelligenceSpace from '../../panels/models/ModelIntelligenceSpace';

export const ModelCatalogWorkspace: React.FC = () => {
  return (
    <div className="w-full h-full min-h-[420px] overflow-hidden rounded-xl bg-[#030718]/80 border border-purple-500/20 p-2">
      <ModelIntelligenceSpace />
    </div>
  );
};

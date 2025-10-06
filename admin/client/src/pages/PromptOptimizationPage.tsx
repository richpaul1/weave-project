import React from 'react';
import { PromptOptimizationDashboard } from '../components/PromptOptimizationDashboard';

export const PromptOptimizationPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <PromptOptimizationDashboard />
    </div>
  );
};

export default PromptOptimizationPage;

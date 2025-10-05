import React from 'react';
import { PromptOptimizationDashboard } from '../components/PromptOptimizationDashboard';

export const PromptOptimizationPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <PromptOptimizationDashboard />
    </div>
  );
};

export default PromptOptimizationPage;

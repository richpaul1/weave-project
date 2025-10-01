// Reusable card panel styles
// This file contains consistent styling patterns for all card-based panels

export const cardPanelStyles = {
  // Container styles
  container: "space-y-4",
  expandableContainer: "space-y-4",
  
  // Header styles
  header: {
    wrapper: "flex items-center justify-between cursor-pointer",
    title: "text-sm font-medium flex items-center gap-2",
    icon: "h-3 w-3",
    badge: "text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded",
    expandButton: "h-6 w-6 p-0"
  },
  
  // Content card styles
  card: {
    base: "p-2 bg-muted rounded text-xs",
    label: "font-medium truncate",
    value: "text-muted-foreground truncate"
  },
  
  // Grid layouts
  grid: {
    twoColumn: "grid grid-cols-2 gap-4",
    threeColumn: "grid grid-cols-3 gap-4",
    fourColumn: "grid grid-cols-4 gap-4"
  },
  
  // Section styles
  section: {
    header: "font-medium text-xs mb-2",
    headerWithButton: "flex items-center justify-between mb-2",
    content: "text-gray-600 p-2 rounded border",
    contentScrollable: "text-gray-600 p-2 rounded border overflow-y-auto",
    contentMono: "text-xs text-gray-600 p-2 rounded border font-mono overflow-y-auto"
  },
  
  // Interactive elements
  button: {
    copy: "h-6 text-xs",
    copyIcon: "h-3 w-3",
    copyIconSuccess: "h-3 w-3 text-green-600",
    external: "h-6 w-6 p-0",
    toggle: "ml-4 bg-primary text-primary-foreground hover:bg-primary/90 h-7 px-3 text-xs"
  },
  
  // Layout utilities
  layout: {
    flexBetween: "flex items-start justify-between",
    flexCenter: "flex items-center gap-2",
    flexShrink: "flex-shrink-0",
    flexGrow: "flex-1 min-w-0",
    spaceBetween: "ml-2"
  },
  
  // Text utilities
  text: {
    truncated: "text-gray-400",
    label: "font-medium truncate",
    value: "text-muted-foreground truncate",
    timestamp: "text-muted-foreground mt-1"
  },
  
  // Badge styles
  badge: {
    outline: "mt-1 text-xs",
    secondary: "text-xs",
    relevance: "text-xs ml-2 flex-shrink-0"
  },
  
  // Color-coded indicators with left border
  indicators: {
    red: "border-l-4 border-red-300 bg-red-50",
    orange: "border-l-4 border-orange-300 bg-orange-50",
    yellow: "border-l-4 border-yellow-300 bg-yellow-50",
    blue: "border-l-4 border-blue-300 bg-blue-50",
    green: "border-l-4 border-green-300 bg-green-50",
    gray: "border-l-4 border-gray-300 bg-gray-50"
  },

  // Themed card containers
  themed: {
    blue: {
      container: "bg-card border-border border-blue-200",
      icon: "h-4 w-4 text-blue-600",
      title: "text-sm text-muted-foreground"
    },
    neutral: {
      container: "bg-card border-border",
      icon: "h-4 w-4 text-muted-foreground",
      title: "text-sm text-muted-foreground"
    }
  },

  // Generic content layouts
  content: {
    listItem: "flex items-start justify-between p-2 bg-muted rounded text-xs",
    emptyState: "text-sm text-muted-foreground text-center py-4",
    infoPanel: "p-2 bg-muted rounded text-xs"
  }
} as const;

// Helper functions for dynamic styling
export const getCardStyle = () => cardPanelStyles.card.base;

// Generic indicator style getter - accepts any color from the indicators palette
export const getIndicatorStyle = (color: keyof typeof cardPanelStyles.indicators) => {
  return cardPanelStyles.indicators[color] || cardPanelStyles.indicators.gray;
};

// Generic level-based style mapping - can be used for severity, confidence, priority, etc.
export const getLevelStyle = (
  level: string,
  mapping: Record<string, keyof typeof cardPanelStyles.indicators> & { default?: keyof typeof cardPanelStyles.indicators }
) => {
  const normalizedLevel = level.toLowerCase();
  const colorKey = mapping[normalizedLevel] || mapping.default || 'gray';
  return getIndicatorStyle(colorKey);
};

// Predefined common mappings for convenience
export const severityMapping = { high: 'red', medium: 'orange', low: 'yellow', default: 'blue' } as const;
export const confidenceMapping = { high: 'green', medium: 'blue', low: 'gray', default: 'gray' } as const;
export const priorityMapping = { high: 'red', medium: 'yellow', low: 'green', default: 'gray' } as const;
export const statusMapping = { success: 'green', warning: 'yellow', error: 'red', info: 'blue', default: 'gray' } as const;

// Convenience functions using predefined mappings
export const getSeverityStyle = (level: string) => getLevelStyle(level, severityMapping);
export const getConfidenceStyle = (level: string) => getLevelStyle(level, confidenceMapping);
export const getPriorityStyle = (level: string) => getLevelStyle(level, priorityMapping);
export const getStatusStyle = (status: string) => getLevelStyle(status, statusMapping);

// Helper function for content list item styling
export const getContentListItemStyle = () => cardPanelStyles.content.listItem;

// Helper function for timestamp formatting
export const formatTimestamp = (timestamp: number) => {
  const minutes = Math.floor(timestamp / 60);
  const seconds = (timestamp % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

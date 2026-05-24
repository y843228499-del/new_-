
// === AI / Copilot Types ===

export interface CopilotInsight {
  id: string;
  type: 'info' | 'warn' | 'error' | 'tip';
  title: string;
  description: string;
  technicalDetails?: string; 
  timestamp: number;
  isRead: boolean;
  suggestedAction?: { label: string, actionType: string, payload?: any };
}

export interface AICapability {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  requiresConfirmation: boolean;
  params: { name: string; type: string; description: string }[];
}

export interface AIAction {
  type: string;
  label: string;
  payload?: any;
}

export interface AIResponse {
  text: string;
  action?: AIAction;
  relatedTopics?: string[];
  debugInfo?: {
    confidence: number;
    matchedTool?: string;
    source: string;
  };
}

export interface KnowledgeItem {
  id: string;
  question: string;
  answer: string;
  tags: string[];
}

export interface PendingAIAction {
  type: string;
  description: string;
  data: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  timestamp: number;
  insight?: CopilotInsight;
  action?: AIAction;
  relatedTopics?: string[];
  debugInfo?: {
    confidence: number;
    matchedTool?: string;
    source: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
}

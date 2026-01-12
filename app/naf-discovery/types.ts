export interface Message {
  role: 'assistant' | 'user';
  content: string;
}

export enum NAFBlock {
  Discovery = 'discovery',
  Assessment = 'assessment',
  Roadmap = 'roadmap',
}

export interface AssessmentState {
  currentBlock: NAFBlock;
  responses: Record<string, string>;
  completed: boolean;
}

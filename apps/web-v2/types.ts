
export type ProjectStatus = 'Rendered' | 'Processing' | 'Draft';
export type Theme = 'light' | 'dark' | 'navy';

export interface Project {
  id: string;
  name: string;
  code: string;
  status: ProjectStatus;
  blocks: number;
  lastModified: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}

export interface Course {
  id: string;
  title: string;
  thumbnail: string;
  rating: number;
  reviews: number;
  views: string;
  lessons: number;
  instructor: {
    name: string;
    role: string;
    avatar: string;
  };
  students: string;
  price: string;
  oldPrice?: string;
  category?: string;
  duration?: string;
}

export interface LessonBlock {
  id: string;
  number: string;
  title: string;
  duration: string;
  status: 'Ready' | 'Image Pending' | 'Editing Now' | 'Empty';
  thumbnail: string;
  originalText: string;
  narratedText: string;
  voiceId?: string;
  onScreenText: {
    title: string;
    bullets: string[];
  };
  imagePrompt: {
    prompt: string;
    avoid: string;
    seedText: string;
    seedNumber: number;
  };
  audioUrl?: string;
  generatedImageUrl?: string;
}

export interface Module {
  id: string;
  title: string;
  isOpen?: boolean;
  lessons: LessonBlock[];
}

export interface Template {
  id: string;
  name: string;
  previewColor: string;
  fontFamily: string;
  layout: 'centered' | 'split' | 'overlay';
}

export interface Voice {
  name: string;
  voice_id: string;
  preview_url: string;
  // Metadata fields for filtering
  gender?: 'male' | 'female';
  age_group?: 'child' | 'young' | 'adult' | 'elderly';
}

// Support & Notification Types
export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Waiting for Reply';

export interface TicketMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'user' | 'support' | 'system';
  content: string;
  timestamp: string;
  attachments?: string[]; // URLs
}

export interface Ticket {
  id: string;
  number: string;
  subject: string;
  category: string;
  status: TicketStatus;
  lastUpdated: string;
  messages: TicketMessage[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'ticket_reply' | 'system' | 'alert';
  relatedTicketId?: string;
}

export type ViewType = 'dashboard' | 'editor' | 'courses' | 'modules' | 'course-editor' | 'module-editor' | 'module-container-editor' | 'library' | 'profile' | 'billing' | 'settings' | 'security' | 'help';


import { Project, LessonBlock, Course, Template, Module } from './types';

export const PROJECTS: Project[] = [
  {
    id: '1',
    name: 'Intro to UI/UX Principles',
    code: 'VZ-9921-2023',
    status: 'Rendered',
    blocks: 42,
    lastModified: '2 mins ago',
    icon: 'movie_filter',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
  },
  {
    id: '2',
    name: 'Advanced React Design Patterns',
    code: 'VZ-8104-2024',
    status: 'Processing',
    blocks: 128,
    lastModified: '1 hour ago',
    icon: 'auto_fix_high',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
];

export const COURSES: Course[] = [
  {
    id: 'c1',
    title: 'Quantum Physics for Beginners',
    thumbnail: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=800&auto=format&fit=crop',
    rating: 4.8,
    reviews: 120,
    views: '10.5k',
    lessons: 12,
    instructor: {
      name: 'Dr. Alice Smith',
      role: 'Physics Professor',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop',
    },
    students: '1.5k',
    price: '$49',
    oldPrice: '$79',
    category: 'Science',
    duration: '24 Hours'
  },
  {
    id: 'c2',
    title: 'Create 3D With Blender',
    thumbnail: 'https://images.unsplash.com/photo-1617791160536-598cf32026fb?q=80&w=800&auto=format&fit=crop',
    rating: 4.9,
    reviews: 85,
    views: '5.2k',
    lessons: 16,
    instructor: {
      name: 'John Doe',
      role: '3D Artist',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop',
    },
    students: '800',
    price: '$400',
    oldPrice: '$550',
    category: 'Design',
    duration: '48 Hours'
  },
  {
    id: 'c3',
    title: 'Slicing UI Design With Tailwind',
    thumbnail: 'https://images.unsplash.com/photo-1587620962725-abab7fe55159?q=80&w=800&auto=format&fit=crop',
    rating: 4.7,
    reviews: 210,
    views: '15k',
    lessons: 30,
    instructor: {
      name: 'Sarah Lee',
      role: 'Frontend Dev',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=150&auto=format&fit=crop',
    },
    students: '3.2k',
    price: '$100',
    category: 'Code',
    duration: '48 Hours'
  }
];

export const LESSON_BLOCKS: LessonBlock[] = [
  {
    id: 'b1',
    number: '1.1',
    title: 'Welcome to Quantum World',
    duration: '02:15',
    status: 'Ready',
    thumbnail: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=400&auto=format&fit=crop',
    originalText: "Welcome to this course on Quantum Physics.",
    narratedText: "Welcome to this comprehensive course...",
    onScreenText: { title: "Introduction", bullets: ["Objectives"] },
    imagePrompt: { prompt: "Abstract particles", avoid: "text", seedText: "q1", seedNumber: 1 },
    animationPrompt: { prompt: "Slow cinematic particle movement.", motion: "gentle drift", camera: "slow push-in", durationHint: "4-6 seconds" },
    directionNotes: { notes: "Keep the scene abstract and educational." },
    soundEffectPrompt: { prompt: "", timing: "", avoid: "" },
    generatedImageUrl: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=800&auto=format&fit=crop"
  },
];

export const COURSE_MODULES: Module[] = [
  {
    id: 'm1',
    title: 'Module 1: Introduction to Physics',
    lessons: [
      {
        id: 'l1',
        number: '1.1',
        title: 'Welcome to Quantum World',
        duration: '02:15',
        status: 'Ready',
        thumbnail: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=400&auto=format&fit=crop',
        originalText: "...",
        narratedText: "...",
        onScreenText: { title: "Intro", bullets: [] },
        imagePrompt: { prompt: "", avoid: "", seedText: "", seedNumber: 0 },
        animationPrompt: { prompt: "", motion: "", camera: "", durationHint: "" },
        directionNotes: { notes: "" },
        soundEffectPrompt: { prompt: "", timing: "", avoid: "" }
      },
      {
        id: 'l2',
        number: '1.2',
        title: 'The History of Subatomic Particles',
        duration: '05:30',
        status: 'Ready',
        thumbnail: 'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?q=80&w=400&auto=format&fit=crop',
        originalText: "...",
        narratedText: "...",
        onScreenText: { title: "History", bullets: [] },
        imagePrompt: { prompt: "", avoid: "", seedText: "", seedNumber: 0 },
        animationPrompt: { prompt: "", motion: "", camera: "", durationHint: "" },
        directionNotes: { notes: "" },
        soundEffectPrompt: { prompt: "", timing: "", avoid: "" }
      }
    ]
  },
  {
    id: 'm2',
    title: 'Module 2: Quantum Mechanics Core',
    lessons: [
      {
        id: 'l3',
        number: '2.1',
        title: 'Understanding Wave-Particle Duality',
        duration: '12:45',
        status: 'Editing Now',
        thumbnail: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=400&auto=format&fit=crop',
        originalText: "...",
        narratedText: "...",
        onScreenText: { title: "Duality", bullets: [] },
        imagePrompt: { prompt: "", avoid: "", seedText: "", seedNumber: 0 },
        animationPrompt: { prompt: "", motion: "", camera: "", durationHint: "" },
        directionNotes: { notes: "" },
        soundEffectPrompt: { prompt: "", timing: "", avoid: "" }
      }
    ]
  }
];

export const TEMPLATES: Template[] = [
  { id: 't1', name: 'Modern Dark', previewColor: 'bg-slate-900', fontFamily: 'Inter', layout: 'split' },
  { id: 't2', name: 'Clean Light', previewColor: 'bg-white', fontFamily: 'Inter', layout: 'centered' },
];

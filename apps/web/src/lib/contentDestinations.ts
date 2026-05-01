export type Destination =
  | 'youtube'
  | 'youtube_shorts'
  | 'tiktok'
  | 'instagram_reels'
  | 'instagram_feed'
  | 'facebook_feed'
  | 'facebook_video'
  | 'course';

export const DESTINATIONS: Array<{ value: Destination; label: string; hint: string }> = [
  { value: 'youtube', label: 'YouTube', hint: 'Long video' },
  { value: 'youtube_shorts', label: 'Shorts', hint: 'Vertical cut' },
  { value: 'tiktok', label: 'TikTok', hint: 'Vertical' },
  { value: 'instagram_reels', label: 'Reels', hint: 'Vertical' },
  { value: 'instagram_feed', label: 'Instagram Feed', hint: 'Image/video' },
  { value: 'facebook_feed', label: 'Facebook Feed', hint: 'Image/feed' },
  { value: 'facebook_video', label: 'Facebook Video', hint: 'Video/feed' },
  { value: 'course', label: 'Course', hint: 'Lesson' }
];

export const DEFAULT_PROJECT_DESTINATIONS: Destination[] = ['youtube', 'youtube_shorts', 'instagram_reels'];

export function formatDestination(value: string): string {
  const knownDestination = DESTINATIONS.find((destination) => destination.value === value);
  if (knownDestination) return knownDestination.label;
  return value.replace(/_/g, ' ');
}

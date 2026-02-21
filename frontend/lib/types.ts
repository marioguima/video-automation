export type TtsChunk = {
  chunk_id: string;
  text: string;
  chars: number;
  estimated_duration_sec: number;
};

export type ManifestBlock = {
  block_id: string;
  paragraph_id: string;
  source_text: string;
  source_span: { start: number; end: number };
  image_prompt: string;
  tts_chunks: TtsChunk[];
  estimated_duration_sec: number;
};

export type Paragraph = {
  paragraph_id: string;
  text: string;
};

export type Manifest = {
  schema_version: string;
  script: string;
  paragraphs: Paragraph[];
  blocks: ManifestBlock[];
};

export type Validation = {
  valid: boolean;
  errors: string[];
};

export type ManifestResponse = {
  manifest: Manifest;
  validation: Validation;
};

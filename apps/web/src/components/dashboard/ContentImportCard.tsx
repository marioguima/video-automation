import React, { useRef, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { Button } from '../ui/button';

type ContentImportDraft = {
  title?: string;
  sourceText: string;
};

type ContentImportCardProps = {
  onImportContent: (draft: ContentImportDraft) => void;
};

function titleFromFile(file: File, raw: string): string {
  const heading = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));
  if (heading) return heading.replace(/^#\s+/, '').trim() || 'Novo conteúdo';
  return file.name.replace(/\.(md|markdown|txt)$/i, '').trim() || 'Novo conteúdo';
}

const ContentImportCard: React.FC<ContentImportCardProps> = ({ onImportContent }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    const isTextFile =
      file.name.toLowerCase().endsWith('.md') ||
      file.name.toLowerCase().endsWith('.txt') ||
      file.type === 'text/markdown' ||
      file.type === 'text/plain';

    if (!isTextFile) {
      setErrorText('Invalid file. Please upload a .md or .txt file.');
      return;
    }

    setIsImporting(true);
    setErrorText(null);
    try {
      const raw = await file.text();
      const sourceText = raw.trim();
      if (!sourceText) throw new Error('The selected file is empty.');
      onImportContent({
        title: titleFromFile(file, sourceText),
        sourceText
      });
    } catch (err) {
      setErrorText((err as Error).message || 'Failed to import content.');
    } finally {
      setIsImporting(false);
    }
  };

  const openFileDialog = () => {
    if (isImporting) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isImporting) return;
    const file = event.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  };

  return (
    <div
      className={`border-2 border-dashed flex flex-col items-center justify-center text-center transition-all p-6 rounded-[5px] ${
        isDragging ? 'border-primary bg-muted/60' : 'hover:border-primary/50 hover:bg-muted/50'
      } ${isImporting ? 'cursor-wait' : 'cursor-pointer'}`}
      onClick={openFileDialog}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!isImporting) setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openFileDialog();
        }
      }}
      aria-disabled={isImporting}
      aria-label="Import content"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt,text/markdown,text/plain"
        className="hidden"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0] ?? null;
          input.value = '';
          if (file) void handleFile(file);
        }}
      />

      <div className="w-12 h-12 bg-muted rounded-[5px] flex items-center justify-center mb-3 self-center">
        {isImporting ? (
          <Loader2 size={24} className="animate-spin text-primary" />
        ) : (
          <UploadCloud size={24} className="text-muted-foreground" />
        )}
      </div>

      <h4 className="font-bold mb-1">Import Content</h4>
      <p className="text-xs text-muted-foreground mb-3 max-w-[200px] self-center">
        Use a .md or .txt as content.
      </p>

      <Button
        variant="outline"
        size="sm"
        disabled={isImporting}
        className="self-center min-w-[128px]"
        onClick={(event) => {
          event.stopPropagation();
          openFileDialog();
        }}
      >
        {isImporting ? 'Importing...' : 'Choose File'}
      </Button>

      {errorText && <p className="text-xs mt-4 text-red-600">{errorText}</p>}
    </div>
  );
};

export default ContentImportCard;

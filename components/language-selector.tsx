'use client';

import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LanguageSelectorProps {
  sourceLanguage: string;
  targetLanguage: string;
  onTargetLanguageChange: (language: string) => void;
  isTranslating?: boolean;
  translationProgress?: number;
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
];

export function LanguageSelector({
  sourceLanguage,
  targetLanguage,
  onTargetLanguageChange,
  isTranslating = false,
  translationProgress = 0,
}: LanguageSelectorProps) {
  const sourceLang = LANGUAGES.find((l) => l.code === sourceLanguage);
  const targetLang = LANGUAGES.find((l) => l.code === targetLanguage);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition-all dark:border-slate-700 dark:bg-slate-800',
        isTranslating && 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950'
      )}
      role="region"
      aria-label="Language translation controls"
    >
      <Languages className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      
      <span className="font-medium text-slate-700 dark:text-slate-200">
        {sourceLang?.name ?? sourceLanguage.toUpperCase()}
      </span>
      
      <span className="text-slate-400 dark:text-slate-500">→</span>
      
      <select
        value={targetLanguage}
        onChange={(e) => onTargetLanguageChange(e.target.value)}
        disabled={isTranslating}
        className={cn(
          'rounded border-none bg-transparent font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:text-slate-200',
          isTranslating && 'cursor-not-allowed opacity-60'
        )}
        aria-label="Select target language for translation"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
      
      {isTranslating && (
        <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">
          {Math.round(translationProgress)}%
        </span>
      )}
    </div>
  );
}

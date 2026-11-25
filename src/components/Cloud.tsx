import type { CSSProperties } from 'react';
import type { CloudWord } from '@/lib/cloud';
import { translate, type Language, type MessageKey } from '@/lib/i18n';

type Props = {
  words: CloudWord[];
  language: Language;
  selected: string | null;
  onSelect: (name: string | null) => void;
  emptyText: string;
  ariaLabel: string;
};

export function Cloud({ words, language, selected, onSelect, emptyText, ariaLabel }: Props) {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translate(language, key, values);

  if (!words.length) {
    return <p className="empty-inline">{emptyText}</p>;
  }

  return (
    <div className="cloud" role="group" aria-label={ariaLabel}>
      {words.map((word) => {
        const isSelected = selected === word.name;
        return (
          <button
            key={word.name}
            type="button"
            className={isSelected ? 'cloud-word is-selected' : 'cloud-word'}
            style={{ '--word-size': `${word.size}px`, color: word.color } as CSSProperties}
            aria-pressed={isSelected}
            aria-label={t('cloud.wordAria', { name: word.name, count: word.count })}
            title={t('cloud.wordTitle', { name: word.name, count: word.count })}
            onClick={() => onSelect(isSelected ? null : word.name)}
          >
            {word.name}
          </button>
        );
      })}
    </div>
  );
}

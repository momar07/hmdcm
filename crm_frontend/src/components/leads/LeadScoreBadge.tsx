import type { LeadClassification } from '@/types/leads';

interface Props {
  score: number;
  classification: LeadClassification;
}

const CLASS_STYLE: Record<LeadClassification, string> = {
  none:     'bg-gray-100 text-gray-600',
  cold:     'bg-blue-100 text-blue-700',
  warm:     'bg-yellow-100 text-yellow-700',
  hot:      'bg-orange-100 text-orange-700',
  very_hot: 'bg-red-100 text-red-700',
};

const CLASS_LABEL: Record<LeadClassification, string> = {
  none:     '—',
  cold:     '🧊 Cold',
  warm:     '🌤 Warm',
  hot:      '🔥 Hot',
  very_hot: '🌋 Very Hot',
};

export default function LeadScoreBadge({ score, classification }: Props) {
  return (
    <div className="flex items-center gap-2">
      {/* Score circle */}
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center
        text-sm font-bold border-2
        ${score >= 70 ? 'border-red-400 bg-red-50 text-red-700' :
          score >= 40 ? 'border-yellow-400 bg-yellow-50 text-yellow-700' :
                        'border-gray-300 bg-gray-50 text-gray-600'}
      `}>
        {score}
      </div>
      {/* Classification badge */}
      <span className={`
        px-2 py-0.5 rounded-full text-xs font-medium
        ${CLASS_STYLE[classification]}
      `}>
        {CLASS_LABEL[classification]}
      </span>
    </div>
  );
}

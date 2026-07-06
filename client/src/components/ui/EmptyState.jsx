import { Link } from 'react-router-dom';

export default function EmptyState({
  icon = '🎬',
  title = 'Nothing here yet',
  description = 'Content will appear once it\'s added.',
  actionLabel,
  actionTo,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-xl font-semibold text-netflix-text mb-2">{title}</h3>
      <p className="text-netflix-text-2 max-w-md mb-6">{description}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn-primary">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

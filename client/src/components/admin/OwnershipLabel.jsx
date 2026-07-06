export default function OwnershipLabel({ createdBy, users = [] }) {
  if (!createdBy) {
    return <span className="text-netflix-text-3 text-xs">System</span>;
  }

  const owner = users.find(u => u._id === createdBy || u._id === createdBy._id);

  if (owner) {
    return (
      <span className="text-netflix-text-2 text-xs">
        {owner.username || owner.displayName || 'Unknown'}
      </span>
    );
  }

  // Show ID if owner not in loaded users list
  const idStr = typeof createdBy === 'string' ? createdBy : createdBy._id || '';
  return (
    <span className="text-netflix-text-3 text-xs" title={idStr}>
      {idStr.slice(0, 8)}...
    </span>
  );
}

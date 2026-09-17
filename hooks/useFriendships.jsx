// hooks/useFriendships.jsx
// DEPRECATED: The `friendships` table has been removed.
// This file re-exports from useConnections.jsx for backward compatibility.
// All logic now queries `connections` and `interactions` tables.
export { useConnections as useFriendships, useConnections } from './useConnections';
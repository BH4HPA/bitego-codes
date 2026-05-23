import { useAdminWsStore } from '../store/adminWs';

export function useAdminTableConnCounts() {
  const counts = useAdminWsStore((s) => s.tableConnCounts);
  const connected = useAdminWsStore((s) => s.connected);
  return { counts, connected };
}

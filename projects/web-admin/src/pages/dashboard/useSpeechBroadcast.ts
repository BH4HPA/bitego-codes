import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminWsStore } from '../../store/adminWs';

const STORAGE_KEY = 'bitego_admin_broadcast';

export function useSpeechBroadcast() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');
  const [subtitle, setSubtitle] = useState('');
  const queueRef = useRef<Array<{ id: string; text: string }>>([]);
  const speakingRef = useRef(false);
  const lastSeenSeqRef = useRef(0);
  const notifSeq = useAdminWsStore((s) => s.notificationSeq);
  const lastNotif = useAdminWsStore((s) => s.lastNotification);

  const playNext = useCallback(() => {
    if (speakingRef.current || !queueRef.current.length) return;
    const next = queueRef.current.shift();
    if (!next) return;
    speakingRef.current = true;
    setSubtitle(next.text);
    const synth = window.speechSynthesis;
    if (!synth) {
      speakingRef.current = false;
      return;
    }
    const u = new SpeechSynthesisUtterance(next.text);
    u.lang = 'zh-CN';
    u.rate = 1;
    u.onend = () => {
      speakingRef.current = false;
      playNext();
    };
    u.onerror = () => {
      speakingRef.current = false;
      playNext();
    };
    synth.speak(u);
  }, []);

  const enqueue = useCallback(
    (text: string) => {
      const t = String(text || '').trim();
      if (!t) return;
      queueRef.current.push({ id: `${Date.now()}_${Math.random()}`, text: t });
      playNext();
    },
    [playNext],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    if (enabled) return;
    queueRef.current = [];
    speakingRef.current = false;
    setSubtitle('');
    window.speechSynthesis?.cancel();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!notifSeq || notifSeq === lastSeenSeqRef.current) return;
    lastSeenSeqRef.current = notifSeq;
    const n = lastNotif;
    if (!n) return;
    const table = n.tableCode || '';
    if (n.type === 'ORDER_CREATED') enqueue(`${table || '桌台'}有新订单`);
    else if (n.type === 'REFUND_REQUESTED') enqueue(`${table || '桌台'}有退款申请`);
    else enqueue(`${n.title || '通知'}：${n.message || ''}`);
  }, [enabled, enqueue, lastNotif, notifSeq]);

  return { enabled, setEnabled, subtitle };
}

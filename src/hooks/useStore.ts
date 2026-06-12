import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import type { Evidence, CourtOrder, Violation, Event, CaseProfile, Report, PlayerDossierRecord } from '../types';

// ─── Evidence ─────────────────────────────────────────────────────

export function useEvidenceStore() {
  const [items, setItems] = useState<Evidence[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const data = await invoke<Evidence[]>('get_evidence');
    setItems(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    invoke<Evidence[]>('get_evidence').then(data => {
      setItems(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const add = useCallback(async (item: Evidence) => {
    await invoke('save_evidence', { item });
    setItems(prev => [item, ...prev]);
  }, []);

  const remove = useCallback(async (id: string) => {
    await invoke('delete_evidence', { id });
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const update = useCallback(async (id: string, updates: Partial<Evidence>) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, ...updates };
    await invoke('save_evidence', { item: updated });
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, [items]);

  const get = useCallback((id: string) => items.find(i => i.id === id), [items]);

  return { items, add, remove, update, get, refresh, loaded };
}

// ─── Court Orders ─────────────────────────────────────────────────

export function useOrderStore() {
  const [items, setItems] = useState<CourtOrder[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<CourtOrder[]>('get_court_orders').then(data => {
      setItems(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const add = useCallback(async (item: CourtOrder) => {
    await invoke('save_court_order', { item });
    setItems(prev => [item, ...prev]);
  }, []);

  const remove = useCallback(async (id: string) => {
    await invoke('delete_court_order', { id });
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const update = useCallback(async (id: string, updates: Partial<CourtOrder>) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, ...updates };
    await invoke('save_court_order', { item: updated });
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, [items]);

  const get = useCallback((id: string) => items.find(i => i.id === id), [items]);

  return { items, add, remove, update, get, loaded };
}

// ─── Violations ───────────────────────────────────────────────────

export function useViolationStore() {
  const [items, setItems] = useState<Violation[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<Violation[]>('get_violations').then(data => {
      setItems(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const add = useCallback(async (item: Violation) => {
    await invoke('save_violation', { item });
    setItems(prev => [item, ...prev]);
  }, []);

  const remove = useCallback(async (id: string) => {
    await invoke('delete_violation', { id });
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const update = useCallback(async (id: string, updates: Partial<Violation>) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, ...updates };
    await invoke('save_violation', { item: updated });
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, [items]);

  const getByOrder = useCallback((orderId: string) => items.filter(i => i.orderId === orderId), [items]);

  return { items, add, remove, update, getByOrder, loaded };
}

// ─── Events ───────────────────────────────────────────────────────

export function useEventStore() {
  const [items, setItems] = useState<Event[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<Event[]>('get_events').then(data => {
      setItems(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const add = useCallback(async (item: Event) => {
    await invoke('save_event', { item });
    setItems(prev => [item, ...prev]);
  }, []);

  const remove = useCallback(async (id: string) => {
    await invoke('delete_event', { id });
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const update = useCallback(async (id: string, updates: Partial<Event>) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, ...updates };
    await invoke('save_event', { item: updated });
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, [items]);

  return { items, add, remove, update, loaded };
}

// ─── Profile ──────────────────────────────────────────────────────

const DEFAULT_PROFILE: CaseProfile = {
  id: 'default',
  caseName: '',
  clientName: '',
  opposingParty: '',
  attorneyName: '',
  attorneyPhone: '',
  attorneyEmail: '',
  courtName: '',
  docketNumber: '',
  caseType: 'Family Law - Custody',
  notes: '',
  updatedAt: new Date().toISOString(),
};

export function useProfileStore() {
  const [profile, setProfile] = useState<CaseProfile>(DEFAULT_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<CaseProfile | null>('get_profile').then(data => {
      if (data) setProfile(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const update = useCallback(async (updates: Partial<CaseProfile>) => {
    const updated = { ...profile, ...updates, updatedAt: new Date().toISOString() };
    await invoke('save_profile', { profile: updated });
    setProfile(updated);
  }, [profile]);

  return { profile, update, loaded };
}

// ─── Reports ──────────────────────────────────────────────────────

export function useReportStore() {
  const [items, setItems] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<Report[]>('get_reports').then(data => {
      setItems(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const add = useCallback(async (item: Report) => {
    await invoke('save_report', { item });
    setItems(prev => [item, ...prev]);
  }, []);

  const remove = useCallback(async (id: string) => {
    await invoke('delete_report', { id });
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  return { items, add, remove, loaded };
}

// ─── Players Dossier ─────────────────────────────────────────────

export function usePlayersStore() {
  const [items, setItems] = useState<PlayerDossierRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const data = await invoke<PlayerDossierRecord[]>('get_players_dossier');
    setItems(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    invoke<PlayerDossierRecord[]>('get_players_dossier').then(data => {
      setItems(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const add = useCallback(async (item: PlayerDossierRecord) => {
    await invoke('save_player_dossier', { item });
    setItems(prev => [item, ...prev]);
  }, []);

  const remove = useCallback(async (id: string) => {
    await invoke('delete_player_dossier', { id });
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const update = useCallback(async (id: string, updates: Partial<PlayerDossierRecord>) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated: PlayerDossierRecord = {
      ...item,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await invoke('save_player_dossier', { item: updated });
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, [items]);

  const get = useCallback((id: string) => items.find(i => i.id === id), [items]);

  return { items, add, remove, update, get, refresh, loaded };
}

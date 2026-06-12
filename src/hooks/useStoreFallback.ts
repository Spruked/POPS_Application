import { useState, useEffect, useCallback } from 'react';
import type { Evidence, CourtOrder, Violation, Event, CaseProfile, Report } from '../types';

const STORAGE_KEYS = {
  evidence: 'pop_evidence',
  orders: 'pop_orders',
  violations: 'pop_violations',
  events: 'pop_events',
  profile: 'pop_profile',
  reports: 'pop_reports',
};

function load<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function useEvidenceStore() {
  const [items, setItems] = useState<Evidence[]>(() => load(STORAGE_KEYS.evidence, []));
  useEffect(() => { save(STORAGE_KEYS.evidence, items); }, [items]);
  const add = useCallback((item: Evidence) => setItems(prev => [item, ...prev]), []);
  const remove = useCallback((id: string) => setItems(prev => prev.filter(i => i.id !== id)), []);
  const update = useCallback((id: string, updates: Partial<Evidence>) => 
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i)), []);
  const get = useCallback((id: string) => items.find(i => i.id === id), [items]);
  return { items, add, remove, update, get, loaded: true };
}

export function useOrderStore() {
  const [items, setItems] = useState<CourtOrder[]>(() => load(STORAGE_KEYS.orders, []));
  useEffect(() => { save(STORAGE_KEYS.orders, items); }, [items]);
  const add = useCallback((item: CourtOrder) => setItems(prev => [item, ...prev]), []);
  const remove = useCallback((id: string) => setItems(prev => prev.filter(i => i.id !== id)), []);
  const update = useCallback((id: string, updates: Partial<CourtOrder>) => 
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i)), []);
  const get = useCallback((id: string) => items.find(i => i.id === id), [items]);
  return { items, add, remove, update, get, loaded: true };
}

export function useViolationStore() {
  const [items, setItems] = useState<Violation[]>(() => load(STORAGE_KEYS.violations, []));
  useEffect(() => { save(STORAGE_KEYS.violations, items); }, [items]);
  const add = useCallback((item: Violation) => setItems(prev => [item, ...prev]), []);
  const remove = useCallback((id: string) => setItems(prev => prev.filter(i => i.id !== id)), []);
  const update = useCallback((id: string, updates: Partial<Violation>) => 
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i)), []);
  const getByOrder = useCallback((orderId: string) => items.filter(i => i.orderId === orderId), [items]);
  return { items, add, remove, update, getByOrder, loaded: true };
}

export function useEventStore() {
  const [items, setItems] = useState<Event[]>(() => load(STORAGE_KEYS.events, []));
  useEffect(() => { save(STORAGE_KEYS.events, items); }, [items]);
  const add = useCallback((item: Event) => setItems(prev => [item, ...prev]), []);
  const remove = useCallback((id: string) => setItems(prev => prev.filter(i => i.id !== id)), []);
  const update = useCallback((id: string, updates: Partial<Event>) => 
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i)), []);
  return { items, add, remove, update, loaded: true };
}

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
  const [profile, setProfile] = useState<CaseProfile>(() => load(STORAGE_KEYS.profile, DEFAULT_PROFILE));
  useEffect(() => { save(STORAGE_KEYS.profile, profile); }, [profile]);
  const update = useCallback((updates: Partial<CaseProfile>) => 
    setProfile(prev => ({ ...prev, ...updates, updatedAt: new Date().toISOString() })), []);
  return { profile, update, loaded: true };
}

export function useReportStore() {
  const [items, setItems] = useState<Report[]>(() => load(STORAGE_KEYS.reports, []));
  useEffect(() => { save(STORAGE_KEYS.reports, items); }, [items]);
  const add = useCallback((item: Report) => setItems(prev => [item, ...prev]), []);
  const remove = useCallback((id: string) => setItems(prev => prev.filter(i => i.id !== id)), []);
  return { items, add, remove, loaded: true };
}

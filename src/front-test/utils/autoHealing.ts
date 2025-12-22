import fs from 'fs';
import path from 'path';
import type { Locator, Page } from '@playwright/test';

// NOTE:
// - This module is intentionally framework-agnostic: it does not depend on Cucumber World.
// - Reporting integration is done by exposing an in-memory queue that hooks can attach.

export type AutoHealingMode = 'off' | 'learn' | 'heal' | 'on';

type HealEvent = {
  at: string;
  action: string;
  original: string;
  healedWith: string;
  note?: string;
};

type Candidate = {
  locator: SerializableLocator;
  createdAt: string;
  lastSuccessAt?: string;
  successes: number;
  failures: number;
};

type HistoryEntry = {
  original: SerializableLocator;
  lastSnapshotAt?: string;
  candidates: Candidate[];
};

type HistoryFile = {
  schemaVersion: 1;
  generatedAt: string;
  entries: Record<string, HistoryEntry>;
};

// We keep a tiny runtime cache to reduce disk IO.
let historyCache: HistoryFile | null = null;
let historyDirty = false;

// Debounced flush to avoid frequent JSON.stringify / disk writes during a test run.
let scheduledFlush: NodeJS.Timeout | null = null;

// Healing events to be attached per-step by Cucumber hooks.
const healEventsQueue: HealEvent[] = [];

// -----------------------------
// Config
// -----------------------------

const getMode = (): AutoHealingMode => {
  const raw = (process.env.K0LMENA_AUTO_HEALING ?? 'off').trim().toLowerCase();
  if (raw === 'off' || raw === 'learn' || raw === 'heal' || raw === 'on') return raw;
  return 'off';
};

const isLearnEnabled = () => {
  const mode = getMode();
  return mode === 'learn' || mode === 'on';
};

const isHealEnabled = () => {
  const mode = getMode();
  return mode === 'heal' || mode === 'on';
};

const getHistoryPath = () => {
  const p = process.env.K0LMENA_AUTO_HEALING_HISTORY_PATH?.trim();
  const defaultRel = path.join('.k0lmena', 'auto-healing', 'front-history.json');
  const finalPath = p && p.length > 0 ? p : defaultRel;
  return path.isAbsolute(finalPath) ? finalPath : path.join(process.cwd(), finalPath);
};

const getMaxCandidates = () => {
  const v = Number(process.env.K0LMENA_AUTO_HEALING_MAX_CANDIDATES ?? '12');
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 12;
};

const getCandidateTimeoutMs = () => {
  const v = Number(process.env.K0LMENA_AUTO_HEALING_CANDIDATE_TIMEOUT_MS ?? '1500');
  return Number.isFinite(v) && v >= 200 ? Math.floor(v) : 1500;
};

// IMPORTANT:
// Learning uses a DOM snapshot (evaluate) to generate alternative locators.
// If the element disappears quickly after an action (e.g. click triggers navigation),
// a plain locator.evaluate() can wait up to Playwright's default timeout (commonly 30s).
// To keep test runs fast, snapshots must be best-effort and bounded by a small timeout.
const getSnapshotTimeoutMs = () => {
  const v = Number(process.env.K0LMENA_AUTO_HEALING_SNAPSHOT_TIMEOUT_MS ?? '250');
  // Keep it small on purpose; learning is optional and should never block runs.
  if (!Number.isFinite(v)) return 250;
  const ms = Math.floor(v);
  if (ms < 50) return 50;
  if (ms > 2000) return 2000;
  return ms;
};

const isVerboseLogEnabled = () => {
  return (process.env.K0LMENA_AUTO_HEALING_LOG ?? '0').trim() === '1';
};

// Lightweight console output when a heal happens (even if verbose logs are off).
// This keeps the signal high: it prints ONLY when a locator was actually healed.
const isHealConsoleEnabled = () => {
  return (process.env.K0LMENA_AUTO_HEALING_CONSOLE ?? '1').trim() === '1';
};

type FlushMode = 'immediate' | 'debounced' | 'onEnd';

const getFlushMode = (): FlushMode => {
  const raw = (process.env.K0LMENA_AUTO_HEALING_FLUSH ?? 'debounced').trim().toLowerCase();
  if (raw === 'immediate' || raw === 'debounced' || raw === 'onend') return raw === 'onend' ? 'onEnd' : (raw as FlushMode);
  return 'debounced';
};

const shouldWritePrettyJson = (): boolean => {
  return (process.env.K0LMENA_AUTO_HEALING_WRITE_PRETTY ?? '0').trim() === '1';
};

const log = (...args: any[]) => {
  if (!isVerboseLogEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[k0lmena:auto-healing]', ...args);
};

const logHealToConsole = (original: string, healedWith: string) => {
  if (!isHealConsoleEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(`[k0lmena:auto-healing] HEALED: ${original} -> ${healedWith}`);
};

// -----------------------------
// Public API for reporting
// -----------------------------

export const consumeHealingEvents = (): HealEvent[] => {
  if (healEventsQueue.length === 0) return [];
  const copy = healEventsQueue.splice(0, healEventsQueue.length);
  return copy;
};

export const flushHealingHistory = async () => {
  if (!historyCache || !historyDirty) return;
  if (scheduledFlush) {
    clearTimeout(scheduledFlush);
    scheduledFlush = null;
  }
  const historyPath = getHistoryPath();
  const dir = path.dirname(historyPath);
  await fs.promises.mkdir(dir, { recursive: true });
  historyCache.generatedAt = new Date().toISOString();
  const pretty = shouldWritePrettyJson();
  const json = pretty ? JSON.stringify(historyCache, null, 2) : JSON.stringify(historyCache);
  await fs.promises.writeFile(historyPath, json, 'utf-8');
  historyDirty = false;
};

const scheduleFlush = () => {
  const mode = getFlushMode();
  if (mode === 'onEnd') return; // only flush in AfterAll
  if (mode === 'immediate') {
    // Fire and forget; hooks will await a final flush.
    void flushHealingHistory();
    return;
  }
  // Debounce
  if (scheduledFlush) return;
  scheduledFlush = setTimeout(() => {
    scheduledFlush = null;
    void flushHealingHistory();
  }, 1500);
  // Do not keep Node event loop alive
  scheduledFlush.unref?.();
};

// -----------------------------
// Locator serialization
// -----------------------------

export type SerializableLocator =
  | { kind: 'role'; role: Parameters<Page['getByRole']>[0]; name?: string; exact?: boolean }
  | { kind: 'testId'; testId: string }
  | { kind: 'placeholder'; placeholder: string }
  | { kind: 'label'; label: string }
  | { kind: 'text'; text: string }
  | { kind: 'css'; css: string }
  | { kind: 'xpath'; xpath: string };

export type LocatorInputForHealing =
  | { role: Parameters<Page['getByRole']>[0]; name?: string | RegExp; exact?: boolean }
  | { testId: string }
  | { placeholder: string }
  | { label: string | RegExp }
  | { text: string | RegExp }
  | { css: string }
  | { xpath: string };

export const isSerializableLocatorInput = (input: any): input is LocatorInputForHealing => {
  if (!input || typeof input !== 'object') return false;
  if ('locator' in input) return false;
  if ('role' in input) return true;
  if ('testId' in input) return true;
  if ('placeholder' in input) return true;
  if ('label' in input) return true;
  if ('text' in input) return true;
  if ('css' in input) return true;
  if ('xpath' in input) return true;
  return false;
};

const toSerializable = (input: LocatorInputForHealing): SerializableLocator | null => {
  if ('role' in input) {
    return {
      kind: 'role',
      role: input.role,
      name: input.name instanceof RegExp ? input.name.source : typeof input.name === 'string' ? input.name : undefined,
      exact: input.exact,
    };
  }
  if ('testId' in input) return { kind: 'testId', testId: input.testId };
  if ('placeholder' in input) return { kind: 'placeholder', placeholder: input.placeholder };
  if ('label' in input) {
    const label = input.label instanceof RegExp ? input.label.source : String(input.label);
    return { kind: 'label', label };
  }
  if ('text' in input) {
    const text = input.text instanceof RegExp ? input.text.source : String(input.text);
    return { kind: 'text', text };
  }
  if ('css' in input) return { kind: 'css', css: input.css };
  if ('xpath' in input) return { kind: 'xpath', xpath: input.xpath };
  return null;
};

const toHumanString = (loc: SerializableLocator): string => {
  switch (loc.kind) {
    case 'role':
      return `role=${String(loc.role)} name=${loc.name ?? ''}${loc.exact ? ' (exact)' : ''}`.trim();
    case 'testId':
      return `testId=${loc.testId}`;
    case 'placeholder':
      return `placeholder=${loc.placeholder}`;
    case 'label':
      return `label=${loc.label}`;
    case 'text':
      return `text=${loc.text}`;
    case 'css':
      return `css=${loc.css}`;
    case 'xpath':
      return `xpath=${loc.xpath}`;
  }
};

const keyOf = (loc: SerializableLocator): string => {
  // Stable key for history indexing.
  return JSON.stringify(loc);
};

const pageLocatorFromSerializable = (page: Page, loc: SerializableLocator): Locator => {
  switch (loc.kind) {
    case 'role':
      return page.getByRole(loc.role, { name: loc.name, exact: loc.exact });
    case 'testId':
      return page.getByTestId(loc.testId);
    case 'placeholder':
      return page.getByPlaceholder(loc.placeholder);
    case 'label':
      return page.getByLabel(loc.label);
    case 'text':
      return page.getByText(loc.text);
    case 'css':
      return page.locator(loc.css);
    case 'xpath':
      return page.locator(`xpath=${loc.xpath}`);
  }
};

// -----------------------------
// History IO
// -----------------------------

const loadHistory = async (): Promise<HistoryFile> => {
  if (historyCache) return historyCache;
  const historyPath = getHistoryPath();
  try {
    const raw = await fs.promises.readFile(historyPath, 'utf-8');
    const parsed = JSON.parse(raw) as HistoryFile;
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.entries) throw new Error('Invalid history format');
    historyCache = parsed;
    return parsed;
  } catch {
    const fresh: HistoryFile = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      entries: {},
    };
    historyCache = fresh;
    historyDirty = true;
    return fresh;
  }
};

const upsertEntry = async (original: SerializableLocator): Promise<HistoryEntry> => {
  const history = await loadHistory();
  const k = keyOf(original);
  if (!history.entries[k]) {
    history.entries[k] = { original, candidates: [] };
    historyDirty = true;
  }
  return history.entries[k];
};

const upsertCandidate = (entry: HistoryEntry, candidateLoc: SerializableLocator) => {
  const max = getMaxCandidates();
  const now = new Date().toISOString();
  const key = keyOf(candidateLoc);
  const existing = entry.candidates.find(c => keyOf(c.locator) === key);
  if (!existing) {
    entry.candidates.unshift({ locator: candidateLoc, createdAt: now, successes: 0, failures: 0 });
  }
  // Trim to max
  if (entry.candidates.length > max) {
    entry.candidates = entry.candidates.slice(0, max);
  }
  entry.lastSnapshotAt = now;
  historyDirty = true;
};

// -----------------------------
// DOM snapshot & candidate generation
// -----------------------------

type DomSnapshot = {
  tag: string;
  id?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  dataTestId?: string;
  dataTest?: string;
  dataQa?: string;
  dataCy?: string;
  roleAttr?: string;
  text?: string;
  cssPath?: string;
  stableClassSelector?: string;
};

const safeTrim = (s?: string | null, max = 80): string | undefined => {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
};

const snapshotLocator = async (locator: Locator): Promise<DomSnapshot | null> => {
  // IMPORTANT: this must be best-effort and bounded. Never wait the full Playwright default timeout.
  const snapshotTimeoutMs = getSnapshotTimeoutMs();
  let handle: any = null;
  try {
    // Grab a handle quickly (small timeout) so we don't keep the event loop waiting.
    handle = await locator.first().elementHandle({ timeout: snapshotTimeoutMs }).catch(() => null);
    if (!handle) return null;

    const snap = await handle.evaluate((el: Element) => {
      const e = el as HTMLElement;
      const getAttr = (n: string) => (e.getAttribute(n) ?? undefined);

      const stableClassSelector = (() => {
        const raw = (e.getAttribute('class') ?? '').trim();
        if (!raw) return undefined;
        const classes = raw
          .split(/\s+/)
          .map(c => c.trim())
          .filter(Boolean)
          // Filter likely-dynamic classes (hashes, numeric suffixes, long tokens)
          .filter(c => !/[0-9]{3,}/.test(c) && c.length <= 32 && !/[a-f0-9]{8,}/i.test(c));
        if (classes.length === 0) return undefined;
        return '.' + classes.slice(0, 3).join('.');
      })();

      const cssPath = (() => {
        const cssEscape = (v: string) => {
          // Minimal CSS escaping; enough for common IDs.
          return v.replace(/([ #;?%&,.+*~\':!^$\[\]()=>|\/\\])/g, '\\$1');
        };

        const pathParts: string[] = [];
        let cur: Element | null = e;
        while (cur && cur.nodeType === Node.ELEMENT_NODE) {
          const tag = cur.tagName.toLowerCase();
          const id = (cur as HTMLElement).id;
          if (id) {
            pathParts.unshift(`${tag}#${cssEscape(id)}`);
            break;
          }
          const parent = cur.parentElement;
          if (!parent) {
            pathParts.unshift(tag);
            break;
          }
          const siblings = Array.from(parent.children).filter(x => x.tagName === cur!.tagName);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(cur) + 1;
            pathParts.unshift(`${tag}:nth-of-type(${idx})`);
          } else {
            pathParts.unshift(tag);
          }
          cur = parent;
        }
        return pathParts.join(' > ');
      })();

      const text = (() => {
        const t = (e.innerText ?? e.textContent ?? '').replace(/\s+/g, ' ').trim();
        return t.length ? t.slice(0, 120) : undefined;
      })();

      return {
        tag: e.tagName.toLowerCase(),
        id: e.id || undefined,
        name: getAttr('name'),
        placeholder: getAttr('placeholder'),
        ariaLabel: getAttr('aria-label'),
        dataTestId: getAttr('data-testid'),
        dataTest: getAttr('data-test'),
        dataQa: getAttr('data-qa'),
        dataCy: getAttr('data-cy'),
        roleAttr: getAttr('role'),
        text,
        cssPath,
        stableClassSelector,
      } as const;
    });

    // Post-process to keep values small & stable.
    return {
      tag: snap.tag,
      id: safeTrim(snap.id, 64),
      name: safeTrim(snap.name, 64),
      placeholder: safeTrim(snap.placeholder, 80),
      ariaLabel: safeTrim(snap.ariaLabel, 80),
      dataTestId: safeTrim(snap.dataTestId, 80),
      dataTest: safeTrim(snap.dataTest, 80),
      dataQa: safeTrim(snap.dataQa, 80),
      dataCy: safeTrim(snap.dataCy, 80),
      roleAttr: safeTrim(snap.roleAttr, 40),
      text: safeTrim(snap.text, 80),
      cssPath: safeTrim(snap.cssPath, 220),
      stableClassSelector: safeTrim(snap.stableClassSelector, 120),
    };
  } catch {
    return null;
  } finally {
    // Dispose handle to avoid leaks.
    if (handle) {
      await handle.dispose().catch(() => undefined);
    }
  }
};

const inferRole = (snap: DomSnapshot): Parameters<Page['getByRole']>[0] | null => {
  // Best-effort inference: prefer explicit role attr; fall back to tag.
  if (snap.roleAttr) return snap.roleAttr as any;
  switch (snap.tag) {
    case 'button':
      return 'button';
    case 'a':
      return 'link';
    case 'input':
      return 'textbox';
    case 'select':
      return 'combobox';
    default:
      return null;
  }
};

const buildCandidatesFromSnapshot = (snap: DomSnapshot): SerializableLocator[] => {
  const out: SerializableLocator[] = [];

  const pushUnique = (c: SerializableLocator | null | undefined) => {
    if (!c) return;
    const k = keyOf(c);
    if (!out.some(x => keyOf(x) === k)) out.push(c);
  };

  // Highest signal / stability first.
  if (snap.dataTestId) pushUnique({ kind: 'testId', testId: snap.dataTestId });
  if (snap.dataTest) pushUnique({ kind: 'css', css: `[data-test="${snap.dataTest}"]` });
  if (snap.dataQa) pushUnique({ kind: 'css', css: `[data-qa="${snap.dataQa}"]` });
  if (snap.dataCy) pushUnique({ kind: 'css', css: `[data-cy="${snap.dataCy}"]` });
  if (snap.id) pushUnique({ kind: 'css', css: `#${snap.id}` });
  if (snap.name) pushUnique({ kind: 'css', css: `[name="${snap.name}"]` });
  if (snap.ariaLabel) pushUnique({ kind: 'css', css: `[aria-label="${snap.ariaLabel}"]` });
  if (snap.placeholder) pushUnique({ kind: 'placeholder', placeholder: snap.placeholder });
  if (snap.text) pushUnique({ kind: 'text', text: snap.text });
  if (snap.stableClassSelector && snap.tag) pushUnique({ kind: 'css', css: `${snap.tag}${snap.stableClassSelector}` });
  if (snap.cssPath) pushUnique({ kind: 'css', css: snap.cssPath });

  // Role + accessible name (best effort).
  const role = inferRole(snap);
  if (role && snap.text) {
    pushUnique({ kind: 'role', role: role as any, name: snap.text, exact: true });
    pushUnique({ kind: 'role', role: role as any, name: snap.text, exact: false });
  }

  return out;
};

// -----------------------------
// Core algorithm
// -----------------------------

const isProbablyNotFoundError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  // Playwright timeout / not found signals
  return (
    /Timeout/i.test(msg) ||
    /waiting for/i.test(msg) ||
    /strict mode violation/i.test(msg) ||
    /locator\./i.test(msg)
  );
};

const rankCandidates = (cands: Candidate[]): Candidate[] => {
  // Higher score first: successes - failures, then recency.
  const score = (c: Candidate) => {
    const base = c.successes - c.failures;
    const recency = c.lastSuccessAt ? Date.parse(c.lastSuccessAt) : 0;
    return base * 1_000_000_000_000 + recency;
  };
  return [...cands].sort((a, b) => score(b) - score(a));
};

export const learnFromLocator = async (page: Page, originalInput: LocatorInputForHealing, usedLocator: Locator) => {
  if (!isLearnEnabled()) return;
  const original = toSerializable(originalInput);
  if (!original) return;
  const snap = await snapshotLocator(usedLocator);
  if (!snap) return;

  const entry = await upsertEntry(original);
  const candidates = buildCandidatesFromSnapshot(snap);
  for (const c of candidates) upsertCandidate(entry, c);

  // Ensure the original itself is also a candidate (helps ranking/metrics)
  upsertCandidate(entry, original);

  log('learn', toHumanString(original), 'candidates=', entry.candidates.length);

  // Avoid flushing on every action; batch writes to reduce end-of-run delays.
  scheduleFlush();
};

export const tryHeal = async <T>(
  page: Page,
  originalInput: LocatorInputForHealing,
  actionName: string,
  actionFn: (loc: Locator, timeoutMs: number) => Promise<T>,
  baseTimeoutMs: number,
  originalError: unknown
): Promise<{ healed: true; value: T; locator: Locator } | { healed: false }> => {
  if (!isHealEnabled()) return { healed: false };
  if (!isProbablyNotFoundError(originalError)) return { healed: false };

  const original = toSerializable(originalInput);
  if (!original) return { healed: false };

  const history = await loadHistory();
  const entry = history.entries[keyOf(original)];
  if (!entry || entry.candidates.length === 0) return { healed: false };

  const candidateTimeout = Math.min(baseTimeoutMs, getCandidateTimeoutMs());

  const ranked = rankCandidates(entry.candidates);
  log('heal:start', toHumanString(original), `candidates=${ranked.length}`);

  for (const cand of ranked) {
    const human = toHumanString(cand.locator);
    try {
      const loc = pageLocatorFromSerializable(page, cand.locator);
      const v = await actionFn(loc, candidateTimeout);

      // Success: update stats
      cand.successes += 1;
      cand.lastSuccessAt = new Date().toISOString();
      historyDirty = true;

      // Promote the successful candidate near the front
      entry.candidates = [cand, ...entry.candidates.filter(x => keyOf(x.locator) !== keyOf(cand.locator))];
      if (entry.candidates.length > getMaxCandidates()) entry.candidates = entry.candidates.slice(0, getMaxCandidates());
      historyDirty = true;

      // Report
      healEventsQueue.push({
        at: new Date().toISOString(),
        action: actionName,
        original: toHumanString(original),
        healedWith: human,
        note: 'Auto-healing applied: locator was updated using execution history.',
      });

      // Console signal (high value, low noise): print only when a heal actually occurs.
      logHealToConsole(toHumanString(original), human);

      log('heal:success', toHumanString(original), '=>', human);
      scheduleFlush();
      return { healed: true, value: v, locator: loc };
    } catch (err) {
      cand.failures += 1;
      historyDirty = true;
      log('heal:fail', toHumanString(original), 'candidate=', human, 'err=', err instanceof Error ? err.message : String(err));
      // Continue to next candidate
    }
  }

  scheduleFlush();
  return { healed: false };
};

const DB_NAME = 'rl_replay_analyzer_db';
const DB_VERSION = 1;
const STORE_NAME = 'replays_history';
const MAX_HISTORY_ITEMS = 20;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getUniqueReplayKey(analysis) {
  const meta = analysis?.meta || {};
  if (meta.replayId) return String(meta.replayId);
  return `${meta.fileName || 'replay'}_${meta.date || ''}_${meta.team0Score}-${meta.team1Score}`;
}

/**
 * Guarda una replay analizada en el IndexedDB local del navegador del usuario.
 * Si ya existía esa misma replay, actualiza su fecha de acceso.
 * Mantiene como máximo las 20 replays diferentes más recientes.
 */
export async function saveReplayToHistory(analysis) {
  if (!analysis || !analysis.meta) return;
  try {
    const db = await openDB();
    const id = getUniqueReplayKey(analysis);
    const meta = analysis.meta;

    const bluePlayers = (analysis.players || []).filter(p => p.team === 0).map(p => p.name);
    const orangePlayers = (analysis.players || []).filter(p => p.team === 1).map(p => p.name);

    const record = {
      id,
      savedAt: Date.now(),
      summary: {
        id,
        replayName: meta.replayName || meta.fileName,
        fileName: meta.fileName,
        mapName: meta.mapName,
        modeLabel: meta.modeLabel,
        date: meta.date,
        team0Score: meta.team0Score,
        team1Score: meta.team1Score,
        livePlaySeconds: meta.livePlaySeconds,
        forfeit: meta.forfeit,
        bluePlayers,
        orangePlayers,
      },
      analysis,
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await pruneOldReplays(db);
    db.close();
  } catch (err) {
    console.warn('No se pudo guardar la replay en el historial local:', err);
  }
}

async function pruneOldReplays(db) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const items = getAllReq.result || [];
      if (items.length <= MAX_HISTORY_ITEMS) {
        resolve();
        return;
      }
      items.sort((a, b) => b.savedAt - a.savedAt);
      const toDelete = items.slice(MAX_HISTORY_ITEMS);
      for (const item of toDelete) {
        store.delete(item.id);
      }
      resolve();
    };
    getAllReq.onerror = () => resolve();
  });
}

/**
 * Devuelve la lista de las últimas 20 replays guardadas (ordenadas de más reciente a más antigua).
 */
export async function getReplayHistoryList() {
  try {
    const db = await openDB();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();

    items.sort((a, b) => b.savedAt - a.savedAt);
    return items.slice(0, MAX_HISTORY_ITEMS).map(item => ({
      ...item.summary,
      savedAt: item.savedAt,
    }));
  } catch (err) {
    console.warn('Error leyendo historial de replays:', err);
    return [];
  }
}

/**
 * Carga el análisis completo de una replay guardada por su ID.
 */
export async function loadReplayFromHistory(id) {
  const db = await openDB();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record?.analysis || null;
}

/**
 * Elimina una replay concreta del historial del usuario.
 */
export async function deleteReplayFromHistory(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Vacía todo el historial local del usuario.
 */
export async function clearReplayHistory() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}


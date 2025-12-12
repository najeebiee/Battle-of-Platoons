import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

export function listenAgents(cb, onError) {
  const q = query(collection(db, "agents"), orderBy("name", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export async function upsertAgent(agentId, data) {
  const ref = doc(db, "agents", agentId);

  // check if doc exists (so createdAt is not overwritten)
  const existing = await getDoc(ref);

  const payload = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
}

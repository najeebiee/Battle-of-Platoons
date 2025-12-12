import { collection, doc, onSnapshot, orderBy, query, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export function listenDepots(cb, onError) {
  const q = query(collection(db, "depots"), orderBy("name", "asc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export async function upsertDepot(id, data) {
  await setDoc(doc(db, "depots", id), { ...data, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
}

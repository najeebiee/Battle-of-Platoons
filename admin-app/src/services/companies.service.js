import { collection, doc, onSnapshot, orderBy, query, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export function listenCompanies(cb, onError) {
  const q = query(collection(db, "companies"), orderBy("name", "asc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export async function upsertCompany(id, data) {
  await setDoc(doc(db, "companies", id), { ...data, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
}

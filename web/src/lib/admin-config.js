// The owner's Firebase user ID, injected at build time (GitHub secret
// ADMIN_UID; web/.env.local for local dev). It only decides which buttons
// show; firestore.rules is what actually stops anyone else editing the Vault.
const env = import.meta.env ?? {}
export const ADMIN_UID = env.VITE_ADMIN_UID ?? ''

// ============================================================
// Utilitaires DOM (recherche dans le Shadow DOM)
// Responsable : Personne 1
// ============================================================

// 2. RECHERCHE SHADOW DOM
function querySelectorAllDeep(selector, root = document) {
  let results = Array.from(root.querySelectorAll(selector));
  const allElements = root.querySelectorAll('*');
  for (const el of allElements) {
    if (el.shadowRoot) {
      results = results.concat(querySelectorAllDeep(selector, el.shadowRoot));
    }
  }
  return results;
}

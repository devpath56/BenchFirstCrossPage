// A "symptom signature" describes the PROBLEM, not the page identity — so a fix
// learned on one page can be retrieved for any other page with the same problem.
// Deliberately coarse: two different pages with a large per-row-update list get
// the same signature, which is exactly what makes cross-page transfer work.
export function signature(profile) {
  const size = profile.rowCount >= 1000 ? 'large' : 'small';
  return `${profile.interaction}:${size}-list`;
}

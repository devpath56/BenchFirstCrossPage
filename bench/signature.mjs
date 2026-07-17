// A "symptom signature" names the PERFORMANCE PROBLEM CLASS, not the page identity —
// so a fix learned on one page transfers to any other page with the same class.
//
// The two DMV pages (Registration, Appointments) both suffer a request WATERFALL
// (`interaction: 'waterfall-load'`), so they key to the SAME signature and the
// `parallel` fix transfers between them BY DESIGN — not by an accidental collapse.
// Component count differs per page (Registration 7, Appointments 5); that is
// page-specific size and is deliberately NOT part of the transfer key.
export function signature(profile) {
  return profile.interaction || 'unknown';
}

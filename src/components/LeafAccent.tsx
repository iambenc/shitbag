// Small decorative leaf glyph for empty states — currentColor-based (color
// set by the caller via a text-(--token) className), not an icon-library
// dependency. Purely decorative, so aria-hidden; the empty-state text next
// to it always carries the actual meaning.
export function LeafAccent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 3c5.2 1.6 8 5.7 8 10a8 8 0 0 1-16 0c0-4.3 2.8-8.4 8-10z"
        fill="currentColor"
      />
      <path d="M12 7v13" stroke="white" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export default function RootLoading() {
  return (
    <div
      style={{
        minHeight: "40vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-secondary)",
        fontSize: "0.9rem",
      }}
      aria-live="polite"
      aria-busy="true"
    >
      Loading…
    </div>
  );
}

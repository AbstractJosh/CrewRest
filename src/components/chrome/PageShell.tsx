export default function PageShell({
  width = "default",
  children,
}: {
  width?: "default" | "narrow";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mx-auto w-full px-6 py-10 ${width === "narrow" ? "max-w-xl" : "max-w-4xl"}`}
    >
      {children}
    </div>
  );
}

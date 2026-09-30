/** Shortlist wordmark: list-mark SVG + Geist semibold name. */
import Link from "next/link";

function Mark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="3" y="11" width="13" height="1.25" rx="0.4" fill="currentColor" opacity="0.55" />
      <rect x="3" y="16.5" width="8" height="1.25" rx="0.4" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export function Logo({
  href = "/jobs",
  size = "md",
  className = "",
}: {
  href?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: { mark: "size-5", text: "text-base", gap: "gap-1.5" },
    md: { mark: "size-6", text: "text-lg", gap: "gap-2" },
    lg: { mark: "size-9", text: "text-4xl sm:text-5xl", gap: "gap-3" },
  }[size];

  const inner = (
    <span
      className={`inline-flex items-center font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 ${sizes.gap} ${sizes.text} ${className}`}
    >
      <Mark className={sizes.mark} />
      Shortlist
    </span>
  );

  if (href == null) return inner;
  return (
    <Link href={href} className="inline-flex no-underline">
      {inner}
    </Link>
  );
}

export function LogoMark({ className = "size-6" }: { className?: string }) {
  return <Mark className={className} />;
}
